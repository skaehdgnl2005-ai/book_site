# Progress Log

## Handoff (resume here)   ← was session-handoff.md; consolidated to cut sync/drift (M4)
- Resume with: `./init.sh` → read this file + `git log --oneline -20` → pick top `passes:false`
  in `feature_list.json` (WIP=1) → `pnpm attempt <id>` before working it.
- Next action (single): **TRACK-CONTENT (F024–F028) done** on `feat/content` (worktree off master).
  Remaining Wave 0: F004 (DB+seed) · F003 (payment+Toss) · F029 (asset) — in flight on their own
  worktrees. Then **merge** finished branches one at a time (`pnpm check` each). Prompts: `docs/SESSION_PROMPTS.md`.
- Broken / not done: buyer purchase flow (F003–F023) not built yet; content pages are static and not in the
  global Nav (Nav is F002-owned/import-only); real assets/contact/배송/환불 await maker input (flagged TODOs).

## Current verified state   ← single source of truth
- Last green `pnpm check`: **2026-06-01** (lint + typecheck + 9 unit tests + 0 constraint violations, incl. R4/R5 invariants)
- E2E (`pnpm test:e2e`): **13 passed** (home 2 + content F024–F028: brand-story/gallery/reviews/faq/contact, each + 375px) — on `feat/content`
- Boots via `./init.sh`: **yes** (install → check → ready, exit 0)
- **Two honest, separate numbers** (`pnpm status`):
  - **Harness readiness** (machinery, product-agnostic): 85.2/100 → READY (see `SCORECARD.md`)
  - **Product delivery** (그림책 제작소 store): **7 / 32 product features passing (~22%)** — F002 home + F024–F028 content (on `feat/content`)
  - harness-track features passing: 6 / 10
- Bootstrap contract (build_guide §7): **MET** — boots, verified tests exist, AGENTS.md router, feature_list aligned.

## Status
Harness **INITIALIZED + review-hardened + repurposed to 그림책 제작소**. Spec layer (brief/schema/
feature_list/router) now reflects the real product; DESIGN.md (Atelier Sans) wired + enforced. Coding loop next.

## Session log (newest first)
### 2026-06-01 — TRACK-CONTENT (F024–F028) content pages [feat/content worktree]
- Built 5 static content pages on the Atelier Sans system, isolated in a `feat/content` worktree off
  master (other Wave-0 tracks' uncommitted WIP in the main checkout left untouched): **F024 브랜드 스토리**
  (grounded translator narrative + flagged founder-story TODO), **F025 갤러리** (honest placeholder tiles),
  **F026 후기** (honest empty state + framed beta 80% signal, no fabricated quotes), **F027 FAQ** (native
  `<details>` accordion, 5 topics incl. honest 환불 placeholder), **F028 문의** (전화/이메일 flagged
  placeholders + client form that tags input `untrusted()` and gives honest guidance, no fake receipt).
- Honesty-first (날조 금지): every unprovided datum (founder story / sample images / reviews / 전화·이메일 /
  배송 carrier·fee / 환불 policy) is a visible, code-flagged `TODO`, never fabricated.
- Styled without touching the off-limits `globals.css`: co-located **CSS Modules** consuming `:root` tokens;
  new shared sub-components under `_components/content/` (GalleryTile, FaqItem, ContactForm). The F002
  `_components` kit + `globals.css` were import-only.
- TDD per feature (spec first → page → `pnpm check` + that page's E2E). Full gate green: `pnpm check`
  (lint+typecheck+9 unit+constraints 0) + **13 E2E passed**. F024–F028 `passing` + dated evidence; attempts reset.
- Docs: `docs/superpowers/specs/2026-06-01-content-pages-design.md` + `…/plans/2026-06-01-content-pages.md`.
  Commits: 9b728e1 · d0129ea · fe6295e · 7580693 · ac2d815.
- Next: merge `feat/content` → master one branch at a time (`pnpm check` each) per the runbook merge prompt.

### 2026-06-01 — F002 branded home (pattern-setter) + runbook refinement
- Built the 그림책 제작소 branded home (hero + 3-category preview + primary CTA) and the reusable
  `src/app/_components/` kit (Nav, Footer, Button/CtaLink, SectionHeader, CategoryCard) — all styled
  from DESIGN.md tokens (component classes added to `globals.css`; R6/R7 clean).
- TDD: rewrote `home.spec.ts` first (brand/hero/3 cards/CTA + 375px). `pnpm check` green + E2E 2 passed
  → F002 `passing` (R4 holds), attempt reset.
- Refined `docs/SESSION_PROMPTS.md` per re-examination: default = single-session context-batch; subagent
  offload only for independent/mechanical tracks; stateful funnels stay in main (parallel sessions dropped).
- Next: Wave 0 (F003/F004/F029 + content F024–F028).

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
