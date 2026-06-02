# Progress Log

## Handoff (resume here)   ← was session-handoff.md; consolidated to cut sync/drift (M4)
- Resume with: `./init.sh` → read this file + `git log --oneline -20` → pick top `passes:false`
  in `feature_list.json` (WIP=1) → `pnpm attempt <id>` before working it.
- Next action (single): **TRACK-CHECKOUT (F012–F016, F034) DONE + passing** (this work) — the entry-line
  buyer flow is now end-to-end: `/cart` 결제하기 → `/checkout` buyer step → Toss **(test)** payment → **PAID**
  (sync confirm + async signature-verified webhook, idempotent via `ProcessedWebhook`) → `/orders/[id]`
  confirmation; failure/cancel handled (cart preserved). **F035 completed** (checkout 375px). Next in the buyer
  flow: **TRACK-MYPAGE (F017/F018)** — post-pay finishing (photo upload if skipped, dedication, QR video reveal
  if the add-on was chosen); it reads orders (production Prisma seam) + the F029 asset path. Prompts: `docs/SESSION_PROMPTS.md`.
- **TRACK-CHECKOUT decisions (ADR-0013 — read before mypage):** order persistence is a hermetic `globalThis`
  store + `ProcessedWebhook` ledger under `src/app/api/payments/_lib/` (Prisma adapter is the documented prod
  seam; hermetic items key by `templateKey`, prod resolves `templateKey`→`Template.id`). Amount is recomputed
  server-side from authoritative `Template` prices; `clearCart()` runs client-side ONLY after PAID. `/orders/[id]`
  renders NO PII (sequential ids, unauthenticated). The real Toss browser-SDK + boot-required `TOSS_WEBHOOK_SECRET`
  are flagged production seams (create route 503s in production).
- Broken / not done: Mypage (F017/F018) unbuilt; 맞춤 제작 (F020–F023) **merged + passing**
  (custom routes not yet wired into the global Nav — F002-owned/import-only; follow-up like content). F009 stores only the
  access-controlled photo descriptor — durable byte storage + the `Asset` DB row are deferred to mypage/checkout
  (no object-storage backend wired yet, backstage). Content pages static + not Nav-wired; real assets/founder-story/
  후기/전화·이메일/배송/환불 await maker input (code-flagged TODOs). A11y aria-live/aria-invalid + cart-line list
  semantics deferred to F037.
- **Follow-ups (TRACK-CAT, latent — no DB exists yet; tracked not silent, from the adversarial review):**
  (1) the live-DB branch of `getTemplatesByCategory` is exercised only by the injected-fake unit test, never by a
  gate (no Postgres in CI); (2) the `rows.length>0` guard falls back to the seed mirror on an empty-but-valid DB
  result — revisit once admin template-deactivation (`active:false`) ships; (3) `heroImageUrl` is rendered as
  `<img src>` with no allow-list — add same-origin/allow-list validation when real hero assets land (null today →
  honest panel mat); (4) the seed mirror duplicates `prisma/seed.ts` (E2E + unit drift-guard covers
  key/label/price/blurb) — extract a shared data-only module if drift becomes a concern.
- **Follow-up (F004):** `prisma db seed` runs the `.ts` seed via Node type-stripping, which needs
  **Node ≥ 22.6** (newer than the `>=20` engines floor; dev runtime is Node 24). Not on the `pnpm check`
  path, so no gate impact. Revisit when a track may touch deps/pins: add `tsx` or bump `.nvmrc`/`engines`.
- **Follow-up (Stripe→Toss residue, not a gate):** `.github/workflows/ci.yml` still injects `STRIPE_*` env
  (harmless — optional/ignored; rename rides with the checkout track F012–F016), and prose docs
  `docs/SAFETY.md`/`CONSTRAINTS.md`/`ARCHITECTURE.md` + `eval/golden` still say "Stripe". `.env.example` is on Toss.

## Current verified state   ← single source of truth
- Last green `pnpm check`: **2026-06-02** (lint + typecheck + **125 unit** + 0 constraint violations, incl.
  R4/R5/R8 invariants) — verified on `feat/checkout` (prior 98 + **27 new webhook/checkout-domain**).
- E2E (`pnpm test:e2e`): **58 passed** (home 2 + content 11 + category 4 + order/cart 18 + custom 11 +
  **checkout 12** [checkout-start 3 + checkout-success 2 + order-confirm 4 + checkout-failed 2 + checkout-cancel 1])
