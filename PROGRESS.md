# Progress Log

## Handoff (resume here)   ← was session-handoff.md; consolidated to cut sync/drift (M4)
- Resume with: `./init.sh` → read this file + `git log --oneline -20` → pick top `passes:false`
  in `feature_list.json` (WIP=1) → `pnpm attempt <id>` before working it.
- Next action (single): enter the coding loop on **그림책 제작소**. Foundations first —
  **F004 (DB+seed) ∥ F003 (payment+Toss)** (file-disjoint, parallel-safe), then **F002 branded home**.
  Parallel-wave plan in this session log.
- Broken / not done: no product buyer-flow features built yet (spec layer repurposed; code via the loop).

## Current verified state   ← single source of truth
- Last green `pnpm check`: **2026-06-01** (lint + typecheck + 9 unit tests + 0 constraint violations, incl. R4/R5 invariants)
- E2E smoke (`pnpm test:e2e`): **2 passed** (home renders; mobile responsive at 375px)
- Boots via `./init.sh`: **yes** (install → check → ready, exit 0)
- **Two honest, separate numbers** (`pnpm status`):
  - **Harness readiness** (machinery, product-agnostic): 85.2/100 → READY (see `SCORECARD.md`)
  - **Product delivery** (그림책 제작소 store): **1 / 32 product features passing (~3%)** — coding loop not yet started
  - harness-track features passing: 6 / 10
- Bootstrap contract (build_guide §7): **MET** — boots, verified tests exist, AGENTS.md router, feature_list aligned.

## Status
Harness **INITIALIZED + review-hardened + repurposed to 그림책 제작소**. Spec layer (brief/schema/
feature_list/router) now reflects the real product; DESIGN.md (Atelier Sans) wired + enforced. Coding loop next.

## Session log (newest first)
### 2026-06-01 — repurpose to 그림책 제작소 (spec layer) + DESIGN.md wiring
- Wired DESIGN.md (Atelier Sans) as UI SoR: tokens→`globals.css`, fonts→`layout.tsx`, refs (root +
  `src/app/AGENTS.md`), executable R6 (no box-shadow) / R7 (no pure #fff/#000). ADR-0008. Verified green.
- Replaced harness CONTENT, kept ENGINE: PRODUCT_BRIEF v2; schema (Template/Order/Personalization/
  CustomRequest/Consultation/Asset; KRW won; no inventory); feature_list (42 features, entry-line first);
  AGENTS.md router; ADR-0009.
- 3 decisions: TossPayments (provider-agnostic; Stripe swap scheduled as F003), web scope =
  commerce+intake+mypage (AI generation backstage / out of web scope), build order = entry line first.
- `src/` runtime untouched → `pnpm check` green (lint+typecheck+9 tests+constraints R1–R7 incl R4/R5 on 42 features).
- Next: coding loop. Foundations F004 ∥ F003 (parallel-safe), then F002 branded home.

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
