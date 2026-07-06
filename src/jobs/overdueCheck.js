const cron = require('node-cron');
const pool = require('../db/pool');

function startOverdueCheck() {
  cron.schedule('0 0 * * *', async () => {
    try {
      const result = await pool.query(`
        UPDATE orders o
        SET status = 'overdue'
        WHERE o.status = 'approved'
          AND o.due_date < CURRENT_DATE
          AND o.total_amount > COALESCE(
            (SELECT SUM(amount) FROM payments p WHERE p.order_id = o.id), 0
          )
        RETURNING o.id
      `);

      console.log(`Overdue check ran: ${result.rowCount} order(s) flagged`, result.rows.map(r => r.id));
    } catch (err) {
      console.error('Overdue check failed:', err);
    }
  });
}

module.exports = startOverdueCheck;