# Production Deployment — Plan & Runbook (그림책 제작소)
> Read on demand. `AGENTS.md` is the router. Target platform: **Vercel** (app) + **Supabase** (Postgres + Storage). This doc is the *how-to-ship* runbook; it is **not** a claim that the product is open for business — see §2 first.

---

## 1. Overview & deploy topology

Single-deployable, single-region web app. The Next.js 15 App Router runs on Vercel (Server Components + Route Handlers, including the Toss webhook handler); durable state lives in one Supabase project (Postgres via Prisma, plus a private Storage bucket for child-photo bytes). There is **no separate API service, no queue, no inventory store** — made-to-order, no stock. This "one box you can reason about" shape is the **M1 / G-SIMPLE** ethos: prefer a single deployable over distributed moving parts.

```
  Browser
  (Toss client SDK — NOT BUILT yet, see §2)
     │  HTTPS
     ▼
  ┌──────────────────────────────────────────────┐
  │ Vercel — Next.js 15 (App Router)              │
  │  • Server Components (catalog, mypage)        │
  │  • Route Handlers:                            │
  │     /api/payments/create   (503 in prod, §2)  │
  │     /api/payments/confirm  (server adapter)   │
  │     /api/payments/webhook  (token + re-query) │
  │     /api/custom/phone | written               │
  └──────────────┬──────────────────┬─────────────┘
                 │ Prisma            │ Storage REST (service_role)
   DATABASE_URL  │ (:6543 pooled)    │ SUPABASE_URL + service_role
   DIRECT_URL    │ (:5432 migrate)   │
                 ▼                   ▼
  ┌──────────────────────┐   ┌──────────────────────┐
  │ Supabase Postgres 16 │   │ Supabase Storage      │
  │ (orders, finishing,  │   │ private bucket `assets`│
  │  custom requests)    │   │ (child photos — PII)  │
  └──────────────────────┘   └──────────────────────┘
        ▲ inbound webhook
  TossPayments  ──────────────►  /api/payments/webhook
```

---

## 2. ⚠️ PRE-LAUNCH REALITY CHECK — read before you deploy

**This codebase was built "reliability harness first."** 42 of the 43 features are `passing` (F043 is this very runbook) and `pnpm check` / `pnpm eval` are green, but several production paths are **intentionally fail-fast / fail-closed**. The single gate everywhere is `process.env.APP_ENV === "production"`.

> **A deployed `APP_ENV=production` build CANNOT take a real payment today.** Deploying this repo gives you a correct, durable, observable skeleton — **not an open store.** Do not equate "it deployed" with "open for business."

What a prod build **cannot do yet** (each is by design — honest fail-fast over a fake success):

- **Entry-line checkout is 503 in prod.** `POST /api/payments/create` returns `503 {"errors":["결제 기능이 아직 준비되지 않았습니다."]}` as its first statement when `APP_ENV==="production"` (`src/app/api/payments/create/route.ts:19-21`). No order is created, no provider is called.
- **The real Toss browser SDK is not implemented anywhere** in `src/`. Only a server-side **confirm** adapter exists (`src/lib/payments/toss.ts:19,106-128`); there is no client widget that opens the hosted payment window or yields a `paymentKey`. The dev/sandbox stand-in pay page calls `notFound()` (404) in prod (`src/app/checkout/pay/page.tsx:24`).
- **mypage buyer auth = email-OTP possession proof (F046 + F047).** Order# + matching `buyerEmail` triggers a 6-digit OTP to that email; only a correct code mints the (kept) HMAC capability cookie. Brute-force / email-bomb is bounded by a durable **atomic** per-order `OtpCode` (attempt-cap / send-throttle / single-use). The real **Resend** email adapter is now wired (F047), but **config-gated**: prod sends real OTP mail **only when `RESEND_API_KEY` + `EMAIL_FROM` are both set** — until both are provisioned, mypage auth stays **fail-closed** (a security email never silently no-ops). Provisioning both in prod env (§10) flips it **live**. **ADR-0021 / ADR-0022** (supersede the ADR-0014 stand-in).
- **Webhooks fail closed without their secret.** The webhook authenticates with a shared URL token (`?token=` = `TOSS_WEBHOOK_SECRET`, constant-time) and then **re-queries** the authoritative payment from Toss (`GET /v1/payments/{paymentKey}`) before settling — the body is never trusted (F045, ADR-0020). `TOSS_WEBHOOK_SECRET` is now **boot-required in prod** (`src/lib/env.ts` refuses to boot without it); the route also returns **401** if it is unset. No secret ⇒ no async PAID settlement.
- **`MYPAGE_ACCESS_SECRET` is now boot-validated (F046).** It is in the zod schema and a required-in-prod boot throw fires when unset — on a hardened `isProductionRuntime` that cross-checks `VERCEL_ENV`, so a missing/mis-set var fails at **boot**, not silently at first mypage use. Runtime fail-close in `access.ts` is retained as defence-in-depth. **ADR-0021.**
- **Live Toss keys are refused by the payment adapter** even in prod. The constructor's `assertTestKey` throws on `live_sk_`/`live_ck_` (`src/lib/payments/toss.ts:45-53`). Real charges are an approval-gated irreversible action (`pnpm approve toss.charge.live`, §9). Today the only safe-to-run prod provider is one given **TEST** keys.

