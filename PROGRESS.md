# Progress Log

## Current verified state   ← single source of truth
- Last green `pnpm check`: **2026-06-01** (lint + typecheck + 9 unit tests + 0 constraint violations)
- E2E smoke (`pnpm test:e2e`): **2 passed** (home renders; mobile responsive at 375px)
- Boots via `./init.sh`: **yes** (install → check → ready, exit 0)
- Features passing: **7 / 32** (skeleton baseline + safety/observability harness checks); 2 more `in_progress`
  - Product-flow features (catalog → checkout → orders): all `passes:false` (not built yet)
- Bootstrap contract (build_guide §7): **MET** — boots, verified tests exist, AGENTS.md router, feature_list aligned.

## Status
Harness **INITIALIZED**. Phase 0→7 complete; INITIALIZER handing off to the coding loop.
Next coding-loop pick (WIP=1): **F002 — Catalog page** (priority 1, unblocks F003/F004/eval S2).

## Session log (newest first)
### 2026-06-01 — harness bootstrap (INITIALIZER)
- Done & verified:
  - Runnable scaffold: Next.js 15 App Router skeleton (`src/app`), libs (`env`/`guardrails`/`observability`).
  - Verify chain `pnpm check` (lint+typecheck+test+arch guardrails) — **green**.
  - E2E (Playwright) home smoke — **2 passed**; chromium installed.
  - Tools: `pnpm approve` (HITL gate), `pnpm constraints` (exec guardrails), `pnpm eval` (purchase-flow).
  - State: `feature_list.json` (32 features), this file, `DECISIONS.md`, `session-handoff.md`.
  - Docs: AGENTS.md router + `docs/{ARCHITECTURE,CONSTRAINTS,SAFETY,OBSERVABILITY,EVAL}.md`.
  - Fresh-clone typecheck robustness verified (ambient types in `src/types/globals.d.ts`).
- Changed: whole repo (greenfield → harness).
- Broken / known issues: none. Product features unimplemented by design (Phase 0 = 0 feature code).
- Next action (single): implement **F002 (Catalog)** — add `src/lib/db.ts` (Prisma), `/catalog` page, `catalog.spec.ts`.
