const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

// POST /payments — distributor records a payment against an order
router.post('/', verifyToken, requireRole('distributor'), async (req, res) => {
  const { order_id, amount, payment_date, payment_mode, note } = req.body;

  if (!order_id || !amount || !payment_date) {
    return res.status(400).json({ error: 'order_id, amount, and payment_date are required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    let daysLate = 0;
    if (order.due_date) {
      const due = new Date(order.due_date);
      const paid = new Date(payment_date);
      const diffMs = paid - due;
      daysLate = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    }

    const paymentResult = await client.query(
      `INSERT INTO payments (dealer_id, order_id, amount, payment_date, days_late, payment_mode, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [order.dealer_id, order_id, amount, payment_date, daysLate, payment_mode, note]
    );
    const paymentId = paymentResult.rows[0].id;

    await client.query(
      `INSERT INTO ledger (dealer_id, type, amount, reference_id)
       VALUES ($1, 'payment_received', $2, $3)`,
      [order.dealer_id, amount, paymentId]
    );

    const recentPayments = await client.query(
      `SELECT days_late FROM payments
       WHERE dealer_id = $1
       ORDER BY payment_date DESC, id DESC
       LIMIT 3`,
      [order.dealer_id]
    );

    const scores = recentPayments.rows.map(p => {
      return p.days_late <= 0 ? 100 : Math.max(0, 100 - (p.days_late * 5));
    });

    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    await client.query(
      `UPDATE dealers SET repayment_score = $1 WHERE id = $2`,
      [avgScore, order.dealer_id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      paymentId,
      daysLate,
      newRepaymentScore: avgScore
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;