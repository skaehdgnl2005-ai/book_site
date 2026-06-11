# Decision Log (ADR-lite)

## 2026-06-01 — ADR-0001 — Stack: adopt proposed defaults
- Decision: Node 20 LTS / TypeScript 5, Next.js 15 (App Router) + React 19, Prisma 6 + PostgreSQL 16, pnpm 10, Stripe (test mode).
- Why: User delegated the choice ("네가 스스로 판단"). Defaults fit a standard commerce flow, have first-class Playwright E2E support, and match the brief's verify chain. Local Node is v24 but we pin `engines >=20` and `.nvmrc=20`.
- Rejected: SQLite for local (loses prod parity for a regulated/payments domain); Remix/SvelteKit (no reason to diverge from the brief).

## 2026-06-01 — ADR-0002 — `pnpm check` is database-independent
- Decision: Skeleton code does not instantiate PrismaClient; lint/typecheck/test run with no DB. DB features wire `src/lib/db.ts` when they land; local DB is `docker-compose` via `pnpm db:up`.
- Why: Keeps the boot/verify loop fast, offline, and sandbox-clean (G-SANDBOX, idempotent init.sh). A fresh clone can go green without provisioning Postgres.
- Rejected: Requiring a live DB for `make check` (slow, flaky, couples verify to infra).

## 2026-06-01 — ADR-0003 — pnpm-script verify chain instead of a real Makefile
- Decision: `pnpm check` (= lint + typecheck + test + `pnpm constraints`) is the canonical single-command gate; `pnpm verify` is the brief's lint+typecheck+test subset. A thin `Makefile` wrapper delegates to pnpm for parity.
- Why: `make` is absent on the target Windows host; the brief itself specifies a pnpm verify chain "as a make check replacement". Adapt the build-guide pattern, don't clone it.
- Rejected: Mandating GNU make (extra dependency, Windows friction).

## 2026-06-01 — ADR-0004 — Stripe test mode only; live charges behind an approval gate
- Decision: Dev/verify use Stripe TEST keys exclusively. A live key outside production makes the app refuse to boot (`src/lib/env.ts`). Live charges/refunds, order confirm, fulfillment, prod DB writes, PII send, and deploy require `pnpm approve <action>` + `requireApproval()`.
- Why: Payments + PII = regulated domain. G-HITL / G-SANDBOX / category E must not be downgraded; irreversible actions need an explicit human checkpoint.
- Rejected: Implementing live payments in this build (user deferred to a separate approval); trusting env hygiene without an executable guard.

## 2026-06-01 — ADR-0005 — Worker≠checker as a separate pass, not a multi-agent framework
- Decision: Completion is judged by an independent verification pass (E2E gate + a separate review step / sub-agent), not by the implementer. No always-on multi-agent orchestration.
- Why: M1/G-SIMPLE — the simplest structure that externalizes "is it done". Avoids unjustified complexity while still preventing self-graded false completion.
- Rejected: A standing multi-agent crew (complexity not justified at this scale).

## 2026-06-01 — ADR-0007 — Review hardening (accepted design feedback, with scoped pushback)
- Decision: Accepted 4 review points and patched the harness:
  1. **Anti-Goodhart (accepted fully):** relabel the rubric number as *harness readiness*; add a
     separate *product delivery* metric (`pnpm status`, `track` field on every feature); gate
     ROBUST on real buyer-flow features (F002–F008, F011), not on more machinery.
  2. **state/passes drift (accepted):** executable invariant R4 (`state:"passing"` ⟺ `passes:true`).
  3. **Doc consolidation (accepted, scoped):** folded `session-handoff.md` into `PROGRESS.md`
     (the real per-session overlap). **Pushback:** kept `SCORECARD.md`/`scorecard.yaml` (build-time,
     produced once / on re-score) and `DECISIONS.md` (append-only) — they are not per-session sync
     surfaces competing with M4, so collapsing them would lose distinct, low-drift roles. Also made
     `status.mjs` read the score from `scorecard.yaml` to remove a hardcoded-number drift copy.
  4. **Executable termination (accepted):** `pnpm attempt <id>` ledger + invariant R5 (3 attempts
     without passing ⇒ must be `blocked`). Closes the prose-only loop-termination gap.
- Why: 3 of 4 points exposed a real inconsistency — guardrails were executable but scoring/termination
  leaned on prose. Fixes align with the harness's own "the tool is the constraint" philosophy.
- Deliberately NOT done: did not raise the A5 score despite R5 strengthening it — refused to inflate
  the headline in response to feedback about the headline. Did not delete the meta/process features
  (F023/F031/F032); classified them `track:harness` instead so they stop inflating product delivery.

## 2026-06-01 — ADR-0006 — Typecheck independent of Next's generated `next-env.d.ts`
- Decision: Gitignore `next-env.d.ts`; commit `src/types/globals.d.ts` declaring `*.css`/image modules so `pnpm typecheck` passes on a fresh clone before `next dev|build` runs.
- Why: Next 15.5 rewrites `next-env.d.ts` to reference `.next/types/*` (absent on a clean checkout), which would break standalone typecheck. Verified empirically by running typecheck with the file removed (exit 0).
- Rejected: Committing the generated file (churns on every dev run, references gitignored paths).

## 2026-06-01 — ADR-0008 — DESIGN.md as the UI source of truth (Atelier Sans), enforced minimally
- Decision: Adopt the user-provided `DESIGN.md` (YEOBAEK BOOKS — Atelier Sans) as the single
  source of truth for all UI/styling. Wired three ways: (1) **references** — root `AGENTS.md`
  Map + hard constraint #9, and a nearest-wins `src/app/AGENTS.md`; (2) **tokens-as-code** — the
  full color/type/spacing/motion token set as CSS variables in `src/app/globals.css`, so styling
  has one place to draw values from (poka-yoke); (3) **executable guardrails** — `check-constraints`
  R6 (no box-shadow under `src/`) and R7 (no pure `#fff`/`#000` under `src/`). Fonts load via the
  design's CDN drop-in in `src/app/layout.tsx`.
- Why: The harness's SoR principle — "what the agent can't see in the repo doesn't exist." A design
  doc only works if it's referenced every session AND partially enforced by the tool. The minimal
  rule set is deliberate (user chose "최소 시작 후 성장"): only the two zero-false-positive checks now;
  grow R6/R7 (raw-hex-outside-tokens, radius≠0, serif-in-UI) as real UI lands (M1 / G-SIMPLE).
- Rejected: `next/font` self-hosting now (adds a build-time network fetch in the offline sandbox; the
  CDN drop-in with `display=swap` + system fallbacks keeps `pnpm check` and the home E2E green) —
  revisit when UI grows. Encoding every DESIGN.md "Don't" up front (false-positive/maintenance burden
  before any UI exists). A separate `docs/superpowers/specs/*` design doc — `DESIGN.md` already is the
  spec, and a parallel copy would violate the harness's single-source-of-truth/minimalism principle.

