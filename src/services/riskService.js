const pool = require('../db/pool');

async function computeRiskMetrics(dealerId, orderId) {
  const dealerResult = await pool.query(
    'SELECT credit_limit, repayment_score FROM dealers WHERE id = $1',
    [dealerId]
  );
  if (dealerResult.rows.length === 0) throw new Error('Dealer not found');
  const { credit_limit, repayment_score } = dealerResult.rows[0];

  const ledgerResult = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'order_placed' THEN amount ELSE 0 END), 0) AS total_ordered,
       COALESCE(SUM(CASE WHEN type = 'payment_received' THEN amount ELSE 0 END), 0) AS total_paid
     FROM ledger WHERE dealer_id = $1`,
    [dealerId]
  );
  const outstanding_amount = Number(ledgerResult.rows[0].total_ordered) - Number(ledgerResult.rows[0].total_paid);

  const orderCountResult = await pool.query(
    'SELECT COUNT(*) FROM orders WHERE dealer_id = $1',
    [dealerId]
  );

  const paymentsResult = await pool.query(
    'SELECT days_late FROM payments WHERE dealer_id = $1 ORDER BY payment_date DESC LIMIT 5',
    [dealerId]
  );
  const recent_late_payments = paymentsResult.rows.filter(p => p.days_late > 0).length;

  const available_credit = Number(credit_limit) - outstanding_amount;
  const credit_utilization = credit_limit > 0 ? outstanding_amount / Number(credit_limit) : 0;

  return {
    repayment_score,
    outstanding_amount,
    available_credit,
    credit_utilization: Number(credit_utilization.toFixed(2)),
    previous_orders: Number(orderCountResult.rows[0].count),
    recent_late_payments
  };
}

function computeDecision(metrics) {
  const { repayment_score, credit_utilization, recent_late_payments } = metrics;

  if (repayment_score < 30 || recent_late_payments >= 3) {
    return { risk: 'HIGH', recommendation: 'REJECT' };
  }
  if (credit_utilization > 0.7 || repayment_score < 60 || recent_late_payments >= 1) {
    return { risk: 'MEDIUM', recommendation: 'MANUAL_REVIEW' };
  }
  return { risk: 'LOW', recommendation: 'APPROVE' };
}

module.exports = { computeRiskMetrics, computeDecision };