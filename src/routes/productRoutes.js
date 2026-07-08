const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET /products — any logged-in user can view catalog
router.get('/', verifyToken, async (req, res) => {
  try {
    if (req.user.role === 'dealer') {
      const dealerResult = await pool.query('SELECT state FROM dealers WHERE user_id = $1', [req.user.userId]);
      const dealerState = dealerResult.rows[0].state;

      const result = await pool.query(
        `SELECT DISTINCT ON (p.id)
           p.id, p.name, p.category, p.wholesale_price,
           i.quantity, w.state
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id
         LEFT JOIN warehouses w ON w.id = i.warehouse_id
         ORDER BY p.id, (w.state = $1) DESC, i.quantity DESC`,
        [dealerState]
      );
      return res.json(result.rows);
    }

    const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /products — only distributor can add a product
router.post('/', verifyToken, requireRole('distributor'), async (req, res) => {
  const { name, category, wholesale_price } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO products (name, category, wholesale_price)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, category, wholesale_price]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;