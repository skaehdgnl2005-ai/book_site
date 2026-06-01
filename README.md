# Storybook Shop

Premium e-commerce shop for curated, high-illustration storybooks. This repository is a
reliability **harness** built greenfield: the scaffolding (instructions, tools, environment,
state, feedback) that lets an AI coding agent build the product reliably across sessions.

> Agents: start at **[AGENTS.md](AGENTS.md)**. Product spec: **[PRODUCT_BRIEF.md](PRODUCT_BRIEF.md)**.
> Harness method docs (reference): **[docs/method/](docs/method/)**.

## Quickstart
```bash
./init.sh            # install → verify baseline → ready  (idempotent; run every session)
pnpm dev             # http://localhost:3000
pnpm check           # full gate: lint + typecheck + tests + arch guardrails
pnpm test:e2e        # Playwright buyer-flow E2E (boots its own server)
```
Requires Node ≥ 20 and pnpm 10. Optional local DB: `pnpm db:up` (Docker).

## Status — two separate numbers (don't conflate)
- **Harness readiness** (the machinery): **85.2/100 → READY** (`SCORECARD.md`). Bootstrap
  contract MET: boots clean, `pnpm check` green, E2E smoke passes, router + aligned feature list.
- **Product delivery** (the actual store): **~1/21 product features passing (`pnpm status`)** —
  catalog → cart → checkout → orders → admin are **not yet built** by design (initialization ≠
  implementation). A high harness score does **not** mean the store is shipped.

## Scripts
| Command | What |
|---|---|
| `pnpm check` | lint + typecheck + unit tests + `pnpm constraints` (canonical gate) |
| `pnpm verify` | lint + typecheck + unit tests (brief's chain) |
| `pnpm test:e2e` | Playwright end-to-end (buyer journey) |
| `pnpm constraints` | executable architecture/safety guardrails (incl. feature-list invariants R4/R5) |
| `pnpm status` | honest split: **product delivery** vs **harness readiness** (never conflate) |
| `pnpm eval` | purchase-flow eval metrics |
| `pnpm approve <action>` | issue a human-approval token for an irreversible action |

## Safety (payments + PII = regulated)
Stripe runs in **test mode** only during development; a live key outside production makes
the app refuse to boot. Irreversible actions (live charge/refund, order confirm, fulfillment,
prod DB writes, PII send, deploy) are **default-deny** and require an explicit approval token.
See **[docs/SAFETY.md](docs/SAFETY.md)**.

## Layout
```
AGENTS.md  PRODUCT_BRIEF.md  feature_list.json  PROGRESS.md  DECISIONS.md  init.sh
src/app/      Next.js App Router pages
src/lib/      env (config+redaction), guardrails (HITL+trust), observability (traces)
prisma/       schema (Postgres)
scripts/      approve (HITL gate), check-constraints (executable guardrails)
eval/         eval harness + golden/holdout sets
tests/        unit (vitest) + e2e (Playwright)
docs/         ARCHITECTURE, CONSTRAINTS, SAFETY, OBSERVABILITY, EVAL  (+ method/ reference)
SCORECARD.md  rubric self-assessment
```
