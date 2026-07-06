const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET /warehouses — any authenticated user can see the list
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM warehouses ORDER BY id'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /warehouses/:id/inventory — view stock for one warehouse
router.get('/:id/inventory', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT i.id, i.product_id, p.name, p.category, p.wholesale_price, i.quantity
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       WHERE i.warehouse_id = $1
       ORDER BY p.name`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /warehouses/:id/inventory — restock (insert or update) — distributor only
router.post('/:id/inventory', verifyToken, requireRole('distributor'), async (req, res) => {
  const { id } = req.params; // warehouse_id
  const { product_id, quantity } = req.body; // quantity = units being ADDED

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM inventory WHERE warehouse_id = $1 AND product_id = $2',
      [id, product_id]
    );

    let updatedRow;
    if (existing.rows.length > 0) {
      const result = await client.query(
        `UPDATE inventory SET quantity = quantity + $1
         WHERE warehouse_id = $2 AND product_id = $3
         RETURNING *`,
        [quantity, id, product_id]
      );
      updatedRow = result.rows[0];
    } else {
      const result = await client.query(
        `INSERT INTO inventory (warehouse_id, product_id, quantity)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, product_id, quantity]
      );
      updatedRow = result.rows[0];
    }

    await client.query(
      `INSERT INTO stock_log (warehouse_id, product_id, change_type, quantity_change, reference_id)
       VALUES ($1, $2, 'restocked', $3, NULL)`,
      [id, product_id, quantity]
    );

    await client.query('COMMIT');
    res.status(201).json(updatedRow);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;