- Boots via `./init.sh`: **yes** (install → check → ready, exit 0)
- **Two honest, separate numbers** (`pnpm status`):
  - **Harness readiness** (machinery, product-agnostic): 85.2/100 → READY (see `SCORECARD.md`)
  - **Product delivery** (그림책 제작소 store): **28 / 32 product features passing (88%)** — F001/F002 home, F003 payment, F004 DB+seed, F029 asset, F024–F028 content, F005/F006 catalog, F007–F011 + F019 order funnel, F020–F023 맞춤 제작, **F012–F016 checkout**, **F035 responsive (375px, completed)**
  - harness-track features passing: **7 / 10** (+F034 checkout/confirm explicit verification)
- Bootstrap contract (build_guide §7): **MET** — boots, verified tests exist, AGENTS.md router, feature_list aligned.

## Status
Harness **INITIALIZED + review-hardened + repurposed to 그림책 제작소**. Spec layer (brief/schema/
feature_list/router) now reflects the real product; DESIGN.md (Atelier Sans) wired + enforced. Coding loop next.

## Session log (newest first)
### 2026-06-02 — TRACK-CHECKOUT (F012–F016, F034) entry-line checkout → idempotent PAID  [feat/checkout]
- Built the entry-line checkout end-to-end: `/cart` 결제하기 → `/checkout` buyer step (new `Order.buyerName/
  buyerEmail`, NOT in the cart) → `POST /api/payments/create` (amount **recomputed server-side** from
  authoritative `Template` prices; client totals untrusted) → a hermetic **sandbox Toss stand-in** (`/checkout/
  pay`, the three outcome branches) → **F013** sync `confirm` + async **webhook** (RAW-body HMAC-SHA256 before
  any parse; idempotent via the `ProcessedWebhook` ledger) both converge **PAID** → **F014** `/orders/[id]`
  (PII-free; status-gated copy). **F015** failure → no PAID order; **F016** cancel → cart preserved (`clearCart()`
  client-side ONLY after PAID). New track-owned: `src/app/api/payments/{create,confirm,webhook}/route.ts` +
  `_lib/{orders,checkout}.ts` (hermetic store + domain core; Prisma prod seam), `src/app/checkout/**`,
  `src/app/orders/[id]/**`, `tests/unit/webhook.test.ts` (27), 5 `tests/e2e/checkout-*`+`order-confirm` specs (12).
- **Process: brainstorm-shaped design → PRE-build adversarial review → TDD → POST-build worker≠checker (ADR-0005/
  F042).** A **33-agent / 6-lens design review** (19 skeptic-verified findings folded into the spec BEFORE code —
  caught the raw-body-HMAC + client-side-clearCart bugs at design time). TDD: 27 unit RED→GREEN, then 5 E2E specs
  RED→GREEN. A **12-agent implementation review** → 4 skeptic-verified findings, all fixed + re-verified:
  production-checkout **503 gate** (was a silent 404 seam), `getTemplateByKey` **active-row rejection**
  (inactive→null, also closes TRACK-CAT follow-up #2 for the order path), tightened email regex.
- **Approval-gate decision (ADR-0013 D5, mirrors ADR-0012 D3):** NO `requireApproval("order.confirm")` on the
  buyer's TEST confirm — sandbox/reversible; real-money irreversibility stays gated at env (live keys refused at
  boot) + adapter. F034's gate is the recorded worker≠checker review, not a code gate.
- Gates: `pnpm check` green (lint+typecheck+**125 unit**+0 constraints R1–R8) + **58 E2E** (46 prior + 12, no
  regressions). F012–F016 + F034 → `passing` + dated evidence (R4 holds); **F035 completed** (checkout 375px — the
  coverage TRACK-ORDER deferred here). Product delivery 22→**28/32** (88%); harness-track 6→**7/10**.
- **Scope deviations (ratified, conflict-free — merged files, no concurrent writer; precedent ADR-0010/0011):**
  domain logic co-located under `api/payments/_lib/` (track grants no new `src/lib/*`); import `getTemplateByKey`
  (price SoR) + `formatWon`/`COVER_LABEL` + `untrusted()`; enable the `/cart` CTA (TRACK-ORDER's documented handoff
  point); the `getTemplateByKey` active-filter (1 line in merged `templates.ts`). Honest deferrals (named): real
  Toss browser SDK + Prisma persistence + Toss's exact webhook scheme (prod seams); boot-required
  `TOSS_WEBHOOK_SECRET` (env.ts out of file scope). Spec: `docs/superpowers/specs/2026-06-02-track-checkout-design.md`.
