# Progress Log

## Handoff (resume here)   ← was session-handoff.md; consolidated to cut sync/drift (M4)
- Resume with: `./init.sh` → read this file + `git log --oneline -20` → pick top `passes:false`
  in `feature_list.json` (WIP=1) → `pnpm attempt <id>` before working it.
- Next action (single): **Wave 0 + content integrated to `master`** — F001/F002 home, F003 payment (Toss),
  F004 DB+seed, F029 asset, and F024–F028 content pages all merged & passing. Next: buyer-flow funnel —
  catalog F005/F006 (read the seeded templates) → order F007–F011 → checkout F012–F016. Prompts: `docs/SESSION_PROMPTS.md`.
- Broken / not done: buyer-flow funnel (F005+) not built yet. Content pages are static + not yet wired into
  the global Nav (Nav is F002-owned/import-only); real assets/founder-story/후기/전화·이메일/배송/환불 await
  maker input (visible code-flagged TODOs, never fabricated).
- **TRACK-CUSTOM (F020–F023) DONE on `feat/custom`** (isolated worktree off master), awaiting merge: 맞춤 제작
  landing (two paths) + WRITTEN (6-group 의뢰서 → Toss **test** pay → SUBMITTED) + PHONE (booking calendar →
  Consultation REQUESTED, pay-after-call) + the shared 6-group form (F023). 16 unit + 11 E2E green, `pnpm check`
  clean (R1–R8), worker≠checker review done (1 finding fixed, 2 dismissed — ADR-0011). Merge one branch at a
  time per the runbook; conflict hotspot: `feature_list.json`. Custom routes are NOT yet wired into the global
  Nav (F002-owned/import-only) — a follow-up like the content pages.
- **Follow-up (F004):** `prisma db seed` runs the `.ts` seed via Node type-stripping, which needs
  **Node ≥ 22.6** (newer than the `>=20` engines floor; dev runtime is Node 24). Not on the `pnpm check`
  path, so no gate impact. Revisit when a track may touch deps/pins: add `tsx` or bump `.nvmrc`/`engines`.
- **Follow-up (Stripe→Toss residue, not a gate):** `.github/workflows/ci.yml` still injects `STRIPE_*` env
  (harmless — optional/ignored; rename rides with the checkout track F012–F016), and prose docs
  `docs/SAFETY.md`/`CONSTRAINTS.md`/`ARCHITECTURE.md` + `eval/golden` still say "Stripe". `.env.example` is on Toss.

## Current verified state   ← single source of truth
- Last green `pnpm check`: **2026-06-01** (lint + typecheck + unit + 0 constraint violations, incl.
  R4/R5/R8 invariants) — verified on the integrated `master` after the Wave-0 + content merges.
- E2E (`pnpm test:e2e`): **13 passed** (home 2 + content F024–F028: brand-story/gallery/reviews/faq/contact, each + 375px)
- Boots via `./init.sh`: **yes** (install → check → ready, exit 0)
- **Two honest, separate numbers** (`pnpm status`):
  - **Harness readiness** (machinery, product-agnostic): 85.2/100 → READY (see `SCORECARD.md`)
  - **Product delivery** (그림책 제작소 store): **10 / 32 product features passing (~31%)** on `master` — F001/F002 home, F003 payment, F004 DB+seed, F029 asset, F024–F028 content. **+F020–F023 (맞춤 제작) passing on `feat/custom`, awaiting merge → 14 / 32 (~44%) once integrated.**
  - harness-track features passing: 6 / 10 (F030/F031 evidence refreshed Stripe→Toss)
- Bootstrap contract (build_guide §7): **MET** — boots, verified tests exist, AGENTS.md router, feature_list aligned.

## Status
Harness **INITIALIZED + review-hardened + repurposed to 그림책 제작소**. Spec layer (brief/schema/
feature_list/router) now reflects the real product; DESIGN.md (Atelier Sans) wired + enforced. Coding loop next.