## 2026-06-01 — ADR-0009 — Repurpose harness from placeholder shop to "그림책 제작소"
- Decision: Replace the harness's CONTENT (product spec) while keeping its ENGINE (loop, gates,
  safety/observability machinery, DESIGN.md wiring). Driven by the user's brief `web-brief-v1 (1).md`,
  now folded into the canonical `PRODUCT_BRIEF.md` v2. Three structural decisions confirmed:
  1. **Payment = TossPayments** behind a provider-agnostic interface (test/sandbox first adapter);
     Stripe scaffolding (env validation, schema fields, webhook, check-constraints R1) is replaced —
     scheduled as feature F003 so the swap is verified, not silently half-done.
  2. **Web scope = commerce + personalization-input collection + order management + mypage.** The AI
     book-generation pipeline (photo→character, template+variables→story) is BACKSTAGE / out of web
     scope; recorded in `PRODUCT_BRIEF.out_of_scope`. Keeps scope honest and bounded (G-SIMPLE).
  3. **Build order = entry line first** (기념일+첫 순간들 end-to-end), then mypage + 맞춤 제작, then
     content/observability/eval. `feature_list.json` carries all 42 features but priority-ordered.
- Schema rewritten (`prisma/schema.prisma`): Template(=entry product)/Order/OrderItem/Personalization/
  CustomRequest/Consultation/Asset/ProcessedWebhook. Money is KRW won (integer, no minor unit — NOT
  cents). Made-to-order ⇒ **no inventory/stock model** (the oversell feature is intentionally dropped).
- Safety elevated: child photos are sensitive PII → access-controlled `Asset` storage (never inline),
  never logged/traced/in E2E fixtures (F029). Irreversible-action set + env key pattern move to Toss/
  consultation under F003.
- Why: User confirmed the real product is the personalized picture-book shop, not the bootstrap
  placeholder. The harness was deliberately two-layered (engine vs content) precisely so the content
  could be swapped; this is an INITIALIZER-level re-init, which legitimately regenerates feature_list
  (the "change only state/passes" rule governs the coding loop, not product re-initialization).
- Scope of THIS change: spec layer only (PRODUCT_BRIEF, schema, feature_list, this ADR). `src/` code,
  env, guardrails, tests are UNCHANGED so `pnpm check` + the home E2E stay green; the code-level swaps
  (Toss, branded home, uploads) happen through the coding loop as the prioritized features. Genuinely
  still-passing harness-infra features (HITL gate, redaction, untrusted tagging, trace, holdout) are
  preserved as `passing`; payment-provider specifics are marked `not_started` (Toss versions unbuilt).
- Note: DESIGN.md wordmark says "YEOBAEK BOOKS"; the product brand is "그림책 제작소". The Atelier Sans
  visual SYSTEM applies regardless of wordmark — reconcile the wordmark when the branded home (F002) lands.
- Rejected: a real-time in-app AI generation pipeline now (out of scope, huge); keeping Stripe (wrong
  payment UX for a Korean product); building the full site at once (slower to a verified first flow).

## 2026-06-01 — ADR-0010 — F003: provider-agnostic PaymentProvider + TossPayments adapter
- Decision: the app depends on a small `PaymentProvider` interface (`src/lib/payments/index.ts`),
  never on a concrete gateway. Surface = `createCheckout(input): Checkout` (pure/sync — returns only
  public, non-secret fields the browser needs) and `confirm(input): Promise<Confirmation>` (settles with
  the gateway, mapping its status to our `PAID | FAILED | CANCELED`). TossPayments is the first adapter
  (`toss.ts`), **test/sandbox only**: it refuses live keys in its constructor (belt-and-braces with the
  `parseEnv` boot refusal), authenticates the confirm call with Basic `base64("<secretKey>:")`, and takes
  an **injectable HTTP transport** so unit tests need no network (`pnpm check` stays hermetic, mirrors
  ADR-0002). Money stays KRW won = integer.
- Re-point (the Stripe→Toss swap promised in ADR-0009, now executed & verified): env key fields + live-key
  refusal, `redact()` patterns, `check-constraints` R1 (live-key literal scan), and the
  `IRREVERSIBLE_ACTIONS` set (`toss.charge.live`/`toss.refund.live` + `consultation.book`).
- Why: F003's whole point is that swapping/adding a provider is "write another adapter", not "touch the
  order/checkout code". Doing the swap as a *verified feature* (not a silent edit) keeps the gates honest.
- Scope deviation (recorded deliberately): also edited `scripts/approve.mjs` — outside the track's literal
  file list, but the approval CLI must recognise the renamed actions or the error messages that tell a human
  to run `pnpm approve toss.charge.live` would be false. It is unowned by any sibling Wave-0 track, so zero
  merge-conflict risk. The list is duplicated in `guardrails.ts` (TS) and `approve.mjs` (CLI) because a `.mjs`
  script can't import the `.ts` module; both carry a "keep in sync" comment.
- Deliberately NOT done here: prose docs (`docs/SAFETY.md`, `CONSTRAINTS.md`, `ARCHITECTURE.md`) and
  `eval/golden` still name Stripe — they describe webhook/checkout mechanics that land with F012–F016 / F040,
  so re-pointing them now (partially) would create a worse, internally-inconsistent doc. Tracked in PROGRESS.