- Next: merge `feat/checkout` → master (--no-ff), re-verify; then TRACK-MYPAGE (F017/F018).

### 2026-06-02 — TRACK-ORDER (F007–F011, F019) entry-line order funnel  [feat/order]
- Built the full pre-pay funnel: `/order/[templateKey]` server route (hermetic `getTemplateByKey`, `notFound()` on
  unknown key) → client `OrderWizard` (`useReducer`) with 4 steps — **정보**(F008 validated form) → **사진**(F009
  optional, skip never blocks) → **커버&옵션**(F010 cover price + F019 QR toggle) → **확인**(F011) → `/cart`. New
  track-owned files: `src/lib/cart.ts` (pure model + localStorage adapter, zero upward imports), `src/app/_components/
  order/*` (OrderWizard, InfoStep/PhotoStep/CoverStep/ReviewStep, `personalization.ts` validator, `photo-action.ts`
  server action, `format.ts` client-safe formatWon+COVER_LABEL, CartView, order.module.css), `src/app/cart/page.tsx`.
- **Process: brainstorm → adversarial design review → plan → subagent-driven TDD.** Design hardened by a **32-agent
  adversarial review** (0 blockers; 6 majors folded in). Implemented via **subagent-driven-development**: a fresh
  implementer per task + two-stage (spec-compliance then code-quality) independent review per task, then an independent
  **whole-implementation worker≠checker pass → ACCEPT** (F042/ADR-0005). ADR-0011 records the decisions + deviations.
- **Key correctness wins from review (in the code, not just the spec):** `extraVar` threaded through the live-DB seam
  (`TemplateDelegate`+`mapRow`), not just the seed mirror, + a compile-time catalog↔seed enum-parity guard;
  `getTemplateByKey` reuses the hermetic DB-or-mirror fallback; photo upload is exception-safe + PII-safe (filename
  never in DOM/URL); `loadCart` filters untrusted/malformed persisted lines. **Bundling fix:** client components
  can't value-import `templates.ts` (its dynamic `@/lib/db` breaks the browser bundle) → client-safe `format.ts` twin
  (pinned to the catalog copy by a unit test).
- Gates: `pnpm check` green (lint+typecheck+**82 unit**+constraints R1–R8 0) + **35 E2E passed** (17 prior, no
  regressions; +18 order/cart). F007–F011/F019 → `passing` + dated evidence (R4 holds). **F035 advanced, not flipped**
  (order+cart 375px green; checkout 375px still pending → stays `in_progress`). Product delivery 12→**18/32** (~56%).
- Honesty-first deferrals (named, not silent): F009 stores only the access-controlled descriptor (durable bytes/Asset
  row → mypage F017/checkout); QR +0원 via `QR_ADDON_WON` constant (brief states no price); a11y aria-live/aria-invalid
  + cart-line list semantics → F037. Scope deviations (templates.ts edit, /cart route, new unit tests) ratified in ADR-0011.
- Next: **TRACK-CHECKOUT (F012–F016)** — imports `src/lib/cart` + `src/lib/payments`; read the cart.ts handoff notes
  above (buyer identity, server-side amount recompute, templateKey→id, clearCart-after-PAID).

### 2026-06-02 — TRACK-CUSTOM (F020–F023) 맞춤 제작 intake — merged into master  [feat/custom]
- Built the full 맞춤 제작 intake on an isolated `feat/custom` worktree (the main checkout held a concurrent
  track's WIP; per the runbook, each track gets its own worktree): **F020** `/custom` landing (two path cards →
  /custom/phone & /custom/written, 119,000원); **F021** WRITTEN (6-group 의뢰서 → Toss **test** pay → SUBMITTED);
  **F022** PHONE (server-computed booking calendar → Consultation **REQUESTED**, pay-after-call); **F023** the
  shared 6-group `CUSTOM_FORM_GROUPS` both paths normalize into → identical `CustomRequest.form` shape. Decisions
  in **ADR-0012** (D1 hermetic globalThis store, Prisma is the documented production seam; D2 PaymentProvider +
  injectable sandbox transport, impossible when APP_ENV=production; D3 REQUESTED ≠ the irreversible operator-side
  예약 확정 → no approval gate). Imports only `@/lib/payments` (+ `untrusted()`); input tagged at the boundary.
