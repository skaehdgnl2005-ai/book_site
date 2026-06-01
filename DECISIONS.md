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