What **is** built and durable (so you don't rebuild it): durable Postgres persistence with **no silent in-memory fallback on writes**, and Supabase Storage byte round-trip — both under **ADR-0016**, both live-verified (`pnpm eval` = 1.0, eval S10/S11 PASS). See §5/§8 and the closure table in §10.

---

## 3. Prerequisites

- **Accounts:** Vercel (project + team), Supabase (one project: Postgres + Storage), TossPayments (TEST keys now; LIVE keys only at the gated go-live cutover, §9).
- **Toolchain (match the repo pins):** Node **20.x** locally (`.nvmrc` = `20`; `engines.node: ">=20"` in `package.json:7-9`), pnpm **10** (`packageManager: "pnpm@10.33.0"`, `package.json:10`). Note the **seed runner** needs Node **22.6+** (see §6). On Vercel the *runtime* Node major is set in Project Settings — `.nvmrc` is not consulted there (see §7).
- **Repo access:** ability to set Vercel project env vars scoped to Production/Preview, and to run `prisma migrate deploy` against the Supabase **direct** connection (your machine or a CI step with `DIRECT_URL`).

---

## 4. Environment & secrets

Source of truth is the zod schema in `src/lib/env.ts:13-35`; `parseEnv()` throws on schema violation but **every DB/Supabase/Toss var is `.optional()`** — the schema never forces them. "Required in prod" is enforced (or not) by **downstream consumers**, per the rightmost columns below. Set all production secrets in **Vercel → Project → Settings → Environment Variables**, scoped to **Production** (and **Preview** where you want preview deploys to function). Server-only secrets must **never** carry a `NEXT_PUBLIC_` prefix.

| NAME | Purpose | Required in PROD? (what fails) | Secret/Public | NEXT_PUBLIC? | Consumer (file:line) |
|---|---|---|---|---|---|
| **APP_ENV** | Mode switch (`development`\|`test`\|`production`); gates live-key refusal, prod payment seam, sandbox fallbacks, cookie `secure`. | **Effectively yes** — must be `"production"`. Schema default is `"development"` (`env.ts:14`); wrong value → prod safety/seams misbehave. | Public (non-secret) | No | `env.ts:14,41`; `checkout.ts:187,202`; `customRequest.ts:408`; `create/route.ts:19`; `access.ts:25` |
| **DATABASE_URL** | Postgres — Supabase **pooled** (pgbouncer, :6543, `pgbouncer=true`). Presence flips repos from in-memory to Prisma. | **Yes for durable data.** If unset, app silently runs in-memory (data lost on restart); does NOT throw. `.optional().url()` (`env.ts:15`). | **Secret** (DB password) | No | `env.ts:15`; `schema.prisma:19`; `orders.ts:356,361`; `customRequest.ts:386` |
| **DIRECT_URL** | **Direct/session** Postgres (:5432) for Prisma **migrations** (pooled URL can't run DDL). | **Yes for `prisma migrate deploy`.** Runtime app does not read it; only migration tooling does. `.optional().url()` (`env.ts:17`). | **Secret** (DB password) | No | `env.ts:17`; `schema.prisma:20` |
| **SUPABASE_URL** | Project base URL for Storage REST (`/storage/v1/object/...`). | **Yes for durable file storage.** If any of the 3 SUPABASE_* missing, `putObject` is a no-op (bytes NOT stored, no throw). `.optional().url()` (`env.ts:19`). | Public-ish (project URL) | No | `env.ts:19`; `storage.ts:18,21,52` |
| **SUPABASE_SERVICE_ROLE_KEY** | `service_role` secret — Bearer auth for Storage REST. **Bypasses RLS.** | **Yes for storage.** Missing → storage no-op. `.optional()` (`env.ts:20`). | **SECRET — highest sensitivity** | **NEVER** | `env.ts:20`; `storage.ts:19,21,56` |
| **SUPABASE_STORAGE_BUCKET** | Private bucket name (`assets`) — object path prefix. | **Yes for storage.** Missing → storage no-op. `.optional()` (`env.ts:21`). | Public (name only) | No | `env.ts:21`; `storage.ts:20,21,52` |
| **TOSS_SECRET_KEY** | TossPayments server secret (Basic-auth on confirm). | **Yes in prod** — `tossFromEnv(env)` **throws** `"TossPayments is not configured…"` if missing (`toss.ts:138-142`). Non-prod falls back to `test_sk_checkoutsandbox`. | **SECRET** | No | `env.ts:22,39`; `toss.ts:136`; `checkout.ts:194` |
| **NEXT_PUBLIC_TOSS_CLIENT_KEY** | TossPayments publishable client key (browser SDK). | **Yes in prod** — same `tossFromEnv` throw if missing. Non-prod falls back to `test_ck_checkoutsandbox`. | Public (publishable by design) | **Yes** | `env.ts:23,40`; `toss.ts:137`; `checkout.ts:195` |
| **TOSS_WEBHOOK_SECRET** | Verifies inbound Toss webhooks. | **Yes in prod** — missing → webhook route **401s**, no async PAID settlement (`checkout.ts:200-203`). Fail-closed, no throw. | **SECRET** | No | `env.ts:24`; `checkout.ts:201-202` |
| **BASE_URL** | App base URL. zod default `"http://localhost:3000"` (`env.ts:25`). | **Not required** (has default). Only runtime consumer is `playwright.config.ts:14` (E2E); no `src/` code reads `env.BASE_URL` (the create route derives origin from `req.url`). Set in prod for correct E2E/links; nothing throws if absent. | Public | No | `env.ts:25`; `playwright.config.ts:14` |
| **MYPAGE_ACCESS_SECRET** | HMAC-SHA256 signing key for the mypage access cookie. | **Yes in prod** for mypage access. **Read ad-hoc via `process.env`, NOT in the zod schema** (`access.ts:25`). Missing → mypage **fail-closed**; **boot validation will not warn.** Must be set manually in Vercel. | **SECRET** | No (must never be) | `access.ts:25,38,52`; `actions.ts:48-52` |
| **RESEND_API_KEY** | Resend API key (`re_…`) — Bearer auth for the transactional OTP email (F047). | **Not a boot requirement** (a prod build boots without it). But **mypage OTP is fail-closed** until set: the email `send()` **throws**, so no code is delivered ⇒ buyers cannot reach mypage. Set it **together with `EMAIL_FROM`** to go live. `.optional()` (`env.ts:32`). | **SECRET** (`redact()`-masked → `re_***`) | **NEVER** | `env.ts:32`; `email.ts` (`resendEmailAdapter`/`emailAdapter`) |
| **EMAIL_FROM** | Verified sender address for the OTP mail (Resend `from`; requires a Resend-verified domain). | **Not a boot requirement.** Same gate as above — mypage OTP stays fail-closed until set (with `RESEND_API_KEY`). `.optional()` (`env.ts:34`). | Public (address) | No | `env.ts:34`; `email.ts` (`resendEmailAdapter`/`emailAdapter`) |

### Live-key boot refusal (`env.ts:38-47`)
On every `parseEnv()`, `live = TOSS_SECRET_KEY.startsWith("live_sk_") OR NEXT_PUBLIC_TOSS_CLIENT_KEY.startsWith("live_ck_")`. If `live && APP_ENV !== "production"` → **throws** `"Refusing to boot: TossPayments LIVE key detected outside production…"`. Test prefixes (`test_sk_`, `test_ck_`) never trip it. Live keys are allowed **only** when `APP_ENV==="production"`. (Verified by `tests/unit/smoke.test.ts:14,18,22`.)

### Must NEVER be `NEXT_PUBLIC_`
`SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS — leaking it = total data compromise; documented server-only at `env.ts:18`, `storage.ts:5-6`), `TOSS_SECRET_KEY`, `TOSS_WEBHOOK_SECRET`, `MYPAGE_ACCESS_SECRET`, `RESEND_API_KEY` (Resend Bearer secret — F047), `DATABASE_URL` / `DIRECT_URL` (embed the DB password). The **only** intentionally client-exposed var is `NEXT_PUBLIC_TOSS_CLIENT_KEY`.

### Redaction (`redact()`, `env.ts:93-107`)
`emit()` runs every string-valued trace attr through `redact()` (`observability.ts:18-28`). Masks: Toss keys (`test_/live_ + sk_/ck_`), legacy Stripe shapes (defense-in-depth, "should never appear post-F003"), **Resend keys** (`re_…` → `re_***`, word-boundary anchored so it can't match mid-word; F047), Supabase `sb_secret_/sb_publishable_`, legacy service_role JWTs (`eyJ….eyJ….sig`), and emails (`***@***`). **Not** pattern-matched: raw `DATABASE_URL`/`DIRECT_URL` passwords, `TOSS_WEBHOOK_SECRET`, `MYPAGE_ACCESS_SECRET` — these rely on never being placed into trace attrs (constraint **R2** also blocks `console.*(process.env …)`).

> ⚠️ **Pre-deploy hygiene gaps to fix (verified):** `.env.example` documents `APP_ENV`, `BASE_URL`, `DATABASE_URL`, the three Toss keys, and (F047) `RESEND_API_KEY` / `EMAIL_FROM` — it still **omits `DIRECT_URL`, all `SUPABASE_*`, and `MYPAGE_ACCESS_SECRET`**. Add them. Separately, `.env.local` contains **real-looking secrets** (a live Supabase DB password and a real service_role JWT); if that file is ever tracked/committed it is a credential-leak incident — **rotate the Supabase DB password and service_role key before go-live** and confirm `.env.local` is gitignored.

---

## 5. Supabase setup

**(a) Create the project.** One Supabase project provides both Postgres and Storage. Pick a region close to your Vercel region.

**(b) Get the TWO connection strings (and why there are two).** The Prisma datasource declares both (`prisma/schema.prisma:19-20`), with the comment: *"Runtime uses the pooled (pgbouncer) connection; migrations need a direct/session connection (advisory locks + DDL are unsupported through transaction-mode pgbouncer)."*

| Var | Supabase endpoint | Port | Used by | Notes |
|---|---|---|---|---|
| **`DATABASE_URL`** | pooler (`...pooler.supabase.com`), transaction mode | **6543** | Runtime PrismaClient (serving requests) | Carry `?pgbouncer=true` (often `&connection_limit=1`) so Prisma knows it's behind a pooler. |
| **`DIRECT_URL`** | direct (`db.<ref>.supabase.co`) or pooler session mode | **5432** | `prisma migrate deploy` (DDL + advisory locks) | Prisma Migrate auto-uses `directUrl` when present. |

> The repo documents the **roles** (pooled-for-runtime, direct-for-migrations) at `schema.prisma:17-20`; the 6543/5432 mapping is the standard Supabase platform convention that fulfills those roles. Get both strings from Supabase **dashboard → Project Settings → Database → Connection string** (the "Transaction pooler" string → `DATABASE_URL`; the "Session/Direct" string → `DIRECT_URL`).

**(c) Create the PRIVATE storage bucket.** In **dashboard → Storage → New bucket**, create a bucket named **`assets`** with **"Public bucket" toggled OFF** (private). Then in **dashboard → Project Settings → API**, copy the **Project URL** → `SUPABASE_URL`, and the **`service_role` secret** key → `SUPABASE_SERVICE_ROLE_KEY`. Set `SUPABASE_STORAGE_BUCKET="assets"`. The accepted key shapes are the service_role **legacy JWT** (`eyJ….eyJ….sig`) or the new **`sb_secret_…`** form (`env.ts:60-61`). These are **server env only** — never a `NEXT_PUBLIC_` var. (Free-tier Storage is 50MB; QR video bytes are **not** stored — ADR-0016 option B — so staying under it is feasible.)

---

## 6. Database migration runbook

Prisma Migrate must run against **`DIRECT_URL`** (:5432). It picks up `directUrl` automatically when present (`schema.prisma:20`). Do **NOT** point migrations at the pooled `DATABASE_URL` (:6543) — see the warning below.

**First production deploy:**
1. `prisma generate` (or `pnpm prisma:generate`) — produce the client. Required because `src/lib/db.ts` deliberately does **not** static-import `PrismaClient`; it dynamic-imports `@prisma/client` at runtime (`src/lib/db.ts:5-12,35-40`), which only resolves to a real client if `generate` has run. (See §7 for the Vercel build wiring.)
2. `prisma migrate deploy` — apply committed migrations. **This is the production command.** Do **NOT** use `prisma migrate dev` (interactive dev-only; authors/creates migrations and can reset/drift the DB).
3. `prisma db seed` — seeds the 8 entry-line templates. **Idempotent** (upserts keyed on the unique `key`, `prisma/seed.ts:97-106`), so re-running converges, never duplicates.

**Subsequent deploys:**
1. `prisma generate`
2. `prisma migrate deploy` (against `DIRECT_URL`)
3. Seed only if needed (idempotent — safe to re-run).

> ⚠️ **Pooled-URL-breaks-migrations:** running migrations through the transaction-mode pgbouncer pooled URL fails — **advisory locks are unsupported** (Prisma Migrate serializes via a PostgreSQL advisory lock; transaction pooling doesn't preserve the session holding it) and **DDL/prepared-statement session state breaks** under transaction pooling. That is exactly why `directUrl` exists.

> ⚠️ **Seed-runner Node caveat:** `prisma db seed` runs `node --experimental-strip-types prisma/seed.ts` (`package.json:11-13`), which needs **Node ≥ 22.6** — newer than the project's `>=20` engines floor. Run the seed step on Node 22.6+. (This gap never touches `pnpm check` — the F004 unit test does not invoke the runner — `prisma/seed.ts:16-21`.)

---

## 7. Vercel project config

- **Framework preset:** Next.js (Vercel's native builder). `next.config.ts` sets only `reactStrictMode` and `experimental.serverActions.bodySizeLimit: "25mb"`, and **no custom `output` mode** — which is the expected configuration for Vercel's native builder (`output: "standalone"` is a self-host/Docker concern; it is neither needed nor consumed on Vercel).
- **Install command:** pnpm (Corepack honors `packageManager: "pnpm@10.33.0"`; pin pnpm **10**).
- **Node version:** set **Project → Settings → Node.js Version to 20.x** — this (or a pinned `engines.node: "20.x"`) controls the Vercel *runtime* major. `.nvmrc` is **not** consulted by the Vercel build, and the open-ended `>=20` range does **not** pin a major (Vercel resolves the selected version, which can drift forward). Run the **seed** step elsewhere on Node 22.6+ (§6).
- **Build command — the Prisma gotcha:** the repo's `build` script is bare `next build` (`package.json:16`) and **`prisma generate` is NOT wired into build or `postinstall`** (the only occurrence is the standalone `prisma:generate` script, `package.json:32`). Vercel caches `node_modules`/the pnpm store between builds, so a cached layer can ship a **stale or missing generated client** and the runtime dynamic import (§6) fails. **Fix before first deploy (recommended): set the Vercel build command to `prisma generate && next build`** — more robust than a `postinstall: "prisma generate"` hook, because `postinstall` runs only with the (cacheable, often-skipped) install step whereas the build command always runs.
- **⚠️ Server Actions body limit — a real upload blocker on Vercel:** `next.config.ts:8` sets `bodySizeLimit: "25mb"`, but that only governs the Next.js framework layer. **Vercel caps Function / Server-Action request bodies at 4.5 MB on *all* plans** (Hobby/Pro/Enterprise) — a platform limit `bodySizeLimit` cannot lift. A child-photo upload between ~4.5 MB and 25 MB is rejected at Vercel's ingress **before Next.js ever sees it**, regardless of plan. This is a **pre-launch blocker for large photos** (see §10), not a plan-upgrade item. Supported fix: downscale photos client-side to <4.5 MB, and/or upload client-direct to Supabase Storage via a signed upload URL (bypassing the Function body cap).
- **Env scoping:** set all of §4 in **Project → Settings → Environment Variables**, scoped to **Production** (and Preview if preview deploys must function). Remember `MYPAGE_ACCESS_SECRET` is **not** validated at boot — set it manually.
- **Webhook URL / BASE_URL:** configure the TossPayments dashboard webhook to point at `https://<your-domain>/api/payments/webhook`. Set `BASE_URL=https://<your-domain>` for correct links/E2E (no `src/` runtime dependency, but good hygiene).
- **Note — no CD exists today.** `.github/workflows/ci.yml` is verification-only (lint/type/test/constraints + eval + E2E); there is **no deploy/CD step and no `next build` in CI**. Continuous deployment to Vercel is net-new. (Stripe→Toss residue cleaned up in **ADR-0018**: CI's E2E env now uses `TOSS_*` test placeholders (`ci.yml:36-38`), and the dead `stripe` dependency was removed from `package.json`.)

---

## 8. Storage setup

- **Private bucket `assets`** (created in §5c). Objects are **never public/inline** — the bucket name comes from `SUPABASE_STORAGE_BUCKET` (`storage.ts:20`), keys are opaque `randomUUID()` paths prefixed `child-photo/` (`assets.ts:71,117`), path-guarded against traversal (`storage.ts:45-49`).
- **Env-gated real-vs-fallback behavior:** `storageConfig()` returns config **only if all three** `SUPABASE_*` vars are set, else `null` (`storage.ts:17-23`). `putObject` then: unconfigured ⇒ **no-op `{ stored: false }`** (descriptor row kept, bytes lost, no throw); configured ⇒ real `POST <SUPABASE_URL>/storage/v1/object/<bucket>/<key>` with `Authorization: Bearer <service_role>`, `x-upsert: "true"`, and **HTTP errors throw** (never silently lose a file). Wired into both upload paths: pre-pay (`photo-action.ts:4,29`) and mypage (`actions.ts:7,85`).
- **service_role = server-only, bypasses RLS, never `NEXT_PUBLIC_`** (`storage.ts:5-6`); it is used as a Bearer header and never interpolated into errors (verified: `tests/unit/storage.test.ts:50-60` — "throws… WITHOUT leaking the service key"), and `redact()` scrubs both key shapes (`env.ts:58-61`).
- **Child-photo PII handling:** only the opaque **descriptor** (`storageKey`/`contentType`/`byteSize`) is persisted/surfaced (Prisma `Asset`) — never the bytes or a URL. The intended production read path is an **out-of-band server-side signer** (`assets.ts:46-47`) which is **deferred / not yet implemented** (a separate restricted Storage key vs `service_role` was deferred per ADR-0016 — server-only + private bucket deemed acceptable, flagged). The only existing read-back is the **gated integration test** using service_role directly (`tests/unit/persistence-integration.test.ts:130-157`) — a durability proof, **not** a prod read route. **Live-verified:** eval **S11 PASS**.

---

## 9. Safety & go-live cutover

This is a regulated domain (payments + child PII). Irreversible actions are **default-deny** and routed through `pnpm approve <action>` + `requireApproval(action, token)` (`src/lib/guardrails.ts:54-65`).

- **`pnpm approve <action>` issues an intent token only — it NEVER performs the action** (`scripts/approve.mjs:6`). It validates the action is gated, prompts for an exact interactive confirmation (you must type the action name verbatim), and on match prints `APPROVED:<action>` to paste into the guarded call. Tokens are **per-action** (`APPROVED:order.confirm` ≠ `APPROVED:deploy.production`). The performing side (`requireApproval`) throws `Blocked irreversible action "<action>" (G-HITL)` unless the token exactly equals `APPROVED:${action}`.
- **The deploy itself is a gated action:** `deploy.production` ("Production deploy / live-key switch") is one of the `IRREVERSIBLE_ACTIONS` (`guardrails.ts:30-42`, mirrored `approve.mjs:16-28`). Going live = a deliberate, approved step.
- **Flipping to LIVE Toss keys is the gated go-live step.** A live key (`live_sk_`/`live_ck_`) makes the app **refuse to boot unless `APP_ENV=production`** (`env.ts:38-47`). So going live requires **(a)** supplying live keys **AND (b)** explicitly setting `APP_ENV=production` — it cannot happen by accident in dev/CI (a live key there crashes boot). The actual money-moving call **still** independently requires the `toss.charge.live` token at `requireApproval`. **And note:** today the payment adapter's `assertTestKey` *also* refuses `live_*` keys at construction (`toss.ts:45-53`) — so the live path is not merely "set keys"; it is a deliberate seam to open behind the approval gate (see §10).
- **Secrets/PII out of logs.** `redact()` (§4) strips Toss/Stripe/Supabase keys, service_role JWTs, and emails before anything reaches logs/traces; `parseEnv()` fails fast on bad config but emits only the field path, never the value (`env.ts:32-34`). Constraint **R2** blocks `console.*(process.env …)`.

> Action-key alignment (ADR-0018): `docs/SAFETY.md`'s table now matches the **executable** source of truth — `IRREVERSIBLE_ACTIONS` in `guardrails.ts` and the tokens in `approve.mjs` (`toss.charge.live`/`toss.refund.live` + `consultation.book`). The executable list remains canonical if they ever diverge again.

---

## 10. Production-readiness checklist (seam closure)

What must be **BUILT** before a real public launch. These are future **F-items**, **not** done in this doc. (The "done" rows are listed so you don't rebuild them.)

| Status | Seam | What to build | Ref |
|---|---|---|---|
| ☐ TODO | **Real Toss browser SDK** (highest-priority blocker) | Integrate `@tosspayments/tosspayments-sdk` client `requestPayment`, pass `clientKey` (already surfaced via `createCheckout().clientKey`), success callback → `/api/payments/confirm` (works server-side); then **remove the 503** in create route. | `create/route.ts:19-21`; `toss.ts:100,106-128`; `pay/page.tsx:24` |
| ✅ DONE | **Toss webhook real scheme** (F045, ADR-0020) | Replaced the self-HMAC seam with the real Toss scheme: shared URL token (`?token=`=`TOSS_WEBHOOK_SECRET`) + **re-query** `GET /v1/payments/{paymentKey}` as the authoritative check; payload `{eventType,data:{paymentKey,orderId,status}}`; dedupe `paymentKey:status`; `TOSS_WEBHOOK_SECRET` **boot-required** in prod. Register the dashboard webhook URL as `…/api/payments/webhook?token=<secret>`. | `webhook/route.ts`; `checkout.ts` (processWebhook); `toss.ts` (lookupPayment); `env.ts` |
| ✅ DONE (F046) | **Real buyer auth** (replace mypage HMAC stand-in) | Email-OTP possession proof + durable **atomic** per-order rate-limit (`OtpCode`: attempt-cap / send-throttle / single-use as atomic conditional writes, verified on docker Postgres). Capability cookie kept, minted only after the OTP. **ADR-0021.** Real email provider is a paired follow-up (below) ⇒ prod mypage fail-closed until provisioned. | `mypage/_lib/{otp,actions}.ts`; `MypageLookup.tsx` |
| ✅ DONE (F046) | **`MYPAGE_ACCESS_SECRET` boot validation** | Added to the zod schema + a required-in-prod boot throw on a hardened `isProductionRuntime` (VERCEL_ENV cross-check, so a mistyped `APP_ENV` on Vercel cannot fail open). **ADR-0021.** | `env.ts` (parseEnv + isProductionRuntime) |
| ✅ DONE (F047) | **Real transactional email provider** (mypage OTP) | `resendEmailAdapter` sends the OTP via Resend's HTTPS API (`POST https://api.resend.com/emails`, Bearer `RESEND_API_KEY`, `from=EMAIL_FROM`) behind `EmailAdapter`, invoked via the existing F046 `after()`/await. Injectable transport keeps `pnpm check` hermetic; a non-2xx response **throws** (no silent no-op); the code/recipient never reach a log (status-only error). The factory picks Resend in prod **only when BOTH `RESEND_API_KEY` + `EMAIL_FROM` are set** (else F046 fail-closed; a half-config never half-sends). **Provision both in Vercel prod env to flip mypage OTP from fail-closed → live** (the real send is verified by a go-live canary; hermetic E2E exercises the mock). **ADR-0022.** | `src/lib/email.ts`; `env.ts` |
| ◑ PARTIAL (F085) | **Edge/WAF rate-limit** (app layer DONE) + OTP constant-time response | App-layer best-effort **per-IP** limiter (`src/lib/rateLimit.ts` `enforceRateLimit`) now guards the public POSTs (`payments/create`, `custom/written`, `custom/phone`), the **login-OTP send** (bounds the distinct-address mail-bomb the per-email cap cannot), and photo upload — plus a **10 MB `MAX_UPLOAD_BYTES`** size cap rejected before buffering. Enforcement is **production-only** (bypassed under the hermetic dev-auth opt-in so the single-IP E2E can't self-throttle). **Still required: add Vercel WAF/Edge rate-limit rules** as the true DISTRIBUTED tier — the app layer is per-instance on serverless — plus an edge constant-time OTP response for the timing residual. | `src/lib/rateLimit.ts`; `assets.ts` (`MAX_UPLOAD_BYTES`); Vercel WAF config |
| ☐ TODO | **Live Toss key path** | Decide the live-charge path: relax `assertTestKey` behind the `pnpm approve toss.charge.live` gate; provision real `TOSS_SECRET_KEY` / `NEXT_PUBLIC_TOSS_CLIENT_KEY`. | `toss.ts:45-53,138-144`; `docs/SAFETY.md` |
| ☐ TODO | **`prisma generate` in the build** | Set the Vercel build command to `prisma generate && next build` (preferred — always runs; a `postinstall` hook can be skipped by the install cache). Vercel deploy risk, not CI-visible. | `package.json:16,32`; `db.ts:5-12` |
| ☐ TODO | **Photo upload within Vercel's 4.5 MB body cap** | Server-Action uploads >4.5 MB fail on Vercel (platform cap on all plans; `bodySizeLimit` cannot lift it). Add client-side downscaling and/or client-direct Supabase Storage upload via a signed URL. | `next.config.ts:8`; `storage.ts:36-67`; `photo-action.ts` |
| ✅ DONE | **Durable Postgres persistence** (ADR-0016) | Prisma adapters behind `OrderRepo`/`WebhookLedger`/`FinishingStore`/`customRequestStore`, selected by `DATABASE_URL`; **writes do not silently fall back** to in-memory. Restart-survival verified (eval **S10 PASS**). | `customRequest.ts:385-388`; `DECISIONS.md:375-381` |
| ✅ DONE | **Supabase Storage byte round-trip** (ADR-0016) | Real PUT to private bucket via service_role; env-gated no-op when unconfigured. Round-trip verified (eval **S11 PASS**). | `storage.ts:36-67`; `DECISIONS.md:387-394` |
| ✅ DONE | **QR video handling** (ADR-0016 option B) | Intentionally **not** web-uploaded; order keeps `qrVideoAddon` flag, mypage shows a backstage notice. Nothing to build for launch. | `DECISIONS.md:395-399` |
| ✅ DONE | **RLS on all public tables** (Supabase linter `0013_rls_disabled_in_public`, ERROR/EXTERNAL) | Supabase exposes the `public` schema via PostgREST (anon key) — every table needs RLS or it is internet-reachable (incl. PII: Order/Personalization/CustomRequest/Consultation/Asset/OtpCode). Enabled RLS on **all** public tables with **no policies** = deny-all to anon/authenticated; safe because the app reaches Postgres only via Prisma as the table-**owner** `postgres` role (owners bypass RLS — we do **not** FORCE it) + Storage via `service_role` (also bypasses). **Ordering invariant: a table's migration must land BEFORE/WITH the env that opens its feature — never after** (else the live path throws `relation "…" does not exist`; e.g. `OtpCode` must precede flipping `MYPAGE_ACCESS_SECRET`+Resend). Enforced by **R10** (a CREATEd table with no `ENABLE ROW LEVEL SECURITY` fails `pnpm check`). Applied to prod via `prisma migrate deploy`. Complementary hardening (optional): turn the Data API **off** (Settings → API) since this app never uses PostgREST. | `prisma/migrations/20260617000000_enable_rls/migration.sql`; `scripts/check-constraints.mjs` (R10) |

---

## 11. Post-deploy verification (smoke / canary)

After a deploy with `APP_ENV=production` set, verify the skeleton is healthy **and that the gated seams behave as designed** (a 503/401 here is correct, not a bug):

| Check | Route / action | "Healthy" looks like |
|---|---|---|
| App boots | Catalog / home (Server Component) | Page renders; **no boot throw** in logs (a boot throw means a live key without `APP_ENV=production`, or bad env). |
| DB wired | Any order-listing / template page | Seeded **8 templates** appear (not the in-memory skeleton) ⇒ `DATABASE_URL` live + migrated + seeded. |
| **Payment gate (intentional)** | `POST /api/payments/create` | **HTTP 503** `{"errors":["결제 기능이 아직 준비되지 않았습니다."]}`. ✅ This is the seam in §2 — **expected**, not a regression. |
| Sandbox pay page closed | `/checkout/pay?order=…` | **404** (`notFound()`). ✅ Expected in prod. |
| Webhook secured | `POST /api/payments/webhook` (no/invalid `?token=`) | **401** if `TOSS_WEBHOOK_SECRET` unset or the `?token=` mismatches. With the token + a real Toss event, the **re-query** confirms the payment → idempotent PAID settlement. A forged `DONE` body can't settle (re-query is authoritative). |
| mypage access | mypage lookup (order# + email) | If `MYPAGE_ACCESS_SECRET` set: capability cookie minted (`secure`, httpOnly, 2h). If unset: "마이페이지 접근이 일시적으로 제한…" — confirm the secret is set. |
| Storage round-trip | Run the gated test against prod env: `set -a; . .env.local; set +a; pnpm exec vitest run persistence-integration` | Upload → read-back exact bytes → cleanup, **S11 PASS** ⇒ `SUPABASE_*` live. |
| Secrets not leaking | Vercel logs/traces | No raw keys/emails/DB passwords in output (`redact()` + R2). |

---

## 12. Rollback

- **App:** use **Vercel instant rollback** — in the project's Deployments list, promote the previous known-good deployment. Vercel keeps prior immutable builds, so this is a near-instant revert of the running app.
- **Database:** ⚠️ **migrations are forward-only.** `prisma migrate deploy` does not roll back. A Vercel app rollback does **not** revert schema changes — if a migration changed/removed columns the older app version depends on, rolling back the app can break against the new schema. Treat any destructive migration as one-way: prefer additive/expand-then-contract migrations, take a Supabase backup before applying DDL, and have a tested forward-fix migration ready rather than relying on a "down" path.

---

## 13. Doc drift note (out of scope here)

**Resolved (ADR-0018).** `docs/ARCHITECTURE.md` was stale (it described **Stripe** + a **Book/stock** model); it has been corrected to the actual system — **TossPayments** (Stripe→Toss under F003, ADR-0009/0010) with a **Template / Order / CustomRequest** made-to-order model (no inventory). Operators can now trust its payment/data-model map.
