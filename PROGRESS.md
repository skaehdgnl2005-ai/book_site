# Progress Log

## Handoff (resume here)   ← was session-handoff.md; consolidated to cut sync/drift (M4)
- Resume with: `./init.sh` → read this file + `git log --oneline -20` → pick top `passes:false`
  in `feature_list.json` (WIP=1) → `pnpm attempt <id>` before working it.
- **Latest (2026-06-11): F046 — real buyer auth (email-OTP) implementation DONE; gates green; passes:true set this session after the worker≠checker review.** The mypage HMAC-cookie front door (order#+email string match) is replaced by an **email-OTP possession proof** + a durable **atomic** per-order `OtpCode` store (`DATABASE_URL ? Prisma : in-memory`; attempt-cap / send-throttle / single-use as atomic conditional writes — the markPaid idiom + one `INSERT…ON CONFLICT`). The HMAC capability cookie is **kept**, minted only after a correct OTP. `MYPAGE_ACCESS_SECRET` is now boot-validated on a hardened `isProductionRuntime` (VERCEL_ENV cross-check, so a mistyped APP_ENV on Vercel can't fail open). Email behind a provider-agnostic adapter (mock + fail-closed prod stub; the real **Resend** adapter is a paired follow-up ⇒ prod mypage **fail-closed-until-provisioned**). **ADR-0021** (ADR-0020 is F045's, merged). **Atomicity is a required gate** (hermetic `pnpm check` can't prove it): gated `otp-persistence-integration` is **4/4 against docker Postgres** (N=25 parallel verifies⇒exactly 5 debits, N=25 parallel issues⇒exactly 5 sends, parallel consume⇒single-use). Plus `pnpm check` green (165 unit, R1–R9 0) + **13/13 mypage E2E** (capability-cookie R1/R7/R9 invariants preserved verbatim; wrong-email strengthened to uniform-advance + no-access). F046-only files; `env.ts` is a known 3-way merge with F045's `TOSS_WEBHOOK_SECRET` block (keep both; `pnpm verify` post-merge gate). **Not deployed** — maker runs the single `vercel --prod` after F045+F046 land and provisions the email provider.
- **⚠️ F046 → master MERGE NOTE (do NOT lose F045's passing state) — flagged by the worker≠checker review.** This branch was cut from `cc9793f` (pre-F045), so its `feature_list.json` and `src/lib/env.ts` still carry the *baseline* F045 state; F045 was promoted to passing on master (`d841845`). A 3-way merge therefore **conflicts** in both files. Resolve by keeping master's side for F045 and adding F046: **(1) `feature_list.json`** — keep master's F045 entry verbatim (state:passing/passes:true/ADR-0020 evidence/E2E-gated verification) and append ONLY the F046 entry; **never `-X ours`/take-HEAD wholesale** (that silently reverts F045 to not_started → breaks R4). **(2) `src/lib/env.ts`** — keep **all three** prod-boot throws in order: F045's `TOSS_WEBHOOK_SECRET`, then F046's `VERCEL_ENV` backstop + `MYPAGE_ACCESS_SECRET`. Then `pnpm check` must be green. (Rebasing `feat/F046` onto master first makes `feature_list.json` a clean append; the `env.ts` conflict remains and is resolved the same way.)
- **Latest (2026-06-08): F044 — real Toss browser SDK payment DONE + passing.** The hermetic `/checkout/pay` sandbox
  stand-in is removed; `/api/payments/create` now returns `clientKey` (publishable test key) and the browser calls
  `loadTossPayments → payment(ANONYMOUS) → requestPayment` via the real Toss SDK. All 7 checkout/mypage E2E specs
  migrated from `PaySandbox` redirect pattern to `page.addInitScript` (injects `window.TossPayments` before the page
  script) — 95 hermetic E2E, no regressions. `pnpm check` green (147 unit + R1–R9 0). Independent worker≠checker:
  plan-review 19 findings + implementation 6-lens 12 findings, 0 blocker. **Prod is now ready to redeploy via
  `vercel --prod`** (env vars already set in Vercel); the remaining real-window verification is a manual canary
  round-trip post-deploy (the hermetic suite cannot open the actual Toss-hosted window). **F045** (Toss webhook real
  signature scheme + `TOSS_WEBHOOK_SECRET` boot guard) is registered as the next named seam. Decision: **ADR-0019**.
  **44/45 features passing (product 33/34 incl. F044, F045 not_started · harness 11/11); `pnpm status` product 97%.**
- **Latest (2026-06-03): F043 — production deploy plan & runbook DONE + passing.** `docs/DEPLOY.md` (13 sections,
  Vercel + Supabase): topology, a prominent PRE-LAUNCH REALITY CHECK (prod payment 503s, real Toss browser SDK not
  built, mypage HMAC ≠ real buyer auth), full env/secrets table, Supabase pooled(:6543)/direct(:5432) DB setup,
  `prisma migrate deploy` runbook, Vercel build config (`prisma generate && next build` gotcha), private `assets`
  Storage bucket, `deploy.production` approval-gate + live-key-boot-refusal go-live cutover, a **seam-closure
  checklist of future F-items**, post-deploy canary, forward-only-migration rollback, and a doc-drift flag
  (`ARCHITECTURE.md` stale). Built via a 12-agent workflow (6 file:line fact-sheets → draft → 5-dim refute-by-default
  review; env/migration/seam-accuracy = CLEAN; vercel-specifics 1 Major [Vercel's 4.5MB Function body cap vs
  `bodySizeLimit:25mb` → large-photo upload is a pre-launch blocker] + minors → ALL applied). Decision: **ADR-0017**.
  **ALL 43 features now passing (product 32/32 · harness 11/11);** `pnpm check` green, `pnpm status` READY.
- Next action (single): **ADR-0016 seam closure DONE** — durable DB persistence (Supabase Prisma adapters behind the
  orders/finishing/custom surfaces, gated on `DATABASE_URL`, no silent write-fallback), photo bytes → Supabase Storage
  (`src/lib/storage.ts`, env-gated), QR **option B** (flag + backstage notice, no web upload). Gates: `pnpm check` 145
  unit + 92 hermetic E2E + gated live-Supabase integration **4/4 (restart-survival)** + `pnpm eval` 0.909.
  **⤷ Maker step DONE:** the PRIVATE `assets` bucket + `SUPABASE_SERVICE_ROLE_KEY` are in place → photo-byte storage is
  LIVE and **eval S11 verified** (upload→read-back→cleanup), so **`pnpm eval` is now 1.0**. All seams closed. Prior work:
  **TRACK-POLISH (F036, F037, F039, F040, F042) DONE + passing** — the cross-cutting
  polish track closes the entry line. **F036** perf budget (`perf.spec.ts`: p95<2s on home + both categories, measured
  WARM steady-state via Navigation Timing, ~580–680ms / ≈3× headroom, each route's p95 emitted as a `kind:"metric"`
  trace). **F037** a11y (`a11y.spec.ts`: a hermetic in-browser DOM audit over 14 pages + a teeth self-test; found+fixed
  2 REAL defects — `PhotoStep`'s unlabelled file input + the order wizard's un-announced validation errors →
  `aria-labelledby`/`role="alert"`/`aria-invalid`/`aria-describedby`). **F039** ops metrics (`src/lib/metrics.ts`:
  error/failure rate + latency p50/p95 from the `traced()` stream, PII-safe via the redacted sink; `metrics.test.ts` +6).
  **F040** entry-line eval (`golden` re-pointed Stripe→Toss; `task_success_rate 0.9` with the durable-persistence seam
  honestly PENDING; **holdout untouched** per F041). **F042** worker≠checker protocol doc (`docs/WORKER_CHECKER.md`)
  applied LIVE this session: 4 adversarial sub-agents reviewed F036/F037/F039/F040 → **ALL ACCEPT, 0 code findings**.
  Decisions + scope-ratification (F037 touched TRACK-ORDER's `InfoStep`/`PhotoStep`, additive ARIA only): **ADR-0015**.
  **ALL 42 features were passing as of ADR-0016 (product 32/32 · harness 10/10); F043 added 2026-06-03 → 43/43 (see top).** **Next pick:** no open feature work — remaining items
  are named backstage/production seams (durable Postgres/Asset persistence, real Toss browser SDK, real buyer auth — all
  out of web scope) + the Stripe→Toss prose/CI residue cleanup follow-up below. mypage/custom routes still not Nav-wired
  (F002-owned, import-only).
- **TRACK-CHECKOUT decisions (ADR-0013 — read before mypage):** order persistence is a hermetic `globalThis`
  store + `ProcessedWebhook` ledger under `src/app/api/payments/_lib/` (Prisma adapter is the documented prod
  seam; hermetic items key by `templateKey`, prod resolves `templateKey`→`Template.id`). Amount is recomputed
  server-side from authoritative `Template` prices; `clearCart()` runs client-side ONLY after PAID. `/orders/[id]`
  renders NO PII (sequential ids, unauthenticated). The real Toss browser-SDK + boot-required `TOSS_WEBHOOK_SECRET`
  are flagged production seams (create route 503s in production).
- Broken / not done: **Mypage (F017/F018) DONE + passing** (this work). 맞춤 제작 (F020–F023) **merged + passing**
  (custom routes not yet wired into the global Nav — F002-owned/import-only; follow-up like content). F009 +
  mypage store still hold only the access-controlled photo/QR **descriptor** — durable object-storage of the
  bytes + the real `Asset`/`Personalization` DB rows remain a named backstage seam (ADR-0011/0014). Content pages static + not Nav-wired; real assets/founder-story/
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
- **Follow-up (Stripe→Toss residue) — DONE 2026-06-03 (ADR-0018):** cleaned up `.github/workflows/ci.yml`
  (now `TOSS_*` test placeholders), removed the dead `stripe` npm dep (+ lockfile), and re-pointed the prose
  docs `docs/SAFETY.md` (action-key table now == `guardrails.ts`, incl. the previously-missing
  `consultation.book`) / `docs/CONSTRAINTS.md` / `docs/ARCHITECTURE.md` (also fixed its stale Book/stock model
  + cents→KRW won) + `README.md`. Deliberately KEPT: the defence-in-depth legacy-Stripe regex in
  `check-constraints.mjs`/`env.ts` (+ its `smoke.test.ts` branch), the historical ADRs in `DECISIONS.md`, and
  `eval/holdout` (reserved — must never be tuned, F041/G4; `eval/golden` was already re-pointed under F040).
  Also deleted an empty stray folder whose name was a mangled Windows path (subagent-verified
  empty/untracked/unreferenced), and committed the previously-untracked `docs/DEPLOY.md` (F043).

## Current verified state   ← single source of truth
- Last green `pnpm check`: **2026-06-02** (lint + typecheck + **145 unit** + 0 constraint violations, incl.
  R4/R5/R8 invariants) — incl. ADR-0016 (DB persistence + storage + QR-B). The live-Supabase integration test
  (`persistence-integration.test.ts`) is **gated `skipIf(!DATABASE_URL)`** → skipped in hermetic check.
- E2E (`pnpm test:e2e`): **92 passed** (hermetic / in-memory; run with `.env.local` moved aside so Next doesn't load the DB env).
- Live-Supabase integration (`set -a; . .env.local; set +a; pnpm exec vitest run persistence-integration`): **6/6** —
  orders / finishing / custom round-trip AND **survive a restart** (fresh PrismaClient reads committed rows), PLUS
  **photo-byte storage** (Supabase Storage upload → read-back → cleanup); self-cleans, no pollution.
- Eval (`pnpm eval`): `task_success_rate` **1.0** — all 11 steps pass, incl. S10 durable **Postgres** persistence AND
  S11 durable object-storage of upload **bytes** (Supabase Storage, live-verified by the upload→read-back→cleanup round-trip).
- Boots via `./init.sh`: **yes** (install → check → ready, exit 0)
- **Two honest, separate numbers** (`pnpm status`):
  - **Harness readiness** (machinery, product-agnostic): 85.2/100 → READY (see `SCORECARD.md`)
  - **Product delivery** (그림책 제작소 store): **33 / 34 product features passing (97%)** — F001/F002 home, F003 payment, F004 DB+seed, F029 asset, F024–F028 content, F005/F006 catalog, F007–F011 + F019 order funnel, F020–F023 맞춤 제작, F012–F016 checkout, F017/F018 mypage finishing, F035 responsive (375px), F036 perf (p95<2s), F037 a11y, **F044 real Toss browser SDK**. (**F045** webhook seam not_started → the 1 non-passing product feature)
  - harness-track features passing: **11 / 11** (+F034 checkout verification, F039 ops metrics, F040 entry-line eval, F042 worker≠checker protocol, **F043 deploy plan**).
- Bootstrap contract (build_guide §7): **MET** — boots, verified tests exist, AGENTS.md router, feature_list aligned.

## Status
Harness **INITIALIZED + review-hardened + repurposed to 그림책 제작소**. Spec layer (brief/schema/
feature_list/router) now reflects the real product; DESIGN.md (Atelier Sans) wired + enforced. Coding loop next.

## Session log (newest first)
### 2026-06-11 — F046: real buyer auth (email-OTP possession proof)  [feat/F046]
- Replaced the mypage HMAC-cookie front door with an **email-OTP possession proof**. Stage 1
  `requestAccessCode` (order#+email → on match issue+send a 6-digit OTP, **always** advance to verify =
  no existence oracle; send via `after()`; equal hash both paths); stage 2 `verifyAccessCode` (atomic
  `verifyDebit` → constant-time compare → **mint-before-consume** + null-guard → capability cookie →
  redirect; malformed input rejected before any debit). 2-stage `MypageLookup` (`useActionState`,
  mounted-gated submit per `PhoneForm`/`WrittenForm`). The HMAC capability cookie (`access.ts`) is unchanged.
- **Durable, atomic store** (`src/app/mypage/_lib/otp.ts`, new): `OtpCode` model (`DATABASE_URL ? Prisma :
  in-memory`). Every mutation is an **atomic conditional write** so it survives Vercel multi-instance:
  issue = one `INSERT…ON CONFLICT…WHERE` (insert / in-window-increment / window-reset / throttled=0-rows);
  verify = `updateMany` increment guarded `attempts<MAX`; consume = conditional `updateMany`. Plaintext code
  never stored (order-bound HMAC reusing `MYPAGE_ACCESS_SECRET` — no new secret). Provider-agnostic
  `EmailAdapter` (`src/lib/email.ts`, new): mock outbox (non-prod) + fail-closed prod stub (D4 boot/config
  gate, not per-send approval). `env.ts`: `MYPAGE_ACCESS_SECRET` required-in-prod + hardened
  `isProductionRuntime` (VERCEL_ENV cross-check).
- **Process (ADR-0021):** brainstorm → spec → plan → **PRE-build 6-dim design review (20/21 folded, 3
  concurrency blockers)** → TDD (RED witnessed for env/email/otp + the E2E) → **independent worker≠checker
  6-dim implementation review** (refute-by-default; the gated concurrency test executed independently).
- **Gates:** `pnpm check` green (lint+typecheck+**165 unit**+R1–R9 0) + **13/13 mypage E2E** + the gated
  `otp-persistence-integration` **4/4 on docker Postgres** (the REQUIRED atomicity proof — `pnpm check`
  skips the Prisma path). F046 → `passing` + dated evidence; `pnpm attempt F046 --reset`. F046-only files,
  no payments/F045/guardrails/check-constraints touched. **Not merged/deployed** (maker step).

### 2026-06-08 — F044: real TossPayments browser SDK payment  [feat/F044-toss-sdk]
- Replaced the hermetic `/checkout/pay` sandbox stand-in (ADR-0013 D1) with the real Toss browser SDK:
  `loadTossPayments → payment(ANONYMOUS) → requestPayment`. The production 503 gate on
  `/api/payments/create` is removed; the `Checkout` response gains `clientKey` (publishable test key,
  server-issued — not `NEXT_PUBLIC_`). A single client path now covers dev and prod with no `APP_ENV`
  branch in the app code.
- **Key decisions (ADR-0019):** server-issued `clientKey` + server-recomputed amount forwarded to
  `requestPayment`; `confirmPayment` already-PAID short-circuit (reload/webhook-first safety;
  `webhook.test.ts` verified); cancel → `failUrl code=PAY_PROCESS_CANCELED → /cart` (F016 contract
  frozen); mechanical E2E hermeticity via `playwright.config.ts` `webServer.env DATABASE_URL:""`
  (forces in-memory, no Supabase pollution); R10 `orderId` guard (`[A-Za-z0-9-_]{6,64}`, throws
  before write). Named seams: real hosted window opening = Vercel prod canary (post-deploy manual
  round-trip); webhook real-sig scheme = F045.
- **E2E migration:** all 7 checkout/mypage specs migrated from `PaySandbox` redirect to
  `page.addInitScript` (injects `window.TossPayments` test-side before the page script). 95 hermetic
  E2E passed, no regressions.
- **Process:** brainstorm → spec → plan → adversarial plan-review (19 findings, 0 blocker) →
  subagent-driven TDD → worker≠checker 6-lens impl review (12 findings, 0 blocker; majors =
  hermeticity, R10, evidence — all reflected). An earlier app-level prod-compromise was caught in
  review and reverted; test-side fixes used instead. Decision: **ADR-0019**.
- **Gates:** `pnpm check` green (lint + typecheck + **147 unit** + R1–R9 0 constraints); **95 hermetic
  E2E** (no regressions); `pnpm attempt F044 --reset`. **44/45 features passing: product 33/34 (97%) · harness 11/11 (F045 not_started).**
  Prod ready for `vercel --prod` redeploy; real-window canary is the remaining verification step. F045
  registered as the next named seam.

### 2026-06-02 — ADR-0016 seam closure: durable DB persistence + Supabase Storage + QR option B  [master]
- Post-"feature-complete" work, maker-directed (DB=Supabase, E2E hermetic, photo bytes durable, QR=option B), then
  finished autonomously (maker unavailable) plan→implement→adversarial-review→commit. **Full record: DECISIONS ADR-0016.**
- **DB persistence.** Prisma adapters behind the existing `OrderRepo`/`WebhookLedger` (`api/payments/_lib/orders.ts`),
  `FinishingStore` (`mypage/_lib/finishing.ts`), `customRequestStore` (`lib/customRequest.ts`) surfaces, gated on
  `DATABASE_URL`. **Writes never silently fall back** to in-memory (would lose data on restart); in-memory only when no
  DB (hermetic). Sync→async refactor of those surfaces + every consumer (`checkout.ts`, the payment/custom routes, the
  order/mypage pages, `state/route.ts`) awaited; `webhook.test.ts`/`custom-request.test.ts` updated. Supabase: pooled
  `DATABASE_URL` :6543 + `DIRECT_URL` :5432 (migrations). Migrations applied: `OrderItem.position` + `@@unique`,
  `CustomStatus.PENDING_PAYMENT`.
- **Photo bytes → Supabase Storage** (`src/lib/storage.ts`, TDD): `putObject` server-only `service_role` PUT, env-gated
  (unconfigured ⇒ no-op descriptor-only ⇒ hermetic E2E unaffected). Wired into pre-pay (`photo-action.ts`) + mypage
  (`actions.ts`). `next.config` `serverActions.bodySizeLimit:25mb`. **S11 byte round-trip LIVE-VERIFIED** against the
  private `assets` bucket (upload→read-back→cleanup) once the maker supplied the `service_role` key.
- **QR option B**: order keeps the `qrVideoAddon` flag; mypage shows a backstage notice, **no web upload**
  (`uploadQrVideo` + `FinishingStore` QR methods removed). F018 + `mypage-finish.spec.ts` re-spec'd.
- **worker≠checker** (4 refute-by-default sub-agents): **3 Major + 4 Minor/latent fixed** (slot boundary-validation;
  `setPhoto` upsert vs one-to-one collision; `redact()` now covers `service_role` JWT/`sb_secret_`; storageKey
  path-guard; finishing relative-import; `@@unique` invariant; stale comment). 1 pre-existing key-nondeterminism noted.
- **Gates:** `pnpm check` green (lint+typecheck+**145 unit**+constraints R1–R8 0); **92 hermetic E2E**; gated live-Supabase
  integration test (`persistence-integration.test.ts`) **6/6** (orders/finishing/custom restart-survival + photo-byte
  Storage round-trip); `pnpm eval` **1.0** (S10 Postgres + S11 object-storage bytes both verified). **All persistence
  seams closed** — the maker supplied the `service_role` key + `assets` bucket, so byte storage is live.

### 2026-06-02 — TRACK-POLISH (F036, F037, F039, F040, F042) cross-cutting polish + eval  [feat/polish]
- Closed the entry line with the cross-cutting polish track (F035 375px was already done). Each feature TDD
  (test-first, watched RED→GREEN), then ONE independent worker≠checker review before any `passes:true`.
- **F036 perf** (`tests/e2e/perf.spec.ts`): asserts **p95 < 2000ms** on `/` + `/anniversary` + `/first-moments`,
  measured as the browser's Navigation-Timing `duration` over **20 WARM loads** (2 unmeasured warmups absorb
  `next dev`'s on-demand per-route compile; nearest-rank p95 drops only the single worst sample). Observed
  ~580–680ms (≈3× headroom). Each route's p95 is emitted as a `kind:"metric"` line via the real
  `observability.emit()`, tying perf into the F039 stream / OBSERVABILITY.md H3. Honest scope: the budget targets
  steady-state serve latency (production proxy); a genuinely >2s page recurs on warm loads and fails (real teeth).
- **F037 a11y** (`tests/e2e/a11y.spec.ts`): a **hand-rolled in-browser DOM audit** (no axe dep → hermetic) over
  **14 pages** — heading order (first h1, no descending skips), every control accessibly named, every `<img>` has
  alt — plus a **teeth self-test** (broken fixture → all 3 violation classes flagged) and a **wizard deep-step
  audit** (the page sweep only sees initial render). Found + fixed **2 real defects**: `PhotoStep`'s file input had
  no accessible name (label was a bare `<p>`) → `aria-labelledby`; the order wizard was the only form whose
  validation errors weren't announced → `role="alert"` + `aria-invalid` + `aria-describedby` (`InfoStep`/`PhotoStep`).
  Additive ARIA only → order specs still 13/13 (no regression).
- **F039 ops metrics** (`src/lib/metrics.ts` + `tests/unit/metrics.test.ts` +6): `collectMetrics` /
  `collectMetricsBySession` / `createCollector` derive error rate, tool-call failure rate, and latency p50/p95/max
  from the `traced()` trace stream (per OBSERVABILITY.md H2). `createCollector` plugs into `traced()`'s sink and
  consumes **already-redacted** `emit()` lines, so PII can't reach metrics (proven by a test). Null-safe on empty.
- **F040 entry-line eval** (`eval/golden/purchase-flow.json`): re-pointed the Stripe-era golden to the real **Toss
  entry-line journey** (S1–S9 → real passing features + their actual E2E specs, `impl:true`; S10 durable-persistence
  seam `impl:false`). `pnpm eval` → `task_success_rate 0.9`, the seam reported **pending, not success**.
  **`eval/holdout/` untouched** (F041 boundary, G4).
- **F042 worker≠checker doc** (`docs/WORKER_CHECKER.md`): roles, 3-tier independence, refute-by-default stance,
  Accept/Revise/Block, 6 dimensions, recording-before-`passes:true` (tied to R4). `docs/EVAL.md` links it + the
  stale `F032`→`F042` reference fixed. **Applied instance = this session's review.**
- **Process (worker≠checker, ADR-0005/F042):** 4 parallel adversarial sub-agents (refute-by-default; barred from
  `pnpm test:e2e` to avoid port-3000 races since the suite was already green) reviewed F036/F037/F039/F040 →
  **ALL ACCEPT, zero blocker/major/minor code findings.** The only item was this ADR (process ratification of
  F037's additive-ARIA touch into TRACK-ORDER's `InfoStep`/`PhotoStep`). Decisions: **ADR-0015**.
- Gates: `pnpm check` green (lint+typecheck+**131 unit**+0 constraints R1–R8 incl. R4/R8) + **92 E2E** (71 prior +
  3 perf + 18 a11y, no regressions) + `pnpm eval` 0.9 (honest pending). F036/F037/F039/F040/F042 → `passing` +
  dated evidence (R4 holds). **Product delivery 30→32/32 (100%); harness-track 7→10/10 (100%). ALL 42 features passing.**
- Next: merge `feat/polish` → master (--no-ff), re-verify; the harness + entry-line product are complete. Remaining
  open items are named backstage/production seams (durable persistence, real Toss SDK, real buyer auth) + the
  Stripe→Toss prose/CI residue cleanup follow-up.

### 2026-06-02 — TRACK-MYPAGE (F017, F018) post-pay finishing (photo · dedication · QR)  [feat/mypage]
- Built 마이페이지 post-pay finishing, completing the entry-line buyer flow end-to-end. **F017**: `/mypage` order#
  + email lookup (verified vs `order.buyerEmail`, uniform error → no existence oracle) → an HMAC-signed, expiring,
  httpOnly per-order capability cookie → `/mypage/[orderId]` showing status + a child-photo upload **when skipped
  at checkout** (the REAL F029 `receiveUpload`→`storeAsset` path; opaque `storageKey`, no filename/childName in
  DOM/URL). **F018**: dedication (헌정 문구) saved + **prefilled** via the cookie-gated `no-store` `/state` route
  (buyer manages their own PII, guarded), and a QR video upload revealed **only** when `Order.qrVideoAddon` (full
  canonical honesty copy + 주문-전체 label). New track-owned: `src/app/mypage/{page,[orderId]/page,[orderId]/state/route}`,
  `mypage/_lib/{access,finishing,actions}.ts`, `_components/mypage/{MypageLookup,FinishingClient,mypage.module.css}`,
  `tests/e2e/mypage-{photo,finish}.spec.ts` (13).
- **Key design decisions (ADR-0014):** the checkout-owned `OrderRepo` is **read-only** (out of touch-scope); finishing
  data lives in a **mypage-owned hermetic store** (per-item photo/dedication, per-order QR — schema-faithful;
  Prisma seam). Access = order# + email + HMAC cookie (env-keyed, fail-closed in prod) standing in for real buyer
  auth. The `[orderId]` page **gates BEFORE any order lookup** so a guessable id is not an existence oracle; writes
  re-verify the cookie + require PAID. PII never enters the SSR document or logs; only the `no-store` `/state` route
  carries the dedication.
- **Process (brainstorm → adversarial design review → TDD → worker≠checker, ADR-0005/F042):** user-approved design
  (prefill over write-only; per-item/per-order split; HMAC cookie) → a **PRE-build 51-agent / 6-dim design review**
  (16/45 skeptic-verified findings folded into the spec — 2 MAJOR caught at design time: the enumeration-oracle gate
  ordering + Next-15 `await params`/`cookies()`) → TDD (2 E2E specs RED→GREEN; crypto expiry/tamper branches tested
  in-spec via `node:crypto`, staying in E2E scope) → a **POST-build 35-agent implementation review** (21/29 confirmed,
  **ALL minor/nit — zero blocker/major**; fixed: bfcache reload doc-align + PII-flash clear, order-scope QR label,
  file-input aria-labels, and real coverage for the CREATED/not-paid branch, shared-QR, QR persistence, lookup-page
  noindex, meaningful 375px). Spec + R1–R16: `docs/superpowers/specs/2026-06-02-track-mypage-design.md`.
- Gates: `pnpm check` green (lint+typecheck+**125 unit**+0 constraints R1–R8 incl. R4/R8) + **71 E2E** (58 prior +
  **13 mypage**; no regressions). F017/F018 → `passing` + dated evidence (R4 holds); attempt reset. Realizes F029's
  `e2e_via:[F009,F017,F018]` for real. Product delivery 28→**30/32** (94%). Scope deviations (read-only imports of
  `orderRepo`/`format`/`Nav`/`Footer`; co-located `mypage/_lib`; no sibling-file edits; no `tests/unit`) ratified in ADR-0014.
- Next: merge `feat/mypage` → master (--no-ff), re-verify; then **TRACK-POLISH** (F036 perf · F037 a11y · F039/F040/F042).

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
