async function generateReasons(metrics, decision) {
  const prompt = `You are a credit risk assistant. Given these metrics, write 3-5 short reasons (plain English, one sentence each) explaining why the risk is ${decision.risk} and the recommendation is ${decision.recommendation}.

Metrics:
- Repayment score: ${metrics.repayment_score}/100
- Outstanding amount: ₹${metrics.outstanding_amount}
- Available credit: ₹${metrics.available_credit}
- Credit utilization: ${(metrics.credit_utilization * 100).toFixed(0)}%
- Current order value: ₹${metrics.current_order_value}
- Previous orders: ${metrics.previous_orders}
- Recent late payments (last 5): ${metrics.recent_late_payments}

Respond ONLY with a JSON array of strings, nothing else. Example: ["reason 1", "reason 2", "reason 3"]`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
    });

    const data = await response.json();
    const raw = data.choices[0].message.content.trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const reasons = JSON.parse(cleaned);

    if (!Array.isArray(reasons)) throw new Error('Not an array');
    return reasons;

  } catch (err) {
    console.error('LLM call failed, using fallback reasons:', err.message);
    return fallbackReasons(metrics, decision);
  }
}

function fallbackReasons(metrics, decision) {
  const reasons = [];
  reasons.push(`Repayment score is ${metrics.repayment_score}/100.`);
  reasons.push(`Credit utilization is at ${(metrics.credit_utilization * 100).toFixed(0)}%.`);
  if (metrics.recent_late_payments > 0) {
    reasons.push(`${metrics.recent_late_payments} of the last 5 payments were late.`);
  }
  if (metrics.current_order_value > metrics.available_credit) {
    reasons.push(`Order value exceeds available credit by ₹${(metrics.current_order_value - metrics.available_credit).toFixed(2)}.`);
  }
  return reasons;
}

module.exports = { generateReasons };