const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET /products — any logged-in user can view catalog
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products ORDER BY created_at DESC'
    );
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