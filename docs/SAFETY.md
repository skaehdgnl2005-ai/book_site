# Safety, Guardrails & Permissions (category E + G-HITL + G-SANDBOX)

Payments + customer PII make this a **regulated** domain. These controls must never be
downgraded. Each maps to a rubric criterion.

## 1. Irreversible actions require human approval (E1 / G-HITL)
These actions have real-world, non-undoable effects and are **default-deny**:

| Action key | Effect |
|---|---|
| `stripe.charge.live` / `stripe.refund.live` | Real money moves |
| `order.confirm` | Commits a customer order |
| `fulfillment.trigger` | Ships / fulfills |
| `inventory.write.production` | Mutates prod stock |
| `pii.store` / `pii.send` | Persists / transmits customer PII |
| `email.transactional.send` / `email.marketing.send` | External email |
| `deploy.production` | Production deploy / live-key switch |

**How the gate works**
1. Code calls `requireApproval(action, token)` (`src/lib/guardrails.ts`) before the effect.
2. With no matching token it **throws** — the action cannot run.
3. A human runs `pnpm approve <action>`, types the action name to confirm, and receives a
   token `APPROVED:<action>` to pass into the guarded call.
4. `scripts/check-constraints.mjs` rule **R3** fails CI if a `src/` side-effect
   (`.charge(`, `.refund(`, `sendEmail(`, `fulfill(`) lacks `requireApproval()`.

During development, only the **test-mode** equivalents run; live keys are out of scope
until separately approved (ADR-0004).

## 2. Sandbox & least privilege (E2 / G-SANDBOX)
- App runs locally / in CI containers; the database is an isolated `docker-compose`
  service scoped to one db/user (`pnpm db:up`) — not a shared/prod instance.
- `pnpm check` needs no DB and no secrets (ADR-0002) → safe to run anywhere.
- Secrets only via env; `.env*` is gitignored; `.env.example` carries no real values.
- CI uses Stripe **test** keys from secrets and never live credentials.

## 3. Input/output guardrails (E3)
- `parseEnv()` validates config and **fails fast** with a model-readable error, never
  echoing secret values.
- `redact()` strips Stripe keys and emails from anything heading to logs/traces.
- Constraint **R2** blocks `console.*(process.env …)` (secret/PII leakage).
- Card data is never stored by us — Stripe Checkout holds it (PCI scope minimized).

## 4. Trust boundary & injection defense (E4)
- External content — buyer input, admin uploads, **Stripe webhook payloads**, the web —
  is **untrusted**. Wrap it with `untrusted()` and never let it act as an instruction or
  be trusted in a security decision.
- Stripe webhooks: verify `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` before
  acting, and dedupe by event id (`ProcessedWebhook`) so replays are no-ops (F020).
- DB access goes through Prisma (parameterized) — no string-built SQL.

## 5. Permission scope (E5)
- Approval tokens are **per-action** (`APPROVED:order.confirm` ≠ `APPROVED:deploy.production`).
- Stripe restricted test keys; DB user scoped to the app schema.
- The approval CLI only *issues intent tokens* — it never performs the action itself.

## Incident posture
On a suspected leak or bad charge: rotate the affected key, revoke tokens, check the
`ProcessedWebhook` ledger and traces (redacted), and record an entry in `DECISIONS.md`.
