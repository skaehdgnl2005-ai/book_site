# Progress Log

## Handoff (resume here)   ← was session-handoff.md; consolidated to cut sync/drift (M4)
- Resume with: `./init.sh` → read this file + `git log --oneline -20` → pick top `passes:false`
  in `feature_list.json` (WIP=1) → `pnpm attempt <id>` before working it.
- Next action (single): implement **F002 — Catalog** (`src/lib/db.ts` Prisma wrapper + `/catalog` + `catalog.spec.ts`).
- Broken / not done: no product buyer-flow features yet (Phase 0 = 0 feature code, by design).

## Current verified state   ← single source of truth
- Last green `pnpm check`: **2026-06-01** (lint + typecheck + 9 unit tests + 0 constraint violations, incl. R4/R5 invariants)
- E2E smoke (`pnpm test:e2e`): **2 passed** (home renders; mobile responsive at 375px)
- Boots via `./init.sh`: **yes** (install → check → ready, exit 0)
- **Two honest, separate numbers** (`pnpm status`):
  - **Harness readiness** (machinery): 85.2/100 → READY (see `SCORECARD.md`)
  - **Product delivery** (the actual store): **1 / 21 product features passing (~5%)** — not started
  - harness-track features passing: 6 / 11
- Bootstrap contract (build_guide §7): **MET** — boots, verified tests exist, AGENTS.md router, feature_list aligned.

## Status
Harness **INITIALIZED + review-hardened**. Phase 0→7 complete; INITIALIZER handing off to the coding loop.

## Session log (newest first)
### 2026-06-01 — review hardening (accepted design feedback)
- R4 invariant (`state:"passing"` ⟺ `passes:true`) + R5 executable termination (3 attempts → must be `blocked`)
  added to `pnpm constraints`; both tested (R5 fires + resets). Termination is now counted, not prose.
- `pnpm status`: honest dual metric (product delivery vs harness readiness) — anti-Goodhart.
- `feature_list.json` v2: every feature tagged `track: product|harness` (de-conflates store vs methodology).
- Consolidated `session-handoff.md` into this file (cut a per-session drift surface).
- `pnpm attempt <id>` ledger (`.harness/attempts.json`, committed) records attempts across sessions.

### 2026-06-01 — harness bootstrap (INITIALIZER)
- Done & verified: runnable Next.js 15 skeleton; `pnpm check` green; E2E home smoke 2 passed;
  tools (approve/constraints/eval); state + docs; fresh-clone typecheck robustness verified.
- Changed: whole repo (greenfield → harness). Broken: none (product features unimplemented by design).
