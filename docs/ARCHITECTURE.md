# Architecture

> Read on demand. AGENTS.md is the router; this is the deeper map.

## Shape
Next.js 15 App Router full-stack app. Server components/route handlers talk to PostgreSQL
via Prisma and to TossPayments (test/sandbox) for checkout. No separate backend service —
keep it single-deployable until scale demands otherwise (M1/G-SIMPLE).

```
Browser ──HTTP──▶ Next.js (App Router)
                     ├─ Server Components / Route Handlers
                     │     ├─ Prisma ──▶ PostgreSQL (templates, orders, custom requests, assets)
                     │     └─ TossPayments (TEST) ──▶ hosted pay flow
                     └─ Toss webhook ──▶ /api/payments/webhook (raw-body HMAC verify → idempotent)
```

Payments sit behind a provider-agnostic `PaymentProvider` interface (`src/lib/payments/`);
TossPayments is the first adapter (F003). Money is **KRW won** (integer, no minor unit).

## Data model (`prisma/schema.prisma`)
Made-to-order — **no inventory/stock**. Money in **KRW won** (integer `*Won` fields), never cents.
- **Template** — the entry-line product itself (선택 = 상품 선택): category, unique `key`, label,
  blurb, `extraVar` (0~1 pre-pay variable), `softPriceWon` 43,000 / `hardPriceWon` 49,000, `active`.
- **Order** — a purchase. `kind` ENTRY|CUSTOM, `status` CREATED→PAID→IN_PRODUCTION→SHIPPED→
  COMPLETED (/ CANCELLED / REFUNDED), `tossOrderId`/`tossPaymentKey`, `amountWon`, buyer PII.
- **OrderItem** — one personalized book in an ENTRY order: template×cover, `unitPriceWon`,
  `position` (stable addressing for mypage finishing); `@@unique([orderId, position])`.
- **Personalization** — per-item: childName/childGender + extraVar (pre-pay), child-photo `Asset`,
  dedication (post-pay finishing). All PII (sensitive).
- **CustomRequest / Consultation** — 맞춤 제작: two paths (WRITTEN/PHONE), one shared 6-group form;
  PHONE books a free Consultation slot (payment after the call).
- **Asset** — uploaded child photo / QR video, stored by opaque `storageKey` (never inline/public).
- **ProcessedWebhook** — Toss event-id ledger for idempotent webhook handling.

## Key flows
- **Browse:** `/` → category (`/anniversary`, `/first-moments`) → `/order/[templateKey]`.
  Server-rendered for SEO + speed; templates read from the DB (hermetic seed-mirror fallback).
- **Order funnel:** template → minimal pre-pay form (이름·성별 + 0~1 var) → optional photo
  (skippable, never blocks pay) → cover (소프트/하드) → `/cart`. Client cart; the server
  **recomputes** the amount from authoritative `Template` prices at checkout (never trust client
  totals — E4).
- **Checkout:** `/checkout` → `POST /api/payments/create` (Toss **test** payment keyed by our
  `tossOrderId`) → hosted pay flow → on success `/api/payments/confirm` + the
  `/api/payments/webhook` (raw-body HMAC-verified, deduped) mark the Order PAID → `/orders/[id]`.
  Decline/cancel preserve the cart; `clearCart()` runs client-side only after PAID.
- **Mypage finishing (post-pay):** `/mypage` order#+email lookup mints an HMAC capability cookie →
  `/mypage/[orderId]` to add the child photo (if skipped) + dedication; QR is a flag-gated notice.
- **맞춤 제작:** `/custom` → `/custom/written` (6-group form → pay → SUBMITTED) or `/custom/phone`
  (booking calendar → Consultation REQUESTED, payment after the call).

## Where code lives
- `src/app/**` routes/UI · `src/lib/**` domain (env, guardrails, observability, db, payments,
  cart, assets, storage, metrics) · `prisma/**` schema · `scripts/**` tools · `eval/**` eval
  harness · `tests/**` unit + e2e.

## Conventions
- Prices in **integer KRW won** (no minor unit); format at the edge. Money math never in floats.
- DB-touching code imports a single `src/lib/db.ts` PrismaClient wrapper (added with F004).
- Server validates all external input; client is untrusted (`untrusted()` at the boundary).
