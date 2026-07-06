const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

// POST /orders — dealer places an order
router.post('/', verifyToken, requireRole('dealer'), async (req, res) => {
  const { items } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one item' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const dealerResult = await client.query(
      'SELECT id FROM dealers WHERE user_id = $1',
      [req.user.userId]
    );
    const dealerId = dealerResult.rows[0].id;

    const orderResult = await client.query(
      `INSERT INTO orders (dealer_id, status, total_amount)
       VALUES ($1, 'pending', 0)
       RETURNING id`,
      [dealerId]
    );
    const orderId = orderResult.rows[0].id;

    let totalAmount = 0;

    for (const item of items) {
      const productResult = await client.query(
        'SELECT wholesale_price FROM products WHERE id = $1',
        [item.product_id]
      );

      if (productResult.rows.length === 0) {
        throw new Error(`Product ${item.product_id} not found`);
      }

      const unitPrice = productResult.rows[0].wholesale_price;

      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.product_id, item.quantity, unitPrice]
      );

      totalAmount += unitPrice * item.quantity;
    }

    await client.query(
      'UPDATE orders SET total_amount = $1 WHERE id = $2',
      [totalAmount, orderId]
    );

    await client.query('COMMIT');

    res.status(201).json({ orderId, totalAmount, status: 'pending' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// GET /orders — dealer sees own orders, distributor sees all
router.get('/', verifyToken, async (req, res) => {
  try {
    let result;

    if (req.user.role === 'dealer') {
      result = await pool.query(
        `SELECT o.*, d.business_name
         FROM orders o
         JOIN dealers d ON d.id = o.dealer_id
         WHERE d.user_id = $1
         ORDER BY o.created_at DESC`,
        [req.user.userId]
      );
    } else {
      result = await pool.query(
        `SELECT o.*, d.business_name
         FROM orders o
         JOIN dealers d ON d.id = o.dealer_id
         ORDER BY o.created_at DESC`
      );
    }

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /orders/:id/approve — distributor only
router.put('/:id/approve', verifyToken, requireRole('distributor'), async (req, res) => {
  const orderId = req.params.id;
  const { warehouse_id, due_date } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (order.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Order already ${order.status}` });
    }

    const itemsResult = await client.query(
      `SELECT * FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    const items = itemsResult.rows;

    const dealerResult = await client.query(
      `SELECT state FROM dealers WHERE id = $1`,
      [order.dealer_id]
    );
    const dealerState = dealerResult.rows[0].state;

    let selectedWarehouseId = null;

    const warehousesResult = await client.query(
      `SELECT id, state FROM warehouses ORDER BY (state = $1) DESC`,
      [dealerState]
    );

    for (const warehouse of warehousesResult.rows) {
      let hasEnoughStock = true;

      for (const item of items) {
        const stockResult = await client.query(
          `SELECT quantity FROM inventory
           WHERE warehouse_id = $1 AND product_id = $2
           FOR UPDATE`,
          [warehouse.id, item.product_id]
        );

        if (stockResult.rows.length === 0 || stockResult.rows[0].quantity < item.quantity) {
          hasEnoughStock = false;
          break;
        }
      }

      if (hasEnoughStock) {
        selectedWarehouseId = warehouse.id;
        break;
      }
    }

    if (!selectedWarehouseId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No warehouse has enough stock for this order' });
    }

    for (const item of items) {
      await client.query(
        `UPDATE inventory SET quantity = quantity - $1
         WHERE warehouse_id = $2 AND product_id = $3`,
        [item.quantity, selectedWarehouseId, item.product_id]
      );

      await client.query(
        `INSERT INTO stock_log (warehouse_id, product_id, change_type, quantity_change, reference_id)
         VALUES ($1, $2, 'sold', $3, $4)`,
        [selectedWarehouseId, item.product_id, -item.quantity, orderId]
      );
    }

    await client.query(
      `UPDATE orders
       SET status = 'approved', warehouse_id = $1, due_date = $2, updated_at = NOW()
       WHERE id = $3`,
      [selectedWarehouseId, due_date, orderId]
    );

    await client.query(
      `INSERT INTO ledger (dealer_id, type, amount, reference_id)
       VALUES ($1, 'order_placed', $2, $3)`,
      [order.dealer_id, order.total_amount, orderId]
    );

    await client.query('COMMIT');
    res.json({ message: 'Order approved successfully', warehouse_id: selectedWarehouseId, due_date });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PUT /orders/:id/reject — distributor only
router.put('/:id/reject', verifyToken, requireRole('distributor'), async (req, res) => {
  const orderId = req.params.id;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (order.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Order already ${order.status}` });
    }

    await client.query(
      `UPDATE orders SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    await client.query('COMMIT');
    res.json({ message: 'Order rejected successfully' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;