- TDD per feature; hydration-safe forms (uncontrolled + FormData + mounted-gated submit, the ContactForm pattern).
  **Worker≠checker review** (5-dim adversarial workflow, each finding skeptic-verified): **1 real bug fixed** — the
  confirmation page claimed "테스트 결제 완료" for any WRITTEN record without checking `rec.status`, so an unpaid
  PENDING_PAYMENT request showed a phantom payment-success (spec §5); now status-gated + a regression E2E. **2
  dismissed** (a confirm-route hardening nit; a double-counted heading). Env trap diagnosed: Playwright's webServer
  spawns a 2nd `next dev` in the worktree when :3000 is free, clobbering `.next` — fix is one dev server on :3000
  that Playwright reuses; `next build` compiles all routes cleanly.
- Merged `feat/custom` → master (--no-ff). Reconciled DECISIONS (ADR-0011 = TRACK-ORDER → renumbered mine to
  **ADR-0012**) + PROGRESS; `feature_list.json` auto-merged (disjoint entries). Docs:
  `docs/superpowers/specs|plans/2026-06-01-custom-track*`.

### 2026-06-01 — TRACK-CAT (F005 기념일 / F006 첫 순간들) catalog category pages  [feat/category]
- Built the two entry-line category pages as a DB-backed template card grid. New track-owned kit under
  `src/app/_components/catalog/`: `templates.ts` (data loader + canonical catalogue + `formatWon`),
  `TemplateCard.tsx`/`.module.css` (Atelier Sans Product Card — **명조 책 제목 only**, 1px hairlines, navy-only
  edition no.+dot, radius 0, `:focus-visible` ring), `CategoryView.tsx`/`.module.css` (shared scaffold + product
  grid). Pages `src/app/{anniversary,first-moments}/page.tsx`. Cards link to `/order/<key>` (contract; 404 until TRACK-ORDER).
- **Hermetic data access (the core decision):** CI/E2E run **no Postgres, no `prisma generate`, no DATABASE_URL**
  (confirmed in `ci.yml`/`playwright.config.ts`); `pnpm check` builds nothing, pages compile only under `next dev`
  on hit routes. So `getTemplatesByCategory` reads the live DB via `@/lib/db` **only when DATABASE_URL is set**
  (dynamic import → keeps `@prisma/client` out of the hermetic graph), else falls back to a canonical seed-mirror
  of `prisma/seed.ts` ENTRY_TEMPLATES. `readTemplatesFromDb` is an injection seam (db.ts/seed.ts pattern) so the
  DB map/order is unit-testable. `export const dynamic='force-dynamic'` so the live-DB read isn't baked at build.
- TDD: wrote `category-*.spec.ts` first (RED → 404), implemented, GREEN. Full gate: `pnpm check` green
  (lint+typecheck+**54 unit**+constraints R1–R8 0) + **17 E2E** (no regressions; nav 기념일/첫 순간들 links now
  resolve). Visual QA via headless browser: desktop 3-col + 375px 1-col, **0 console errors** (screenshots reviewed).
- **Adversarial worker≠checker review (F042 protocol):** 6-dimension workflow, **24 agents**, each finding
  independently verified (refute-by-default). 18 raw → **9 fixed**: Korean body line-height 1.75 (bodyKo token),
  price 0.92rem (price token), card `:focus-visible` navy ring (outline, not box-shadow → R6-safe),
  `<ul role=list>` (WebKit list semantics), `encodeURIComponent(key)` in the order href (path-traversal harden),
  per-card role-bound price assertion (was page-global `.first()`), and a DB-branch injection-seam unit test
  (the live-DB map/order was untested). **9 deferred/dismissed** with recorded rationale (latent — no DB today):
  empty-DB-result fallback semantics, heroImageUrl allow-list, aria-label title-first, active-on-mirror, blurb
  drift, media bounding-box; 2 dismissed (per-template price impossible by brief; F006 attempt-ledger nit).
- **Scope notes (justified, conflict-free — F003 precedent):** added co-located CSS modules + a loader/view in the
  track's own `_components/catalog/` namespace (contract literally named only TemplateCard.tsx), and
  `tests/unit/catalog.test.ts` (unowned by any sibling track) to cover the live-DB branch the review flagged.
  Imported the merged, import-only `@/lib/db`. Did NOT touch the shared `_components` root, `globals.css`, `db.ts`, `seed.ts`.
- F005/F006 `passing` + dated evidence (R4 holds); F035 evidence updated (category 375px green; order/checkout
  pending). Attempt reset. Merged `feat/category` → `master` (--no-ff); `pnpm check` + 17 E2E re-verified green on master.
- Next: TRACK-ORDER (F007–F011, F019) — stateful funnel, one session; TRACK-CUSTOM (F020–F023) parallel-OK.

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