- Rejected: a sync-only or async-only interface baked to Toss's exact shape (loses provider-agnosticism);
  hitting the real Toss API in tests (flaky, non-hermetic); removing the unused `stripe` npm dep now
  (package.json is TRACK-DB's this wave; trivial follow-up).

## 2026-06-02 — ADR-0011 — TRACK-ORDER (F007–F011, F019): client wizard + pure cart, review-hardened
- Decision: the entry-line funnel is a **client-side stepped wizard** at `/order/[templateKey]` (정보 →
  사진 → 커버&옵션 → 확인) backed by a **pure `src/lib/cart.ts`** model persisted to `localStorage`;
  **DB-free until checkout**. `extraVar` is resolved via the **extended catalog loader** — threaded through
  the live-DB seam (`TemplateDelegate` + `mapRow ?? "NONE"`) AND the seed mirror, with `getTemplateByKey`
  reusing the hermetic DB-or-mirror fallback. QR is a **flag-only** toggle priced via a single
  `QR_ADDON_WON = 0` constant (the brief lists QR as a paid add-on but states no price; the schema has no
  QR price field), surfaced honestly as "기본 미포함 · 요금 추후 안내".
- Designed brainstorm-first; **hardened by a 32-agent adversarial design review** (0 blockers; 6 confirmed
  majors folded in: extraVar must thread the DB seam not just the mirror, `getTemplateByKey` hermetic
  fallback, photo server-action robustness, `clearCart()`-after-PAID for F016, honest photo-durability
  deferral, seed-parity drift guard) + per-task two-stage subagent review + an independent whole-implementation
  worker≠checker pass (ACCEPT). Spec/plan: `docs/superpowers/specs|plans/2026-06-02-track-order-funnel*`.
- **Scope deviations from the literal track file-list (ratified, conflict-free — TRACK-CAT already merged,
  no concurrent writer; precedent ADR-0010):** (a) extended `src/app/_components/catalog/templates.ts`
  (added `extraVar` end-to-end + `getTemplateByKey`); (b) created `src/app/cart/` (the checkout features
  F012/F016 reference `/cart` explicitly); (c) added `tests/unit/{cart,order-personalization,format}.test.ts`
  + extended `tests/unit/catalog.test.ts`.
- **Implementation deviation discovered during the build (justified):** client components cannot value-import
  `formatWon`/labels from `templates.ts` — its dynamic `import("@/lib/db")` drags `@prisma/client` into the
  browser bundle (`.prisma/client/index-browser` not found, no `prisma generate`). So a client-safe twin
  `src/app/_components/order/format.ts` holds `formatWon` + `COVER_LABEL`; a unit test pins the twin to the
  catalog copy to prevent drift. Type-only imports from `templates.ts` remain safe (erased at build).
- **Child PII in `localStorage`:** the cart holds `childName`/`childGender`/`extraVar` device-locally — within
  the brief's PII rules (the forbidden surfaces are logs/traces/E2E fixtures, not the buyer's own device); the
  photo descriptor is non-PII (opaque key). `clearCart()` is the PAID-only hook (called after F013, never on
  checkout start → preserves F016's cart). E2E asserts no child-name / photo-filename in DOM/URL.
- **Handoff to TRACK-CHECKOUT (F012+):** buyer identity (`Order.buyerName/buyerEmail`) is checkout's step,
  NOT the cart; the order amount MUST be recomputed server-side from authoritative `Template` prices (the
  client `grandTotalWon`/`toCheckoutSummary.amountWon` are display-only/untrusted); `templateKey`→`Template.id`
  resolution + DB seeding are checkout's job. `clearCart()` only after PAID.
- **Honest deferrals (not silent):** F009 stores the access-controlled descriptor only — durable byte storage
  + the `Asset` DB row land at mypage (F017)/checkout (no object-storage backend wired yet, backstage). Real
  QR pricing pending the maker. **A11y:** error `aria-live`/`aria-invalid`/`aria-describedby` and cart-line
  list semantics are deferred to F037 (the dedicated a11y feature) — form controls ARE label-associated.
- Rejected: server-persisted draft orders (breaks the hermetic no-DB E2E gate the suite relies on); a second
  order-local `extraVar` mirror (drift risk — extended the one catalog SoR instead, guarded by a seed-parity
  unit test); inventing a QR price (brief states none — flagged 0 + TODO rather than fabricate).
## 2026-06-01 — ADR-0012 — F020–F023: 맞춤 제작 intake (hermetic store + sandbox payment + REQUESTED≠확정)
- Decision: the custom track is self-contained — `src/lib/customRequest.ts` (domain core) + `src/app/custom/**`
  + `src/app/api/custom/**` — importing only `@/lib/payments` (+ `@/lib/guardrails.untrusted()`, a cross-cutting
  safety primitive required project-wide by AGENTS #6, as the content track also did). One shared **6-group
  의뢰서** (`CUSTOM_FORM_GROUPS`) is the single source of truth both paths normalize into via `buildCustomForm`,
  so production input is homogeneous regardless of path (F023).
- **D1 — Persistence = in-memory repository on `globalThis`** (mirrors the `db.ts` singleton): the hermetic store
  the dev server + Playwright run against (ADR-0002 keeps the verifiable path DB-independent; Playwright boots
  only `pnpm dev`). The `CustomRequest`/`Consultation` Prisma models already exist; a production deploy swaps a
  Prisma adapter behind the same `customRequestStore` surface — an explicit, documented seam, not a silent skip
  (parallels how F003/F004 documented their hermetic seams).
- **D2 — WRITTEN payment via the provider-agnostic `PaymentProvider`** (createCheckout + confirm). Outside
  production `customTossProvider()` uses an **injectable sandbox transport** (ADR-0010) so the flow is hermetic
  and test/sandbox-only (ADR-0004); the stub is **impossible when `APP_ENV === "production"`** (→ `tossFromEnv`,
  real fetch). A non-PAID confirm never marks the request SUBMITTED, and the confirmation page gates its
  completion copy on `rec.status` so an unpaid request never shows a phantom "결제 완료" (the one real finding
  the worker≠checker review caught — now fixed + regression-tested).
- **D3 — PHONE booking stores a Consultation REQUESTED with NO approval gate and NO payment.** The brief's
  irreversible action is 상담 예약 **확정** (the operator creating a real customer-facing appointment) =
  `requireApproval("consultation.book")`, a backstage step. A customer's REQUESTED slot is a wish pending
  confirmation — free, pay-after-call (web-brief §4); gating it would block the buyer flow and misread intent.
- Verification: 16 unit + 11 E2E green; `pnpm check` clean (R1–R8). Worker≠checker review (ADR-0005/F042):
  5 dimensions → each finding skeptic-verified; 1 real finding fixed (status-gated confirmation copy), 2 dismissed
  (a confirm-route hardening nit — the store's `markSubmitted` guard already prevents state corruption; and a
  double-counted heading concern). Forms are hydration-safe (uncontrolled inputs + FormData + mounted-gated
  submit, the ContactForm pattern) so Playwright never acts before React attaches handlers.
- Scope note: photo/QR Asset upload (외형 사진) is text-only in the written form — real upload is F029/mypage
  scope (deferred, not dropped). Diagnosed + worked around an env trap: Playwright's `webServer` (`pnpm dev`,
  url :3000, reuseExistingServer) spawns a SECOND `next dev` in the worktree when :3000 is free, clobbering
  `.next` (ENOENT / static-asset 400 / hydration failures); running one dev server on :3000 that Playwright
  reuses is the fix. The production build (`next build`) compiles all routes cleanly.
- Rejected: a real DB / real Toss round-trip in the verifiable path (flaky, non-hermetic — ADR-0002/0010);
  gating REQUESTED on approval (misreads the brief); controlled inputs (reset on hydration → flaky E2E).

## 2026-06-02 — ADR-0013 — TRACK-CHECKOUT (F012–F016, F034): entry-line checkout → idempotent PAID
- Decision: the entry-line checkout turns the localStorage cart into a server `Order` and drives a
  TossPayments **(test)** payment to **PAID** via TWO idempotent paths — a synchronous confirm (buyer
  returns from the gateway) and an async webhook — both calling an idempotent `markPaid`. DB-free /
  hermetic by default (ADR-0002): a `globalThis` Order store + `ProcessedWebhook` ledger under
  `src/app/api/payments/_lib/` (a Next.js private folder — kept there, NOT in `src/lib/checkout.ts`,
  because the track's explicit "Touch ONLY" list grants the three app dirs + "import src/lib/cart +
  src/lib/payments only", unlike TRACK-CUSTOM whose prompt granted `src/lib/customRequest.ts`). The
  production Prisma adapter swaps behind the same `OrderRepo`/`WebhookLedger` surfaces — a documented seam.
- **Hermetic Toss-redirect stand-in (D1):** real Toss opens a hosted window; the hermetic E2E (one
  `pnpm dev`, no DB, no network) cannot. So outside production the create route returns
  `payUrl=/checkout/pay?order=<id>` — an internal page that stands in for Toss's hosted page with the three
  outcome branches (승인/실패/취소), making F013/F015/F016 deterministically E2E-testable. The real Toss
  browser-SDK path is **not built** (unverifiable hermetically → would be a silent half-done claim); it is a
  documented seam, and `/api/payments/create` **fails fast with a 503** when `APP_ENV==="production"` so it
  never returns a sandbox URL the prod pay page would 404 (impl-review blocker, fixed).
- **Anti-tampering (D2):** the order amount is **recomputed server-side** from authoritative `Template`
  prices (`getTemplateByKey`) — the client `unitPriceWon`/`grandTotal` are display-only/untrusted (ADR-0011
  handoff). `orderName` is a PII-free product summary. The confirm amount is the server-held `order.amountWon`,
  never a client value. Per the impl review, `getTemplateByKey` now also **rejects a deactivated (active:false)
  DB row** (→null→400), mirroring `getTemplatesByCategory`'s filter, so a withdrawn product can't be ordered.
- **Webhook auth (D3):** signature is verified as **HMAC-SHA256 over the RAW request body** (`req.text()`
  BEFORE any `JSON.parse` — parsing first would hash the wrong bytes), constant-time + length-guarded; a
  provider-agnostic seam the production Toss adapter maps its real scheme onto. Idempotency via the
  `ProcessedWebhook` ledger keyed by `eventId` (dedupe BEFORE any state change → redelivery, even a forged
  later payload, is a strict no-op). The webhook secret falls back to a test value outside production and is
  required (401 if absent) in production.
- **PII (D4):** order ids are sequential/guessable and `/orders/[id]` is unauthenticated, so the confirmation
  page renders **NO PII** (no buyer/child name or email — only id, status, labels, covers, prices, total);
  PII is stored server-side for fulfillment and never logged/traced/in a URL. `clearCart()` runs **client-side
  in `PaySandbox` ONLY after PAID** (it's `window.localStorage`; a server redirect would bypass it) — which is
  exactly what preserves the cart on cancel/failure (F016/F015).
- **Approval-gate decision (D5):** NO `requireApproval("order.confirm")` on the buyer's TEST confirm — it's
  sandbox/reversible; real-money irreversibility is gated at env (live keys refused at boot) + adapter
  (`toss.charge.live`/`toss.refund.live`). `order.confirm`/`fulfillment.trigger` stay reserved for the backstage
  operator commit-to-production (out of web scope, ADR-0009). Mirrors ADR-0012 D3; R3 remains the backstop
  (checkout calls no `.charge(`/`.refund(`). F034's gate = the recorded worker≠checker review, not a code gate.
- **Process (worker≠checker, ADR-0005/F042):** brainstorm-shaped design → a **PRE-build 33-agent / 6-lens
  adversarial design review** (19 skeptic-verified findings folded into the spec BEFORE coding — caught the
  raw-body HMAC + client-side clearCart bugs at design time) → TDD (27 unit RED→GREEN, then 5 E2E specs
  RED→GREEN) → a **POST-build 12-agent implementation review** (4 skeptic-verified findings, all fixed:
  prod-503 gate, active-row rejection, tightened email regex; the 2 raw-body/clearCart blockers were already
  prevented by the design review). Spec/resolutions: `docs/superpowers/specs/2026-06-02-track-checkout-design.md`.
- **Scope deviations (ratified, conflict-free — precedent ADR-0010/0011, all on merged files w/ no concurrent
  writer):** (a) import `getTemplateByKey` from the catalog (handoff-mandated authoritative price recompute) +
  `formatWon`/`COVER_LABEL` from the order display kit + `untrusted()` from guardrails (AGENTS #6 cross-cutting);
  (b) enable the `/cart` 결제하기 CTA (1 line in `CartView.tsx`) — the documented handoff point TRACK-ORDER left
  "준비중 until TRACK-CHECKOUT"; (c) the `getTemplateByKey` active-filter (`TemplateRow.active?` + a 1-line
  guard in the merged `templates.ts`) — also resolves PROGRESS TRACK-CAT follow-up #2 for the order-creation path.
- Gates: `pnpm check` green (lint+typecheck+**125 unit**+0 constraints R1–R8) + **58 E2E** (46 prior + 12 new
  checkout; no regressions). F012–F016 + F034 → `passing`; **F035 completed** (checkout 375px — the coverage
  TRACK-ORDER deferred here). Honest deferrals (named): real Toss browser SDK + Prisma persistence + Toss's exact
  webhook scheme are production seams; `TOSS_WEBHOOK_SECRET` boot-required-in-prod hardening (env.ts is out of
  this track's file scope) is a flagged follow-up.
- Rejected: inline confirm w/ a fake key + no redirect (the custom-WRITTEN shape — checkout needs all THREE
  Toss branches deterministically); trusting the client amount; gating the test confirm; a `src/lib/checkout.ts`
  (the track grants no new `src/lib/*` file); the reviewers' suggested active-fix that falls through to the mirror
  on `active:false` (would re-activate a deactivated template — used `inactive→null` instead).

## 2026-06-02 — ADR-0014 — TRACK-MYPAGE (F017, F018): post-pay finishing (photo · dedication · QR)
- Decision: 마이페이지 lets a buyer finish a PAID order. F017 = order status + post-pay child-photo upload
  (when skipped at checkout); F018 = dedication (헌정 문구) + QR video upload (revealed ONLY when
  `Order.qrVideoAddon`). The checkout-owned `OrderRepo` (create/get/markPaid only, out of touch-scope) is
  **read** via `orderRepo().get(id)`; finishing data persists in a **new mypage-owned hermetic store**
  (`src/app/mypage/_lib/finishing.ts`, `globalThis`-backed) keyed per order — **documented Prisma seam**
  (per-`OrderItem` photo+dedication → `Personalization`; per-`Order` QR → `Asset(kind=QR_VIDEO)`). Same
  co-location pattern as ADR-0013's `api/payments/_lib`.
- **Access model (D1) — no auth + guessable ids → order# + email + HMAC capability cookie.** `/mypage`
  verifies `order# + the email paid with` against `order.buyerEmail` (uniform error → no id-existence oracle),
  mints `${exp}.${HMAC-SHA256(secret, orderId.exp)}` and sets a `httpOnly`, `SameSite=Lax`, `Secure`(prod),
  `path=/mypage`, per-order (`mypage_<id>`), 2h cookie. The signing key is **env-sourced** (`MYPAGE_ACCESS_SECRET`,
  dev fallback non-prod, **fail-closed in prod**, never logged — mirrors `webhookSecret`). Verify is
  constant-time (`timingSafeEqual`, length-guarded) + checks `now < exp`. Production replaces this stand-in with
  real buyer-session auth (named seam).
- **No existence oracle (D2).** `/mypage/[orderId]` verifies the cookie **BEFORE any `orderRepo().get`/`notFound`**
  and renders ONE identical access prompt (HTTP 200) for existing AND unknown ids — unlike `/orders/[id]`'s
  `get→notFound`-first shape — so the guessable-id route can't probe which orders exist. Every write action
  re-verifies the cookie (`requireAccess`) AND requires `status==='PAID'` (defense in depth).
- **PII-out-of-document (D3).** The SSR shell renders NO buyer/child PII. The dedication (PII) crosses ONLY via
  the cookie-gated, **`no-store`** `/state` route the client fetches to prefill the editor — buyer managing
  THEIR OWN PII is intended function, guarded by the email-gate + HMAC + `noindex` + `no-store` + a `pageshow`
  bfcache reload. Uploads consume the filename at the boundary (opaque `storageKey`, F029), echo no PII. Durable
  bytes stay backstage (F009/ADR-0011 precedent).
- **Process (worker≠checker, ADR-0005/F042):** brainstorm-shaped design (user-approved: prefill over write-only;
  per-item photo/dedication + per-order QR; HMAC cookie) → a **PRE-build 51-agent / 6-dimension adversarial
  design review** (16/45 skeptic-verified findings folded into the spec BEFORE code — 2 MAJOR caught at design
  time: the enumeration-oracle gate ordering + `await params`/`cookies()` in Next 15) → TDD (2 E2E specs RED →
  GREEN) → a **POST-build 35-agent implementation review** (21/29 confirmed, **ALL minor/nit — zero
  blocker/major**, all fixed: bfcache reload doc-align + PII-flash clear, R12 order-scope QR label, file-input
  aria-labels, and real test-coverage for the CREATED/not-paid branch, shared-QR, QR persistence, lookup-page
  noindex, and a meaningful 375px). Spec + R1–R16 resolutions: `docs/superpowers/specs/2026-06-02-track-mypage-design.md`.
- **Named seams (not silent skips):** real buyer auth (the HMAC cookie stands in); durable object-storage of the
  uploaded bytes (descriptor-only, F009); the Prisma persistence of the finishing store + the real
  `Personalization`/`Asset` rows; `MYPAGE_ACCESS_SECRET` boot-required-in-prod validation in `env.ts`
  (out of touch-scope, mirrors checkout's `TOSS_WEBHOOK_SECRET` follow-up); a shared cross-file QR-copy constant;
  lookup rate-limiting; "QR per book" (would need a schema change — today per-order per the schema).
- **Scope deviations (ratified, conflict-free — `feat/mypage` was the only active branch; all imported files are
  merged/settled; precedent ADR-0011/0013):** read-only import of `orderRepo` (`api/payments/_lib/orders`),
  `formatWon`/`COVER_LABEL` (`_components/order/format`), and the `Nav`/`Footer` kit; cross-cutting
  `untrusted`/`@/lib/assets` (AGENTS #5/#6). No edit to any sibling-owned file; no `tests/unit` added (the crypto
  expiry/tamper branches are tested in the E2E via `node:crypto`, staying in `tests/e2e/mypage-*`).
- Gates: `pnpm check` green (lint+typecheck+**125 unit**+0 constraints R1–R8 incl. R4/R8) + **71 E2E** (58 prior +
  **13 mypage**; no regressions). F017/F018 → `passing` + dated evidence (R4 holds). Realizes F029's
  `e2e_via:[F009,F017,F018]` for real (the mypage uploads drive the actual `assets.ts` path).
- Rejected: editing the checkout-owned `OrderRepo` to attach finishing data (out of scope → mypage-owned store
  instead); write-only dedication (no echo) — user chose prefill since the editor's purpose is the buyer managing
  their own PII, guarded; rendering the child name on mypage (data minimization — only template/cover/price/total);
  a guessable-id-only access link with no ownership proof (the email gate closes the tampering surface); a
  client-side `server-only` guard (non-`NEXT_PUBLIC_` secret is `undefined` in client bundles anyway, and bare
  `server-only` breaks vitest-style resolution).

## 2026-06-02 — ADR-0015 — TRACK-POLISH (F036, F037, F039, F040, F042): cross-cutting polish + eval
- Decision: close the entry-line with the cross-cutting polish track (F035 375px already done). **F036**
  perf budget; **F037** a11y; **F039** ops metrics; **F040** entry-line eval re-point; **F042** worker≠checker
  protocol doc. Each TDD (test-first, watched RED→GREEN), then ONE independent worker≠checker review pass
  (sub-agents, refute-by-default) before any `passes:true` — this review **is** F042's applied instance.
- **F036 (perf, `tests/e2e/perf.spec.ts`).** Asserts **p95 < 2000ms** on `/` + both category pages, measured as
  the browser's Navigation-Timing `duration` over **20 WARM loads** (after 2 unmeasured warmups) — nearest-rank
  p95 drops only the single worst sample. Each route's p95 is emitted as a `kind:"metric"` trace line via the
  real `observability.emit()` (ties perf into the F039 stream / OBSERVABILITY.md H3). **Why warm:** `next dev`
  compiles each route on first hit (a dev-only cost); the budget targets **steady-state serve latency** (the
  production proxy), so warmups are off-the-clock and every measured load is fully-compiled. Measured ~600ms
  (≈3× headroom); the assertion has teeth (a genuinely >2s page recurs on warm loads and fails).
- **F037 (a11y, `tests/e2e/a11y.spec.ts`).** A **hand-rolled in-browser DOM audit** (no axe dependency — keeps
  `pnpm check` hermetic + dep-pinned) over **14 pages**: heading order (first heading h1, no descending skips),
  every form control has an accessible name (label[for] / wrapping `<label>` / aria-label / aria-labelledby /
  title), every `<img>` has alt. A **"teeth" self-test** feeds a deliberately-broken fixture and asserts the
  audit flags all three classes, so the clean-page assertions are demonstrably non-vacuous. The page sweep sees
  only each route's INITIAL render, so a **wizard deep-step audit** walks `/order/birth` (info→photo→cover).
  **Two real defects found + fixed:** (1) `PhotoStep`'s file input had **no accessible name** (its label was a
  bare `<p>`) → `aria-labelledby` to the now-`id`'d label; (2) the order wizard was the **only** form whose
  validation errors weren't announced (every other form already used `role="alert"`) → `role="alert"` +
  `id` on the error `<p>`s + `aria-invalid`/`aria-describedby` on the inputs (`InfoStep`, `PhotoStep`). Edits
  are **purely additive ARIA** (every `data-testid` preserved → order specs still 13/13).
- **F039 (ops metrics, `src/lib/metrics.ts`).** `collectMetrics` / `collectMetricsBySession` / `createCollector`
  read the trace stream (never diverge from what happened). Definitions per OBSERVABILITY.md H2: **error rate** =
  error events ÷ all events; **tool-call failure rate** = failed tool calls ÷ tool calls, where a *tool call* is
  a `traced()` outcome (`kind:"tool"` ok:true **or** `kind:"error"` ok:false carrying a `durationMs`) — the only
  reading that makes the metric non-trivial given `traced()` never emits `tool`+`ok:false`; **latency** p50/p95/max
  (nearest-rank, null-safe on empty) over tool-call durations (excludes `kind:"metric"` measurements). `createCollector`
  plugs into `traced()`'s `sink`, parsing each **already-redacted** `emit()` line → PII can't reach metrics (proven
  by a test). 6 unit tests pin exact values.
- **F040 (entry-line eval, `eval/golden/purchase-flow.json`).** Re-pointed the golden from the Stripe-era flow to
  the real **Toss entry-line journey** (home→category→configure→cart→Toss test→PAID→mypage). S1–S9 map to the real
  passing features + their actual E2E specs (`impl:true`); **S10** (durable Postgres/Asset persistence across
  restart) is a genuine documented seam → `impl:false`, reported **pending, not success**. `pnpm eval` runs
  end-to-end → `task_success_rate 0.9` (honest). **`eval/holdout/` untouched** (F041 boundary, G4).
- **F042 (worker≠checker doc, `docs/WORKER_CHECKER.md`).** A real protocol: roles (worker doesn't self-certify),
  3-tier independence, **refute-by-default** stance, Accept/Revise/Block verdicts, 6 review dimensions, and
  recording-before-`passes:true` (tied to R4). `docs/EVAL.md` now links it + the stale `F032`→`F042` reference is
  fixed. **Applied instance = this session's review** (below).
- **Process — independent worker≠checker review (ADR-0005/F042):** 4 parallel adversarial sub-agents
  (refute-by-default; barred from `pnpm test:e2e` to avoid port-3000 races since the suite was already green) →
  **ALL ACCEPT, zero blocker/major/minor code findings.** Confirmed: warmup is honest steady-state (not gaming);
  p95/percentile math correct; a11y audit logic + teeth sound, ARIA standards-compliant, no order-spec regression;
  metric definitions match H2, edge-safe, PII-proven, tests have teeth; eval 0.9 honest, holdout untouched, pending
  never counted as pass; F042 doc accurate vs the cited ADRs. The only item was **this ADR** (process ratification).
- **Scope deviations (ratified, conflict-free — `feat/polish` solo, no concurrent writer):** F037's a11y sweep
  edited TRACK-ORDER-owned `InfoStep.tsx`/`PhotoStep.tsx` — **additive ARIA only**, every `data-testid` preserved.
  TRACK-POLISH is the **one track with no "Touch ONLY" allowlist** (stated scope = 전반/overall a11y sweep), and an
  a11y *label* sweep structurally must touch form components. `perf.spec.ts` import-only consumes the real
  `observability.emit()`. EVAL.md/golden edits are within track scope.
- Gates: `pnpm check` green (lint+typecheck+**131 unit** [+6 metrics]+0 constraints R1–R8 incl. R4/R8) + **92 E2E**
  (71 prior + 3 perf + 18 a11y; no regressions) + `pnpm eval` 0.9 (honest pending). F036/F037/F039/F040/F042 →
  `passing` + dated evidence (R4 holds). **Product delivery 30→32/32 (100%); harness-track 7→10/10.**
- Rejected: an **axe-core** dependency (kept hermetic/dep-pinned → hand-rolled audit + a teeth self-test instead);
  fabricating a pending eval step for appearances (S10 is a genuine documented seam); measuring F036 against a
  production build (E2E runs `next dev`; warm steady-state is the honest in-harness proxy); gold-plating ARIA
  beyond the one real announced-error gap (TDD: no production code without a failing test).

## 2026-06-02 — ADR-0016 — Seam closure: durable DB persistence + Supabase Storage + QR option B
**Context.** Post-"feature-complete" (all 42 passing), the maker asked to close the documented persistence seams.
Decisions made WITH the maker: DB host = **Supabase**; E2E stays **hermetic**; uploaded **photo bytes** get durable
storage; **QR video = option B** (not stored web-side). The maker then became unavailable → the rest (plan →
implement → adversarial review → commit) was completed autonomously.
- **DB persistence (orders / finishing / custom).** Prisma adapters now sit behind the SAME surfaces the in-memory
  stores exposed (`OrderRepo`/`WebhookLedger`, `FinishingStore`, `customRequestStore`), selected by a factory gate on
  `process.env.DATABASE_URL`. **Writes do NOT silently fall back** (unlike the catalog *read* path / ADR-0002): with a
  DB configured we use Prisma and let errors propagate — a silent in-memory fallback would create an order that
  vanishes on restart. In-memory is used ONLY when no `DATABASE_URL` (the hermetic `pnpm check` + Playwright path).
  Supabase config: pooled `DATABASE_URL` (pgbouncer :6543) for runtime + `DIRECT_URL` (session pooler :5432) for
  migrations (`directUrl` added to `schema.prisma`; `DIRECT_URL` to env).
- **Schema migrations (Supabase).** `OrderItem.position Int` (0-based; **stable mypage-finishing item addressing** —
  without it DB row order is unspecified and a 2-book order could attach a dedication to the wrong book) +
  `@@unique([orderId, position])`; `CustomStatus.PENDING_PAYMENT` (the WRITTEN pre-payment state). Pure mapping
  helpers (`buildOrderCreateData`/`mapOrderRow`) carry the logic + are unit-tested without a DB; the thin Prisma
  orchestration is integration-verified.
- **Photo bytes → Supabase Storage.** New `src/lib/storage.ts` (`storageConfig`/`putObject`) PUTs bytes to the private
  bucket via the Storage REST API with the **`service_role`** key — **server-only**, never `NEXT_PUBLIC`,
  `redact()`-covered. Env-gated: unconfigured ⇒ `putObject` is a **no-op** (descriptor-only, hermetic E2E unaffected);
  configured ⇒ real PUT, errors surface. Wired into both upload paths (`order/photo-action.ts` pre-pay +
  `mypage/_lib/actions.ts`). `next.config` `serverActions.bodySizeLimit: 25mb` (default 1MB rejects real photos; QR
  video is no longer uploaded so this need only fit photos). **LIVE byte round-trip VERIFIED** — once the maker created
  the private `assets` bucket + supplied the `service_role` key, a gated integration test uploaded an object, read the
  exact bytes back, and deleted it (eval **S11 PASS**). (It was honestly PENDING until the key arrived.)
- **QR option B.** The order keeps the `qrVideoAddon` flag end-to-end; mypage shows an honest **backstage notice**
  (영상은 제작팀이 카카오톡·이메일로 따로 안내), **no web upload**. Removed `uploadQrVideo` +
  `FinishingStore.getQrVideo/setQrVideo`. Rationale: an optional, unpriced add-on doesn't warrant self-serve
  large-video infra, and a personal backstage hand-off fits a handmade keepsake. F018 + `mypage-finish.spec.ts`
  re-spec'd (faithful: still asserts the flag-gated notice + per-order scope, not a vacuous deletion).
- **tz-faithful consultation slot.** Slots are tz-naive wall-clock strings; stored as UTC (`+":00Z"`) + sliced back so
  the displayed value round-trips exactly. The slot is untrusted → `validatePhoneInput` now rejects any non-16-char
  shape (a seconds-bearing value would be tz-shifted; a malformed one would throw on the DateTime write).
- **Verification.** `pnpm check` green (lint + typecheck + **145 unit** + constraints R1–R8 0); **92 hermetic E2E**
  (in-memory; `.env.local` moved aside so Next doesn't load the DB env); a gated live-Supabase integration test
  (`tests/unit/persistence-integration.test.ts`, `skipIf(!DATABASE_URL)`) **4/4** incl. **restart-survival** (a fresh
  PrismaClient reads committed rows) + a Supabase **Storage** byte round-trip (upload→read-back→cleanup); `pnpm eval`
  **1.0** (S10 Postgres-persistence + S11 object-storage bytes both PASS). Throwaway raw-`node` proofs were run + deleted
  during dev; the gated vitest test is the durable artifact.
- **Process — independent worker≠checker (ADR-0005/F042).** 4 parallel refute-by-default sub-agents
  (adapter-correctness / hermetic-safety / security-PII / async-completeness). **3 Major fixed:** (1) untrusted slot
  format → boundary validation; (2) `setPhoto` one-to-one `photoAsset` collision (reachable via the server action when
  a checkout photo exists; backends diverged) → `upsert` (overwrite, matches in-memory); (3) `redact()` was blind to
  both `service_role` shapes (JWT `eyJ….eyJ….sig` + `sb_secret_…`) → patterns + tests. **4 Minor/latent fixed:**
  `putObject` storageKey path-traversal guard; `finishing.ts` `@/lib/db`→relative (vitest has no `@/` resolver);
  `@@unique([orderId,position])`; stale E2E header comment. **1 noted, not fixed:** confirm vs webhook write different
  `tossPaymentKey` values — **pre-existing** (unchanged `checkout.ts`), idempotency holds via the `CREATED`-guard, out
  of this scope.
- Rejected / deferred: storing QR video bytes at all (option B); a separate restricted Storage key vs `service_role`
  (deferred — server-only + private bucket acceptable, flagged); raising Storage beyond Supabase free 50MB (QR-B
  removes the large-file need); claiming eval 1.0 (S11 genuinely unverified without the key — honest PENDING over a
  vanity number).

## 2026-06-03 — ADR-0017 — Deployment plan as `docs/DEPLOY.md`, tracked as harness feature F043
- Decision: Author the production deploy plan/runbook as `docs/DEPLOY.md` (target **Vercel** app + **Supabase**
  Postgres/Storage) AND track it as a **harness-track** feature **F043** verified by `review:` (precedent F041/F042),
  not as a product feature. Scope = the planning/runbook **document**; actually closing the production seams is
  enumerated as a future-F **checklist**, not done here. User chose both (target + track-as-F) via AskUserQuestion.
- Why: The harness ethos is "untracked artifact = not done" — a bare doc would be the silent artifact the harness
  exists to prevent. Harness track is **R8-exempt** (R8 gates only `track:"product"` features), so a `review:`-verified
  doc fits exactly (same shape as F041/F042). Vercel+Supabase is the canonical Next.js 15 + Prisma + Supabase pairing
  already chosen for DB/Storage (ADR-0016), so it is the most actionable target.
- Honest scope the doc pins (verified file:line): prod `/api/payments/create` **503s** (real Toss browser SDK unbuilt);
  mypage HMAC capability-cookie **≠ real buyer auth** (no session lib exists); `TOSS_WEBHOOK_SECRET` /
  `MYPAGE_ACCESS_SECRET` **fail-closed in prod** (the latter not even in the zod schema → no boot warning); pooled
  `DATABASE_URL`(:6543) runtime vs `DIRECT_URL`(:5432) for `prisma migrate deploy`; `prisma generate` **not wired into
  build** (Vercel cache gotcha → use `prisma generate && next build`); **Vercel's 4.5MB Function body cap** is a
  platform limit `bodySizeLimit:"25mb"` cannot lift (large child-photo upload = pre-launch blocker); go-live =
  `deploy.production` approval token + live-key boot refusal.
- Process (worker≠checker, ADR-0005/F042): a **12-agent workflow** — 6 read-only file:line fact-sheets → 1 draft →
  a **5-dimension refute-by-default review**. env-completeness / migration-correctness / seam-accuracy = **CLEAN**;
  vercel-specifics 1 **Major** (4.5MB body cap) + 2 Minor (Vercel runtime Node major via Project Settings not
  `.nvmrc`; prefer build-command over `postinstall` for `prisma generate`) + 1 nit; internal-consistency 1 nit
  (42→43 feature count). **ALL findings applied** to the doc. `pnpm check` green; constraints **R1–R8 0** (R4 holds
  with F043 `passing`). **43/43 features passing** (product 32/32 · harness 11/11).
- Rejected / out of scope: a **product**-track F (no buyer-facing E2E surface → would violate DoD #3 / R8); a
  doc-only artifact with **no** feature gate (untracked, against the harness ethos); a platform-agnostic doc (less
  actionable than the already-chosen Vercel+Supabase path). **Named, not silent:** fixing the stale
  `docs/ARCHITECTURE.md` (Stripe/Book residue) is an existing follow-up; building the seam-closure items themselves
  is future product work.

## 2026-06-03 — ADR-0018 — Stripe→Toss residue cleanup + stray-folder removal (drift, not a feature)
- Decision: Clear the long-standing Stripe→Toss prose/CI residue (tracked as a non-gate follow-up in
  PROGRESS since F003/ADR-0009) and remove two stray artifacts. Not a `feature_list` item — pure drift
  cleanup, so no new F-id; recorded here + in PROGRESS. Fixed: `.github/workflows/ci.yml` (E2E env
  `STRIPE_*` → `TOSS_*` test placeholders + comment), removed the **dead `stripe` npm dependency**
  (`package.json` + lockfile; grep-verified zero imports in `src/`), and re-pointed the prose docs —
  `docs/SAFETY.md` (action-key table re-aligned to `guardrails.ts` `IRREVERSIBLE_ACTIONS`, adding the
  previously-**missing `consultation.book`** and Toss webhook RAW-body HMAC / F013), `docs/CONSTRAINTS.md`,
  `README.md`, and `docs/ARCHITECTURE.md` (also corrected its stale **Book/stock** data model → the real
  **Template / Order / made-to-order** schema, and **cents → KRW won**). Updated `docs/DEPLOY.md`'s own
  drift-notes (§7/§9/§13) so they reflect the fix instead of becoming new drift.
- Deliberately KEPT (NOT drift): (1) the **defence-in-depth** legacy-Stripe key regex in
  `scripts/check-constraints.mjs` R1 + `src/lib/env.ts` `redact()` (+ the asserting branch in
  `tests/unit/smoke.test.ts`) — intentional belt-and-suspenders, documented in-code; (2) the **historical
  ADRs** in this file (immutable record of the Stripe→Toss transition); (3) **`eval/holdout`** — reserved,
  must never be tuned (F041 / rubric G4), so its "Cancel at Stripe" wording stays untouched (`eval/golden`
  was already re-pointed under F040). `PRODUCT_BRIEF.md`'s "Stripe 스캐폴딩 교체" lines are product-intent
  history → left as-is.
- Stray folder: deleted an **empty** root folder whose literal name was a mangled Windows path
  (`C:` + U+F03A PUA char + `devtest1srcapp_componentsordersteps` — i.e. `src/app/_components/order/steps`
  collapsed into one name). An adversarial refute-by-default subagent + a direct check confirmed it was
  empty, untracked by git, unreferenced by any import/tsconfig/next.config, and that the real components
  live at `src/app/_components/order/steps/` — so deletion is inert. Removed via literal-path delete (the
  illegal-char name is glob-unsafe). Also committed the previously-untracked `docs/DEPLOY.md` (F043).
- Why now / why safe: the residue was cosmetic (optional/ignored env, unused dep, prose) so it never gated
  `pnpm check`, but the **SAFETY.md action-key omission was a real accuracy bug** (a human reading it would
  miss `consultation.book` and see non-existent `stripe.charge.live`). No `feature_list` `state/passes`
  changed; R1–R8 unaffected (R1's regex still catches both Toss and legacy Stripe live shapes).
- Incidental gate fix (surfaced while greening `pnpm check`): a sibling git worktree
  (`.worktrees/preview-real-photos`, another track's WIP — NOT touched) is git-ignored via
  `.git/info/exclude` but was **not** excluded from the repo's own tooling, so running `pnpm check`
  from the root linted/scanned the worktree's `.next` build + source and failed. Added `.worktrees`
  to `eslint.config.mjs` `ignores` and to the `check-constraints.mjs` `SKIP` set so root gates never
  reach into sibling worktrees — closes a real gap in the AGENTS.md-endorsed parallel-worktree
  workflow. With this, `pnpm check` is green (lint + typecheck + 145 unit + R1–R8 0).

## 2026-06-08 — ADR-0019 — F044: real TossPayments browser SDK payment (prod path)
- **Decision:** Replace the hermetic `/checkout/pay` sandbox stand-in (ADR-0013 D1) with the real
  TossPayments browser SDK (`loadTossPayments → payment(ANONYMOUS) → requestPayment`). The production
  503 gate on `/api/payments/create` is removed; the `Checkout` response gains `clientKey` (publishable
  test key — not the secret key, safe to expose to the browser). A single client path now covers both
  dev and prod: no app-level branch on `APP_ENV`, no parallel sandbox+prod code.
- **Key sub-decisions:**
  - **Server-issued `clientKey` + server-recomputed amount forwarded to `requestPayment`.** The client
    never reads the key from env directly (not `NEXT_PUBLIC_`); it receives it from the server via the
    `Checkout` response (`clientKey` field). Amount is the server's `order.amountWon`, recomputed from
    authoritative `Template` prices (ADR-0013 D2 continuity). `orderId` carries the `ord_` prefix and
    satisfies the Toss constraint (6–64 `[A-Za-z0-9-_]`), enforced by `createCheckout` + a unit test (R10).
  - **Success page server-confirms idempotently with already-PAID short-circuit.** `confirmPayment`
    checks the order's existing status before calling the Toss gateway — a reload (or a webhook arriving
    first) that finds `status === 'PAID'` returns success immediately without a duplicate gateway call
    (verified in `webhook.test.ts`).
  - **Cancel → `/cart` preserves F016.** The Toss SDK `failUrl` is `/checkout/failed`; the `failed` page
    detects `code=PAY_PROCESS_CANCELED` and redirects to `/cart` so the cart is preserved — F016's
    "Return to /cart" contract is frozen and unchanged.
  - **Mechanical E2E hermeticity via `webServer.env`.** `playwright.config.ts` now sets
    `DATABASE_URL: ""` in the `webServer` environment so every E2E run forces the in-memory store,
    regardless of what `.env.local` contains — no accidental live-Supabase pollution. All 7 checkout/mypage
    specs migrated from the `PaySandbox` redirect pattern to `page.addInitScript` (injects
    `window.TossPayments` before the page script runs), keeping the suite hermetic without a real hosted window.
  - **R10 `orderId` guard.** `createCheckout` validates the `tossOrderId` against `[A-Za-z0-9-_]{6,64}`;
    any violation throws before the order is written, preventing a Toss API rejection mid-flight.
- **Scope / named seams (not silent):**
  - **Webhook excluded → F045 named seam.** The Toss production webhook signature scheme mapping and the
    `TOSS_WEBHOOK_SECRET` boot-required-in-prod guard are deferred to F045 (the webhook safety-net feature),
    which is registered as the next named seam. The existing HMAC path continues to work in test mode.
  - **Real hosted window opening verified by Vercel prod canary, not hermetically.** Opening the actual
    Toss-hosted payment window requires a live browser hitting the real Toss SDK CDN; this cannot be done
    hermetically. Post-deploy verification is a manual `vercel --prod` canary round-trip (the env vars are
    already set in Vercel). This is the planned verification step per the design doc (§7c).
- **Process:** brainstorm → spec (`docs/superpowers/specs/2026-06-08-f044-toss-browser-sdk-design.md`) →
  plan → adversarial **plan-review (19 findings, all refute-by-default re-verified; 0 blocker)** →
  subagent-driven TDD → independent **worker≠checker 6-lens implementation review (12 findings, 0 blocker;
  majors = hermeticity strategy, R10 orderId guard, evidence completeness — all reflected)**. An earlier
  prod-compromise (enabling a `CartView <Link>→<a>` workaround + an `ord_` id-prefix patch in the app
  to satisfy a checkout route bug) was caught in the implementation review and reverted in favour of
  test-side fixes — the app code stayed canonical, the E2E helpers were fixed instead.
- **Rejected alternatives:**
  - Parallel sandbox+prod branch (`APP_ENV` switch keeping both code paths) — two paths diverge silently;
    the real path would never be exercised in hermetic CI.
  - App-level window hook (`window.__tossPayments`) loaded by the client component — mixes test seam into
    production bundle; `page.addInitScript` is test-side only and has no production footprint.
  - Cancel-copy-on-the-failed-page (adding a "cancel" copy variant to `/checkout/failed`) — F016's frozen
    "Return to /cart" step is the contract; the existing `code=PAY_PROCESS_CANCELED` → `/cart` redirect
    satisfies it without new copy.
- Gates: `pnpm check` green (lint + typecheck + **147 unit** + 0 constraints R1–R9); **95 hermetic E2E**
  (7 checkout/mypage specs migrated to addInitScript; no regressions); `pnpm constraints` ok:true count:0.
  **44/44 features: product 33/33 · harness 11/11.**

## 2026-06-11 — ADR-0021 — F046: real buyer auth (email-OTP possession proof)
> ADR-0020 is F045's (Toss webhook, merged to master `d841845`); F046 takes the next free id, 0021.

Replaces the mypage HMAC capability-cookie **front door** (order#+email string match — the ADR-0014
stand-in) with an **email-OTP possession proof** + durable **atomic** per-order rate-limiting. The
capability-cookie layer is **kept**; only what mints it changes.

- **D1 model:** possession proof, **no accounts** (one-shot keepsake guest checkout; next-auth/iron-session
  stay 0 hits). **D2:** 6-digit OTP (in-flow; avoids the magic-link mail-prefetch footgun).
- **D3 store:** durable Prisma `OtpCode` (`DATABASE_URL ? Prisma : in-memory`, the orders.ts pattern).
  Stateless-signed **rejected** (cannot enforce single-use / attempt-cap). **Every mutation is an atomic
  conditional write** (markPaid idiom + one `INSERT…ON CONFLICT…WHERE` for issue; verify/consume =
  conditional `updateMany`) to survive Vercel multi-instance — read-modify-write would race past the cap.
  The plaintext code never enters the store (order-bound HMAC only, reusing `MYPAGE_ACCESS_SECRET` — no new
  secret).
- **D4 email gate:** boot/config **fail-closed**, NOT per-send `requireApproval` (a one-shot CLI intent
  token is the wrong tool for automated transactional mail — baking it into prod env is a flag, not a gate).
  Non-prod → mock adapter; prod → real provider only if configured, else fail-closed. Enabling email = the
  go-live cutover. `guardrails.ts` untouched; R3 is advisory for `.send(`.
- **D5 env:** `MYPAGE_ACCESS_SECRET` required-in-prod at boot on a hardened `isProductionRuntime`
  (`VERCEL_ENV` cross-check) so a mistyped `APP_ENV` on Vercel cannot fail open. Absorbs the DEPLOY §10
  boot-validation item (no separate F-item).
- **D6 provider:** Resend target; the real adapter is a **paired follow-up** (F012→F044 precedent), so prod
  mypage is **fail-closed-until-provisioned** — accepted as a named seam.

**Security invariants.** Possession proof (NEW); no existence oracle (uniform `stage:verify` both paths +
equal hash; the request-timing residual is deferred to an edge constant-time seam); brute-force / email-bomb
bounded by the durable atomic caps (attempt-cap 5, send-throttle 5/h, 10m TTL, single-use); single-use via
atomic consume + **mint-before-consume** null-guard; canonical 6-digit (malformed rejected before any
debit); PII — email `redact()`-masked, code **by-construction omitted** (never logged).

**Process (brainstorm → spec → plan → 2 adversarial reviews → TDD → worker≠checker).** A PRE-build 6-dim
design review folded **20/21 findings** — incl. 3 concurrency **blockers** that reshaped the store to atomic
conditional writes, the single-`APP_ENV` fail-open, canonical padding, and the fire-and-forget email drop →
`after()`. Built TDD (RED witnessed for env/email/otp + the E2E). A POST-build independent worker≠checker
review (6 dims, refute-by-default; the gated concurrency test executed independently). **Atomicity is a
required gate:** hermetic `pnpm check` skips the Prisma path, so the docker-Postgres concurrency run (N=25
parallel verifies ⇒ exactly 5 debits; N=25 parallel issues ⇒ exactly 5 sends; parallel consume ⇒ single-use)
is mandatory evidence (ADR-0016 S10/S11 precedent).

**Gates.** `pnpm check` green (lint+typecheck+**165 unit**+R1–R9 0) + **13/13 mypage E2E** + the gated
`otp-persistence-integration` **4/4 against docker Postgres**.

**Scope / parallel-safety.** F046-only files; **no** payments / F045 / `guardrails.ts` /
`check-constraints.mjs` touched. `env.ts` is a known 3-way merge with F045's `TOSS_WEBHOOK_SECRET` block
(keep both throws; `pnpm verify` post-merge gate). `feature_list.json` append-only (F045 entry untouched in
this branch). **Not deployed** — the maker runs the single `vercel --prod` after F045+F046 land and
provisions the email provider.
