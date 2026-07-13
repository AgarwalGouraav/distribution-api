# Distribution API

A B2B order management and credit risk system, built for a real regional clock distribution business (~50 dealers across India) that previously ran entirely on WhatsApp and Excel.

Dealers place bulk orders online. The distributor reviews each order against the dealer's outstanding balance and repayment history before approving. Approved orders auto-deduct stock from the correct warehouse, payments are tracked in installments, and every stock/money movement is logged in an append-only audit trail.

---

## Why this project

This isn't a generic CRUD tutorial project. It's modeled directly on my father's actual clock distribution business — the entities (dealers, warehouses, credit limits, repayment behavior) and the workflow (order → approval → warehouse assignment → installment payments) mirror how the business really operates today on paper and WhatsApp.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express | Standard, well-understood, minimal ceremony |
| Database | PostgreSQL | Relational data (orders, payments, ledger) with real foreign-key integrity |
| DB access | `pg` (raw SQL, no ORM) | Considered Prisma, rejected it — every query is something I wrote and can explain line-by-line in an interview |
| Auth | JWT, role-based (dealer / distributor) | Stateless, no server-side session store needed at this scale |
| Frontend | Plain HTML/CSS/JS | No React — kept deliberately simple since the project's depth is backend, not frontend |
| Hosting | Render (backend) + Supabase (Postgres) | Free tier that doesn't hard-delete data on inactivity (unlike Render's own Postgres, which does after 30 days) |
| AI (one feature only) | Groq (`llama-3.1-8b-instant`) | Generates plain-English *explanations* for a credit risk score that is computed deterministically — the LLM never makes the actual decision |

---

## Core Features

- **Dealer portal:** browse catalog with live stock (state-matched warehouse), place multi-item orders, view account statement (orders + payment history + running balance)
- **Distributor dashboard:** single approval queue showing every pending order, each dealer's outstanding balance, and an on-demand credit risk read-out before approving or rejecting
- **Warehouse assignment:** on approval, stock is auto-assigned from the dealer's own state if available, else the first warehouse with sufficient stock for every line item — a simple rule, not a routing algorithm
- **Repayment score:** each dealer has a 0–100 score, recalculated as the average of their last 3 payments (on-time = 100, late = `max(0, 100 - days_late × 5)`); new dealers default to 50
- **AI credit risk advisor:** hard-threshold rules on repayment score + credit utilization decide risk/recommendation; an LLM only writes the human-readable reasoning behind an already-made decision, with a templated fallback if the LLM call fails
- **Ledger:** append-only audit trail of every order placed and payment received — the single source of truth for "what does this dealer owe"
- **Stock log:** append-only record of every stock change (sale, restock) with a reference back to the order that caused it

---

## Database Schema

10 tables: `users`, `dealers`, `products`, `warehouses`, `inventory`, `orders`, `order_items`, `payments`, `ledger`, `stock_log`.

Key design decisions:
- **Price snapshot:** `order_items.unit_price` is copied from `products.wholesale_price` at order time, so historical orders keep their original price even if the catalog price later changes.
- **Nothing is reserved at order placement.** Stock is only deducted when the distributor approves — a pending order is just a request.
- **Money columns use `NUMERIC`, never `FLOAT`**, to avoid binary floating-point rounding errors on currency.

---

## Concurrency & Correctness

Order approval runs inside a single database transaction using `SELECT ... FOR UPDATE` row locks — first on the order row (so the same order can't be approved twice by two concurrent requests), then on each `inventory` row being deducted (so two different orders competing for the same stock can't both succeed past zero). Verified with real simultaneous requests via Postman, not just reasoned about.

---

## Known Limitations

Documented on purpose, not hidden:
- No split fulfillment — one order ships from exactly one warehouse; if no single warehouse can cover every line item, the order fails approval.
- Repayment score thresholds (40 / 70 / 0.8 utilization) are reasonable defaults, not statistically fitted — there isn't enough transaction history in a project this size to back-test them.
- `credit_limit = 0` is treated as 100% utilized (maximally risky) rather than dividing by zero or silently showing 0%.
- No soft-delete — hard deletes are acceptable at this scale.

---

## API Overview

| Method | Route | Access |
|---|---|---|
| POST | `/auth/register` | Public |
| POST | `/auth/login` | Public |
| GET | `/products` | Dealer / Distributor (branches by role) |
| POST | `/products` | Distributor |
| GET / POST | `/orders` | Dealer / Distributor |
| GET | `/orders/:id/items` | Dealer (own) / Distributor (any) |
| PUT | `/orders/:id/approve` | Distributor |
| PUT | `/orders/:id/reject` | Distributor |
| POST | `/payments` | Distributor |
| GET | `/dealers/me` | Dealer |
| GET | `/dealers/:id/balance` | Dealer (own) / Distributor (any) |
| GET | `/dealers/:id/ledger` | Dealer (own) / Distributor (any) |
| GET | `/dealers/:id/risk-analysis` | Distributor |
| GET / POST | `/warehouses`, `/warehouses/:id/inventory` | Distributor (write) |


---

## Running Locally

```bash
git clone <repo-url>
cd distribution-api
npm install
```

Create a `.env` file:
```
DATABASE_URL=postgres://...
JWT_SECRET=your-secret
GROQ_API_KEY=your-groq-key
PORT=3000
```

```bash
npm run dev
```

---

## What I'd Add With More Time

- Index foreign key columns for production-scale query performance
- Refactor the repeated dealer-ownership check (in `/balance` and `/ledger`) into shared middleware
- Auto-revert `overdue` orders back to `approved` via a payment-time check, in addition to the daily cron