## Session log (newest first)
### 2026-06-01 — TRACK-CUSTOM (F020–F023) 맞춤 제작 intake  [feat/custom worktree]
- Built the full 맞춤 제작 intake on an isolated `feat/custom` worktree off master (the main checkout held a
  concurrent category track's uncommitted WIP — per the runbook, each track gets its own worktree):
  **F020** `/custom` landing (two path cards → /custom/phone & /custom/written, 119,000원); **F021** WRITTEN
  (6-group 의뢰서 → Toss **test** pay → status SUBMITTED); **F022** PHONE (server-computed booking calendar →
  Consultation **REQUESTED**, no upfront payment — pay after the call); **F023** the shared 6-group form
  (`CUSTOM_FORM_GROUPS`) both paths normalize into → identical `CustomRequest.form` shape (homogeneous input).
- **Decisions (ADR-0011):** D1 hermetic in-memory store on `globalThis` (Prisma is the documented production
  seam; ADR-0002); D2 WRITTEN payment via the `PaymentProvider` with an injectable sandbox transport, impossible
  to use in production (ADR-0010/0004); D3 a REQUESTED booking is a customer request, NOT the irreversible
  operator-side 예약 확정 (no approval gate). Imports only `@/lib/payments` (+ `untrusted()`); all external
  input tagged at the boundary; no PII/secret logging.
- **TDD** per feature (tests first → RED → implement → GREEN). Forms are hydration-safe (uncontrolled inputs +
  FormData + a mounted-gated submit, the ContactForm pattern). 16 unit + 11 E2E green; `pnpm check` clean (R1–R8).
- **Worker≠checker review** (ADR-0005/F042): a 5-dimension adversarial workflow, each finding skeptic-verified.
  Found + fixed **1 real bug** — the confirmation page claimed "테스트 결제 완료" for any WRITTEN record without
  checking `rec.status`, so an unpaid PENDING_PAYMENT request showed a phantom payment-success (spec §5
  violation); now gated on status + a regression E2E. **2 dismissed** (a confirm-route hardening nit; a
  double-counted heading concern).
- **Env trap diagnosed:** Playwright's `webServer` (`pnpm dev`, url :3000, reuseExistingServer) spawns a SECOND
  `next dev` in the worktree when :3000 is free, clobbering `.next` (ENOENT / static-asset 400 / hydration
  failures). Fix: run one dev server on :3000 that Playwright reuses. `next build` compiles all routes cleanly.
- Docs: `docs/superpowers/specs/2026-06-01-custom-track-design.md` + `…/plans/2026-06-01-custom-track.md`.
- Next: merge `feat/custom` → master (one branch at a time, `pnpm check` each; reconcile `feature_list.json`).

### 2026-06-01 — F029 access-controlled Asset storage (child-photo / PII safety)  [feat/F029]
- Opaque random storageKey (no filename/child-name/byte leak), `untrusted()` trust-gate, kind↔contentType
  allowlist, PII-free traces asserted through the real observability `emit()` sink. vitest pii.test.ts 15/15.
- Adversarial multi-lens review fixed a prototype-chain allowlist bypass (untrusted contentType resolved
  inherited members like `toString`/`__proto__`) + regression test; opaque keys over content-addressing so
  identical photo bytes don't correlate. Touched only `src/lib/assets.ts` + `tests/unit/pii.test.ts`.
  `e2e_via` F009/F017/F018 (transitive E2E per R8).

### 2026-06-01 — F004 DB wrapper (Prisma singleton) + seed the 8 entry templates  [feat/F004]
- TDD: wrote `tests/unit/db.test.ts` first (singleton once-only + 8-template fidelity + idempotency),
  watched it fail, then implemented `src/lib/db.ts` + `prisma/seed.ts`. 10 tests green.
- **DB-/generate-independent (ADR-0002 / ADR-0006):** proved empirically that a static
  `import {PrismaClient}` breaks `tsc` (TS2305) AND throws at runtime (`@prisma/client` re-exports the
  ungenerated `.prisma/client`), and that `init.sh`/`pnpm check` never run `prisma generate`. So `db.ts`
  is a **lazy** singleton (dynamic import on first use, cached on `globalThis`) and `seed.ts` only touches
  `@prisma/client` inside a guarded `main()`. The test proves the singleton + idempotency via injection — no DB.
- Seeded the 8 entry templates (탄생·백일·돌·생일·입학·첫 걸음마·첫 말·형아 된 날) with exact
  category/key/label/extraVar per `PRODUCT_BRIEF`, 43,000/49,000원, idempotent `upsert` on the unique `key`.
- **Adversarially reviewed** (5-dimension workflow, each finding verified): fixed a singleton TOCTOU race
  (cache the in-flight promise, not the resolved value, so concurrent first-use builds one client) and
  added a stateful-fake idempotency test (two runs → exactly 8 rows). Dismissed 1 nit.
- Verified on an **isolated `feat/F004` worktree off `master`** (the shared checkout was on a sibling
  track's branch): full `pnpm check` green (typecheck + 19 tests + R1–R7 0 violations). Touched only the
  4 allowed files; `feature_list` F004 → `passing` (R4 holds); attempt reset.
- Next: F003 (Toss) / F029 (asset) land on their branches; then catalog F005/F006 read the seeded templates.

### 2026-06-01 — F003 payment provider abstraction + Stripe→Toss re-point (TRACK-PAY)
- Built `src/lib/payments/`: provider-agnostic `PaymentProvider` contract (`index.ts`) + TossPayments
  **test/sandbox** adapter (`toss.ts`). KRW won = integer (no minor unit), enforced. `confirm()` uses an
  **injectable transport** so `pnpm check` stays hermetic (no network — parallels the DB rule, ADR-0002);
  maps Toss `DONE→PAID`, error→`FAILED`, `CANCELED→CANCELED`. Adapter refuses live keys (defence in depth).
- Re-pointed Stripe→Toss across the safety machinery: `env.ts` refuses a live Toss key (`live_sk_`/`live_ck_`)
  outside production + redacts Toss keys; `check-constraints` **R1** now flags Toss live keys (grouped regex so
  the rule's own source can't self-match — empirically verified it stays clean AND fires on a planted live key);
  `guardrails` IRREVERSIBLE_ACTIONS → `toss.charge.live`/`toss.refund.live` + `consultation.book`, with
  `scripts/approve.mjs` kept in sync (so the error messages' `pnpm approve toss.charge.live` is real).
- TDD: payments.test.ts (13) RED→GREEN first; smoke.test.ts Toss assertions (10) RED→GREEN. `pnpm check`
  green (lint+type+unit+constraints). F003 `passing` (R4 holds); F030/F031 evidence refreshed to Toss. attempt reset.
- Worker≠checker (ADR-0005/F042): ran a 5-dimension adversarial review (each finding independently
  verified). 5 real findings, all addressed: re-pointed `.env.example` to the Toss env contract; added tests
  for `confirm()`'s KRW guard, the env client-key live branch, and the legacy-Stripe redact branch; fixed a
  stale "Stripe webhook" comment in guardrails.ts. 1 dismissed (CI STRIPE_* env — harmless, deferred).
- Scope note: completing the rename meant touching `scripts/approve.mjs` (approval gate must know the renamed
  actions) and `.env.example` (dev-facing env contract) — both beyond the literal track file list but unowned
  by any sibling Wave-0 track (zero merge-conflict risk).
- Next: remaining Wave 0 (F004 DB, F029 asset, content F024–F028).

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
