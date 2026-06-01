# Architecture

> Read on demand. AGENTS.md is the router; this is the deeper map.

## Shape
Next.js 15 App Router full-stack app. Server components/route handlers talk to PostgreSQL
via Prisma and to Stripe (test mode) for checkout. No separate backend service —
keep it single-deployable until scale demands otherwise (M1/G-SIMPLE).

```
Browser ──HTTP──▶ Next.js (App Router)
                     ├─ Server Components / Route Handlers
                     │     ├─ Prisma ──▶ PostgreSQL (books, orders, inventory)
                     │     └─ Stripe SDK (TEST) ──▶ Stripe Checkout (hosted)
                     └─ Stripe webhook ──▶ /api/webhooks/stripe (verify sig → idempotent)
```

## Data model (`prisma/schema.prisma`)
- **Book** — slug, title, blurb, priceCents, coverUrl, stock, featured.
- **Order** — status (PENDING→PAID→FULFILLED / CANCELLED / REFUNDED), stripeSessionId,
  email (PII), totalCents, items.
- **OrderItem** — order×book, quantity, priceCents (price captured at purchase time).
- **ProcessedWebhook** — Stripe event-id ledger for idempotent webhook handling.

## Key flows
- **Browse:** `/` → `/catalog` (list) → `/books/:slug` (detail). Server-rendered for SEO + speed.
- **Cart:** client cart → server validates price/stock at checkout (never trust client totals — E4).
- **Checkout:** create Stripe **test** Checkout Session server-side → redirect → on
  `checkout.session.completed` webhook (signature-verified, deduped) mark Order PAID →
  confirmation page. Decline/cancel return paths preserve the cart.
- **Admin:** `/admin/books` create/edit; writes go through validation; production writes are
  approval-gated (`docs/SAFETY.md`).

## Where code lives
- `src/app/**` routes/UI · `src/lib/**` domain (env, guardrails, observability, db) ·
  `prisma/**` schema · `scripts/**` tools · `eval/**` eval harness · `tests/**` unit + e2e.

## Conventions
- Prices in **integer cents**; format at the edge. Money math never in floats.
- DB-touching code imports a single `src/lib/db.ts` PrismaClient wrapper (added with F002).
- Server validates all external input; client is untrusted.
