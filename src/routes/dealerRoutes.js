const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');
const { computeRiskMetrics, computeDecision } = require('../services/riskService');
const { generateReasons } = require('../services/llmService');

// GET /dealers/:id/balance
router.get('/:id/balance', verifyToken, async (req, res) => {
  const dealerId = req.params.id;

  try {
    if (req.user.role === 'dealer') {
      const check = await pool.query(
        'SELECT id FROM dealers WHERE id = $1 AND user_id = $2',
        [dealerId, req.user.userId]
      );
      if (check.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const result = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'order_placed' THEN amount ELSE 0 END), 0) AS total_ordered,
         COALESCE(SUM(CASE WHEN type = 'payment_received' THEN amount ELSE 0 END), 0) AS total_paid
       FROM ledger
       WHERE dealer_id = $1`,
      [dealerId]
    );

    const { total_ordered, total_paid } = result.rows[0];

    res.json({
      dealer_id: Number(dealerId),
      total_ordered: Number(total_ordered),
      total_paid: Number(total_paid),
      outstanding_balance: Number(total_ordered) - Number(total_paid)
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /dealers/:id/ledger
router.get('/:id/ledger', verifyToken, async (req, res) => {
  const dealerId = req.params.id;

  try {
    if (req.user.role === 'dealer') {
      const check = await pool.query(
        'SELECT id FROM dealers WHERE id = $1 AND user_id = $2',
        [dealerId, req.user.userId]
      );
      if (check.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const result = await pool.query(
      `SELECT id, type, amount, reference_id, created_at
       FROM ledger
       WHERE dealer_id = $1
       ORDER BY created_at DESC`,
      [dealerId]
    );

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const { computeRiskMetrics, computeDecision } = require('../services/riskService');
const { generateReasons } = require('../services/llmService');

// GET /dealers/:id/risk-analysis — distributor only
router.get('/:id/risk-analysis', verifyToken, requireRole('distributor'), async (req, res) => {
  const dealerId = req.params.id;
  try {
    const metrics = await computeRiskMetrics(dealerId);
    const decision = computeDecision(metrics);
    const reasons = await generateReasons(metrics, decision);

    res.json({
      risk: decision.risk,
      recommendation: decision.recommendation,
      reasons,
      metrics
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;