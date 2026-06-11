# F046 — Real buyer auth (email-OTP possession proof) — Design

- **Date:** 2026-06-11
- **Feature:** F046 (`track: product`, `category: safety`, `priority: 2`)
- **Status:** design v3 (PRE-build adversarial review folded — 20 confirmed findings) — awaiting spec-review ratification.
- **Extends / supersedes:** ADR-0014 (mypage HMAC capability-cookie stand-in). The capability-cookie
  layer is **kept**; only the *front door* that mints it is replaced.
- **Parallel:** built on the isolated `feat/F046` worktree alongside F045 (Toss webhook, **already merged
  to master `d841845`**). See §11.
- **Decision record:** filed as **ADR-0021** (ADR-0020 is F045's, merged). See §11.

---

## 1. Problem & threat model

`/mypage` is the post-pay finishing surface (child photo, 헌정 문구) — it guards child PII. Today
ownership is proven by **knowing a string**: `lookupOrder` mints the per-order HMAC capability cookie at
`src/app/mypage/_lib/actions.ts:48-60` (`mintAccess` + `cookies().set`; the function spans 37-63) to
anyone who supplies `orderId` + a matching `buyerEmail`.

- **Order ids are sequential / guessable** (noted across DEPLOY.md / PROGRESS).
- **Email is low-entropy / often already known** to an attacker.
- **No rate-limiting exists anywhere** (`grep` rate/throttle across `src/` → 0 hits).

The uniform error blocks an *id-existence oracle*, but nothing blocks **brute force**. DEPLOY.md §10 names
this exact seam: *"Real buyer auth (replace mypage HMAC stand-in)… Add lookup rate-limiting (named seam,
not built)."*

**The fix has two parts:** (1) a **possession proof** — control of the *inbox* on the order; (2)
**durable, atomically-enforced, brute-force-resistant** limits. The existing HMAC capability cookie
(`access.ts`) is sound and **kept** — minted *after* the possession proof instead of after a string match.

---

## 2. Decisions

### D1 — Model: possession proof, **no accounts** (approved)
One-shot keepsake, guest checkout (no account concept; `next-auth`/`iron-session` = 0 hits). Accounts are
YAGNI; gate+rate-limit-only adds no possession factor. Chosen: an emailed possession proof on top of the
email match.

### D2 — Proof mechanism: **6-digit OTP code** (approved)
In-flow, no deep-link routing, hermetic-friendly, avoids the magic-link email-prefetch footgun.

### D3 — OTP/limit storage: **durable Prisma store (`orders.ts` pattern), with ATOMIC writes.** Stateless-signed **rejected**.
Vercel is multi-instance serverless; in-memory OTP would make auth **un-completable** in prod (instance A
writes, instance B verifies). The pattern is `process.env.DATABASE_URL ? Prisma : in-memory`
(`orders.ts:355-357`, `finishing.ts:133-136`); writes never silently fall back to in-memory. A stateless
signed OTP cannot enforce single-use or an attempt cap without state → rejected.

**Concurrency is first-class (review B1/B2/M1/M4/m2):** because the store is shared across instances, every
mutating limit MUST be an **atomic conditional write**, mirroring the house idiom
`markPaid` (`orders.ts:314-317`: `updateMany({ where:{id,status:"CREATED"} })` then re-read) and the
webhook ledger's `@id`-unique atomic gate (`orders.ts:324-339`). Read-modify-write (read → check in JS →
write) is forbidden on the prod path — it races (N concurrent verifies all read `attempts<5`, all pass).
The in-memory backend replicates the same compare-and-set semantics synchronously (JS is single-threaded,
so it cannot, by itself, *prove* atomicity — see §5/§10).

### D4 — Email enablement: **boot/config fail-closed gate. No per-send `requireApproval`.**
`requireApproval(action, token)` (`src/lib/guardrails.ts:54-65`) passes only when
`token === "APPROVED:${action}"` — a one-shot CLI **intent** token for discrete irreversible acts. OTP mail
is automated/high-frequency; per-send approval would mean baking the token permanently into prod env — a
*flag*, not a gate. Per the env+adapter precedent (ADR-0013 D5 / ADR-0012 D3): non-prod → **mock** adapter;
prod → **real** adapter only if a provider is configured, **else fail-closed** (a security email must never
silently no-op). "Turning email on" = provisioning the provider at the **`deploy.production` go-live
cutover**. `guardrails.ts` untouched. **R3 is advisory here** (its regex `/\.charge\(|\.refund\(|sendEmail\(|\bfulfill\(/`,
`scripts/check-constraints.mjs:75`, does not match `.send(`); the real control is the config/boot
fail-closed gate. `check-constraints.mjs` untouched (also an F045-merge hotspot).

### D5 — `env.ts`: secrets **required-in-prod** at boot, on a HARDENED prod marker (absorbs DEPLOY §10 #4)
`MYPAGE_ACCESS_SECRET` is read ad-hoc (`access.ts:25`), **not in the zod schema**, so it fails closed only
at first mypage use. Add it to the schema + a **separate post-parse block** that throws when prod and it is
unset. **Hardened prod detection (review M2):** a single hand-set `APP_ENV` (schema default `"development"`,
`env.ts:14`) is the sole gate for the live-key refusal, the boot check, AND (§9) the deterministic OTP. A
prod deploy that omits/mistypes `APP_ENV` would silently weaken security. Mitigation:
```ts
const isProd = env.APP_ENV === "production" || process.env.VERCEL_ENV === "production";
if (process.env.VERCEL_ENV === "production" && env.APP_ENV !== "production")
  throw new Error("Refusing to boot: VERCEL_ENV=production but APP_ENV!==production — set APP_ENV=production.");
if (isProd && !env.MYPAGE_ACCESS_SECRET)
  throw new Error("Refusing to boot: MYPAGE_ACCESS_SECRET is required in production (mypage buyer auth).");
```
The live-key block (`env.ts:41`) is **left as-is** — it already fails *closed* under a non-prod `APP_ENV`
(it throws when a live key is present and `APP_ENV!=="production"`), so it is a fail-closed backstop, not a
fail-open one (review M2 correction: 2 fail-open outcomes from a wrong `APP_ENV`, not 3). `access.ts`
unchanged; the boot check is belt-and-suspenders over its runtime fail-close.

### D6 — Provider decision (ratify at spec review)
- **(a)** `EmailAdapter` is **provider-agnostic** (mirrors `PaymentProvider`); **Resend** is the named
  go-live target (simple HTTPS, mock-friendly).
- **(b)** Real adapter = **paired follow-up F-item, NOT F046** (precedent F012 sandbox → F044 real SDK).
  F046 ships the OTP flow + **mock adapter** + interface + **fail-closed prod stub**.
- **(c)** On F046 deploy, prod mypage auth is **fail-closed until the provider is provisioned** (today it
  works via order#+email). Honest named seam (DEPLOY §10 + ADR-0021); deploy timing is the maker's call.
  **RATIFIED 2026-06-11:** accepted as a named seam (mock + fail-closed stub now; real Resend adapter is the
  paired follow-up; maker provisions Resend at the go-live cutover).

---

## 3. Architecture & components

- **Unchanged:** `access.ts` (HMAC capability cookie — minted *after* the possession proof);
  `[orderId]/page.tsx` gate.
- **New — `src/app/mypage/_lib/otp.ts`** — OTP store, `DATABASE_URL ? Prisma : in-memory` (the
  `finishing.ts` shape), a **structural delegate type** (DB-independent, ADR-0002), injectable **clock +
  code-source** seams. All mutating ops are **atomic conditional writes** (§4).
- **New — `src/lib/email.ts`** — `EmailAdapter` + `mockEmailAdapter` (non-prod, in-memory outbox) +
  `failClosedProdAdapter` (prod-without-provider → throws). Factory `emailAdapter()` per D4.
- **Edited — `src/app/mypage/_lib/actions.ts`** — `lookupOrder` → **`requestAccessCode`** (validate; on
  match issue+send; always return `stage:"verify"`) + **`verifyAccessCode`** (atomic verify; on success
  **mint → consume → cookie → redirect**, see §4 m5-fix).
- **Edited — `src/app/_components/mypage/MypageLookup.tsx`** — 2-stage form. **Keep the existing
  `useActionState(action,{})` + `<form action={formAction}>` server-action shape** (progressive
  enhancement preserved); the rendered stage comes from the action's return (`state.stage`);
  `verifyAccessCode` redirects from the server action. Borrow **only** the *mounted-gated submit* guard
  from `src/app/custom/phone/PhoneForm.tsx` / `src/app/custom/written/WrittenForm.tsx` (`const [mounted,
  setMounted]=useState(false)`; `useEffect(()=>setMounted(true),[])`; `disabled={!mounted||pending}`).
  ContactForm.tsx is the precedent only for *uncontrolled + FormData* — it has **no** mounted gate; do not
  adopt its client `onSubmit`/`fetch` handler. (review M5/m3)
- **Edited — `src/lib/env.ts`** — D5 block.
- **New — `prisma/schema.prisma` `OtpCode` model + migration** (§5).
- **Not introduced (rejected option):** a `src/lib/ratelimit.ts` per-IP limiter — no such file exists
  today (§1: 0 hits) and we deliberately don't add one (in-memory = broken-on-Vercel; Postgres per-IP =
  write-heavy misuse). Security-critical limits live durably on `OtpCode` (client-independent); broad
  per-IP/global DoS → documented **edge/WAF prod seam**. (review n2)

---

## 4. Data flow + atomic pseudocode

```
/mypage  ──[orderId, email]──▶  requestAccessCode
   order = orderRepo().get(orderId)
   match = order && normalizeEmail(order.buyerEmail) === normalizeEmail(email)
   if match: issueCodeIfAllowed(orderId, order.buyerEmail, now())     // atomic; may THROTTLE (no send)
   else:     hash(DUMMY_CODE)                                         // equalize compute (timing, §4.3)
   ALWAYS return { stage: "verify", orderId }                         // uniform response — no existence oracle

[code, orderId]  ──▶  verifyAccessCode
   v = otpStore.verify(orderId, code, now())                          // atomic debit + compare (NO consume)
   if !v.ok: return { stage:"verify", error:<uniform> }
   token = mintAccess(orderId)                                        // pure HMAC
   if !token: return { stage:"verify", error:<fail-closed> }         // m5: do NOT consume — code stays usable
   otpStore.consume(orderId, now())                                   // atomic single-use claim (idempotent)
   set capability cookie (token) → redirect /mypage/[orderId]
```

### 4.1 `issueCodeIfAllowed` — ATOMIC upsert + windowed throttle (review B2/M4)

One active code per order (`OtpCode.orderId @id`); a re-issue **replaces** the code fields but the
`sendCount` throttle accumulates within a **rolling window** so re-requests cannot both reset the throttle
(attack) and cannot lock a legit user out forever. **The window-reset, in-window-increment, and first-issue
cases are each a single atomic write** — never read-then-write — so concurrent issues cannot lose updates,
clobber each other's code, or reset `attempts` in parallel. The `attempts:0` reset **rides on the same
atomic write** that the throttle gates.

```
TTL_MS=10*60_000 · SEND_WINDOW_MS=60*60_000 · MAX_SENDS_PER_WINDOW=5 · MAX_ATTEMPTS=5

function issueCodeIfAllowed(orderId, email, now):
    code = codeSource()                              // prod: padded randomInt (§9); non-prod: deterministic
    // ONE atomic statement handles all four cases — new row, in-window+under-cap, window-elapsed reset,
    // and throttled — with no read-then-write. Throttled ⇒ 0 rows affected ⇒ no send. (multi-updateMany
    // sequencing is NOT used: a separate create-after-A/B-miss either infinite-loops on the at-cap row or
    // races; a single INSERT…ON CONFLICT is the clean atomic form.)
    affected = $executeRaw`
      INSERT INTO "OtpCode"(orderId,codeHash,expiresAt,attempts,windowStart,sendCount,lastSentAt,consumedAt)
      VALUES (${orderId}, ${hash(code)}, ${now+TTL_MS}, 0, ${now}, 1, ${now}, NULL)
      ON CONFLICT (orderId) DO UPDATE SET
        codeHash=EXCLUDED.codeHash, expiresAt=EXCLUDED.expiresAt, attempts=0, consumedAt=NULL, lastSentAt=${now},
        windowStart = CASE WHEN "OtpCode".windowStart > ${now-SEND_WINDOW_MS} THEN "OtpCode".windowStart ELSE ${now} END,
        sendCount   = CASE WHEN "OtpCode".windowStart > ${now-SEND_WINDOW_MS} THEN "OtpCode".sendCount+1 ELSE 1 END
      WHERE "OtpCode".windowStart <= ${now-SEND_WINDOW_MS}      -- window elapsed → reset+send
         OR "OtpCode".sendCount  <  ${MAX_SENDS_PER_WINDOW}`    -- in-window & under cap → increment+send
                                                                // else (in-window & at cap) → 0 rows = THROTTLED
    if affected === 0: return                        // throttled: NO send (caller still returns stage:verify)
    after(() => emailAdapter().send({ to: email, code }))   // §4.3: post-response (next/server), reliably
                                                            // executed, off the response clock; failure
                                                            // logged redacted, recoverable by re-request
```
The single `INSERT … ON CONFLICT DO UPDATE … WHERE` is atomic by construction (one statement); concurrent
issues serialize on the row lock and can neither exceed the cap nor clobber/lose updates. A
`prisma.$transaction(fn, {isolationLevel:'Serializable'})` wrapping read→branch→write (retry once on
`P2034`) is an acceptable equivalent. The structural delegate type exposes this as one
`issue(orderId, fields, now): Promise<{sent:boolean}>` method so `pnpm check` stays DB-independent; the
in-memory backend implements the identical compare-and-set synchronously.

### 4.2 `verify` — ATOMIC debit-and-bound, NO consume (review B1/M1/M3/m2/m5)

```
function verify(orderId, input, now):
    code = input.trim()
    if !/^\d{6}$/.test(code): return { ok:false }              // canonical-form gate (M3) — malformed ≠ a
                                                               // guess; do NOT debit (avoids garbage lockout)
    // atomic debit: increment ONLY while live & under cap — the WHERE is the gate (no stale read)
    d = otpCode.updateMany({
          where:{ orderId, consumedAt:null, expiresAt:{ gt:now }, attempts:{ lt:MAX_ATTEMPTS } },
          data:{ attempts:{ increment:1 } } })
    if d.count === 0: return { ok:false }                      // missing/consumed/expired/over-cap — uniform
    e = otpCode.get(orderId)                                   // re-read the just-charged row for codeHash
    if !constantTimeEqual(hash(code), e.codeHash): return { ok:false }
    return { ok:true }                                         // consume happens in verifyAccessCode (m5)

// consume() — atomic single-use claim; idempotent; concurrent legit double-mint is acceptable
function consume(orderId, now):
    otpCode.updateMany({ where:{ orderId, consumedAt:null }, data:{ consumedAt:now } })   // count irrelevant
```
- **Atomic cap (B1/M1):** the debit `updateMany` both increments and enforces `attempts < MAX` in one
  statement → N concurrent verifies can charge at most to the cap; no TOCTOU.
- **Canonical form (M3):** generation produces a fixed 6-ASCII-digit string (§9); verify strict-matches
  `/^\d{6}$/` and hashes the trimmed string — store and verify provably aligned; no valid code fails to
  verify; clean 10⁶ space.
- **Single-use (m2/m5):** `consume()` is an atomic conditional write; it runs only **after** a non-null
  `mintAccess` (so a null mint never burns the code → no lockout). Concurrent correct guesses may both mint
  (both are the legit holder — acceptable); a *future* request finds `consumedAt` set → debit `count 0` →
  FAIL.
- **Attempt-cap × re-issue (intended, bounded):** re-request resets `attempts`, but the send throttle
  bounds re-issues (≤5/window) → ≤ 5 codes/hr × 5 = 25 guesses/hr vs 10⁶ ⇒ infeasible. A legit user locked
  out by an attacker exhausting attempts recovers by re-requesting (resets attempts); the throttle bounds
  the abuse.

### 4.3 Timing & delivery (review B3/M7/m1/m6)
- **Delivery is serverless-safe:** the send is scheduled via `after()` (`next/server`, available on Next
  15) — it runs **after the response flushes**, is **reliably executed** (the instance is kept alive for
  it, unlike a bare un-awaited promise that Vercel can drop on freeze), and is **off the response-latency
  path**. The term "enqueue" is dropped — there is no queue (DEPLOY.md §1). On send failure: log redacted,
  no user-facing error (a send error would itself be a match oracle); the row persists → the buyer
  re-requests. **The real-adapter follow-up (D6b) MUST use `after()`/await, never a bare promise.**
- **Timing oracle:** (i) the send is off the response clock (`after()`); (ii) **both match and no-match
  paths perform an equal `hash(...)`** (the no-match `hash(DUMMY_CODE)` in §4) so compute cost matches;
  (iii) the **residual** is the match-only atomic-issue DB write — a sub-jitter side-channel, **documented**,
  with **edge constant-time-response** as the hardening seam. §8's "no existence oracle" is scoped to
  **response content**; this residual is acknowledged, not eliminated. The durable per-order caps — not
  request timing — are the security boundary.

---

## 5. `OtpCode` model + migration (review M4, requirement 3)

Standalone (no FK to `Order`): an ephemeral auth artifact, decoupled to avoid editing the `Order` model.

```prisma
model OtpCode {
  orderId     String    @id          // one active code per order (atomic upsert by id ⇒ replaces prior)
  codeHash    String                 // sha256/HMAC of the canonical 6-digit string — plaintext never stored
  expiresAt   DateTime               // TTL 10m
  attempts    Int       @default(0)  // verify-attempt cap (5) — debited via atomic conditional updateMany
  windowStart DateTime               // start of the current send-throttle window
  sendCount   Int       @default(0)  // sends within [windowStart, +SEND_WINDOW) — client-independent
  lastSentAt  DateTime
  consumedAt  DateTime?              // single-use (atomic claim)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```
- **Migration is generated, not hand-written:** `pnpm db:up` (local docker) → `pnpm prisma migrate dev
  --name otp_code` → commit `prisma/migrations/<ts>_otp_code/migration.sql` (avoids `migrate diff`/`status`
  drift). Run at a **non-racing moment** (serialize docker/DB use vs F045). `migrate deploy` to **Supabase
  is a go-live/merge step** — not applied to shared infra during parallel work.
- **Structural delegate type** (the `finishing.ts` `OrderItemDelegate` pattern) keeps `pnpm check`
  DB-independent (ADR-0002); it includes the `updateMany`-with-`{ increment:1 }` shape.
- **Parity limit, stated honestly (M4):** the injected-fake delegate proves logic **shape** but **cannot
  prove atomicity** (single-threaded JS never interleaves) — the same class of in-memory↔Prisma divergence
  that bit `finishing.ts:118-124` (upsert-vs-create). The Prisma backend's correctness depends on the
  conditional `updateMany`/`increment`. Therefore the gated `tests/unit/otp-persistence-integration.test.ts`
  (`skipIf(!DATABASE_URL)`, new file) MUST include **concurrency cases** against real Postgres (§10), not
  just round-trip/restart-survival.

---

## 6. Email adapter + provider seam (review M7/m4, requirement 2)

```ts
// src/lib/email.ts
export interface EmailMessage { to: string; code: string }
export interface EmailAdapter { send(msg: EmailMessage): Promise<void> }
export function mockEmailAdapter(): EmailAdapter & { outbox: EmailMessage[] }  // non-prod; no external effect
export function failClosedProdAdapter(): EmailAdapter                          // prod w/o provider → throws
export function emailAdapter(): EmailAdapter                                    // factory per D4
```
- Provider-agnostic; **Resend** go-live target (ratify). Real adapter = paired follow-up (D6b); it MUST be
  invoked via `after()`/await (§4.3).
- **PII-safety — two distinct mechanisms (m4):** the recipient **email**, if it ever reaches a trace attr,
  is masked by `redact()` (`***@***`, `env.ts:62`). The **code** is protected **by construction** — it is
  never written to any trace/log/outbox-log path; `redact()` has **no** numeric rule and need not (a
  6-digit code passes through `redact()` unchanged). `email.test.ts` asserts (a) the email is masked, and
  (b) the **code is absent** from every sink (pass the raw code through `redact()` to show it is unchanged,
  proving masking is not the mechanism; then assert no emit path receives it).

---

## 7. `env.ts` change (surgical; review I/m7/M2)

Add `MYPAGE_ACCESS_SECRET: z.string().optional()` to the schema, then the **separate post-parse block** of
D5 (`isProd` via `VERCEL_ENV` cross-check + the required-in-prod throw). Tests in a **new**
`tests/unit/mypage-auth-env.test.ts` (not the shared `smoke.test.ts` — F045 owns the
`TOSS_WEBHOOK_SECRET` assertions there). **`env.ts` WILL be a git merge conflict** vs F045 (see §11).

---

## 8. Security invariants

| Invariant | Status | How |
|---|---|---|
| **Possession proof** | NEW | Access requires a code delivered to the order's email. |
| **No existence oracle** | strengthened (response-content) | `requestAccessCode` **always** returns `stage:"verify"`. A sub-jitter timing/DB-write side-channel on match is acknowledged in §4.3, deferred to the edge constant-time-response seam. |
| **Brute-force resistance** | NEW (durable, **atomic**) | `attempts` cap (5) enforced by an atomic conditional `updateMany` debit (the `markPaid` idiom), + 10m TTL + atomic single-use + send throttle bounding re-issues. |
| **Email-bomb resistance** | NEW (atomic) | client-independent `sendCount` window cap via atomic conditional write; no-match sends nothing. |
| **No PII in logs/DOM/URL** | kept | email `redact()`-masked; **code by-construction omission** (m4); capability layer unchanged. |
| **noindex / no-store** | kept | mypage `robots:noindex`; dedication only via the cookie-gated no-store `/state` route. |
| **Fail-closed in prod** | strengthened | `MYPAGE_ACCESS_SECRET` required at boot on the **hardened** `isProd` marker; real email off until provisioned. |
| **Untrusted boundary** | kept | inputs `untrusted()`; client IP wrapped `untrusted()` (platform IP only; XFF spoofable; IP is a soft backstop, durable caps are the boundary). |

---

## 9. Hermetic E2E + determinism (review M2/M3/K, requirement 4)

- **Code-source seam, gated on the HARDENED marker (M2):** `String(crypto.randomInt(0,1_000_000)).padStart(6,"0")`
  when `isProd` (M3 canonical form); a **deterministic 6-ASCII-digit test code** otherwise. **Fail-closed
  cross-check:** the deterministic code may coexist **only** with the mock adapter — if a real provider is
  ever configured while the code-source is not `randomInt`, **boot throws**. This guarantees *deterministic
  code ⟺ mock adapter*, removing the silent guessable-OTP-in-prod path even if `APP_ENV` is wrong.
- **Posture note (corrected, M2):** without the `isProd`/`VERCEL_ENV` backstop, a wrong `APP_ENV` would
  **regress** mypage from today's *fail-closed* (`mintAccess→null` blocks finishing) to *fail-open*
  (reachable via a guessable OTP) — a **new** failure mode, not "the same posture as the existing dev
  secret." The backstop removes it; **prod uses real `randomInt`.**
- **Helper change:** `lookup()` in both specs gains the code step (fill order#+email → submit → fill the
  deterministic OTP → submit → `waitForURL('**/mypage/${orderId}')`). New test-ids `mypage-otp-input`,
  `mypage-otp-submit`, `mypage-otp-error`.
- **Cases preserved verbatim in `mypage-photo.spec.ts`** (that spec's own R-numbers, *not* the
  `check-constraints` rules; capability layer unchanged ⇒ they carry over):
  - `"R1: no-cookie visit is an identical access prompt for an existing AND a non-existent id (no existence oracle)"`
  - `"R7: an expired (validly-signed, past-exp) token is rejected"`
  - `"R9: a token with a valid exp but a tampered HMAC is rejected (isolates the HMAC-mismatch branch)"`
  - `"both mypage pages are noindex (R5)…"`, `"an unpaid (CREATED) order…"`, the PII-leak + 375px cases.
- **`"wrong email -> uniform error, no redirect, no access"` is rewritten** to
  `"wrong email -> uniform code-entry advance, code never verifies, no access"` — preserving the invariant
  (wrong email ⇒ no access, no oracle), strengthened.
- `mypage-finish.spec.ts`: only its `lookup()` helper changes; finishing assertions unchanged.
- F046 verification: `pnpm test:e2e -- mypage-photo.spec.ts mypage-finish.spec.ts` (own E2E ⇒ R8-exempt).

---

## 10. Test plan (TDD, RED → GREEN)

**Unit (new files — conflict-free vs F045):**
- `tests/unit/otp.test.ts` — code gen `/^\d{6}$/` (canonical, M3); hash; single-use; TTL expiry (clock
  seam); attempt cap; windowed throttle (≤5/window, reset after elapse); upsert replaces code but preserves
  in-window `sendCount`; constant-time compare; **verify rejects non-6-digit input without debiting**. Logic
  via an injected fake delegate (hermetic).
- `tests/unit/email.test.ts` — mock outbox dispatch; **email masked + code absent** from the redacted sink
  (m4); `failClosedProdAdapter().send` throws; factory selects mock in non-prod.
- `tests/unit/mypage-auth-env.test.ts` — `parseEnv` throws when `isProd && !MYPAGE_ACCESS_SECRET`; throws
  when `VERCEL_ENV=production && APP_ENV!==production` (M2); accepts when set; non-prod unaffected;
  deterministic-code + configured-provider throws (M2).
- `tests/unit/otp-persistence-integration.test.ts` — **gated** `skipIf(!DATABASE_URL)`; round-trip +
  restart-survival **and CONCURRENCY (M4)**: N parallel `verify` of a wrong code ⇒ `attempts` capped at
  `MAX_ATTEMPTS` (not exceeded); N parallel `issue` ⇒ ≤ `MAX_SENDS_PER_WINDOW`; two parallel correct
  `verify`+`consume` ⇒ `consumedAt` set exactly once. (Run against local docker at a non-racing moment.)

**E2E:** rewrite the `lookup()` helper + wrong-email case per §9; preserve every invariant assertion.

**Gates:** `pnpm check` green + the two mypage E2E specs. Independent **worker≠checker** review (F042)
before `passes:true`.

---

## 11. File scope + parallel-safety (F045 — merged to master `d841845`)

**Edit / create:** `mypage/_lib/{actions.ts, otp.ts(new)}`, `src/lib/email.ts(new)`, `src/lib/env.ts`,
`_components/mypage/MypageLookup.tsx`, `prisma/schema.prisma` (+OtpCode), `prisma/migrations/<ts>_otp_code/`,
`tests/e2e/mypage-{photo,finish}.spec.ts`, new `tests/unit/{otp,email,mypage-auth-env,otp-persistence-integration}.test.ts`;
**append-only** to `feature_list.json`/`PROGRESS.md`/`DECISIONS.md` (ADR-0021); `docs/DEPLOY.md` (§10 rows +
own §2 mypage bullets).

**Never touch (F045-owned):** `src/app/api/payments/**`, `payments/_lib/checkout.ts`, `src/lib/payments/**`,
`tests/unit/webhook.test.ts`. **`guardrails.ts` and `check-constraints.mjs` untouched.**

**Merge hotspots (F045 already merged → these are real 3-way conflicts):**
- **`DECISIONS.md` — ADR number collides (M6).** master's `DECISIONS.md` already has `ADR-0020` = F045. F046
  uses **ADR-0021**. Re-grep master's highest ADR at merge time before finalizing.
- **`src/lib/env.ts` — GUARANTEED git conflict (m7), not "low".** Both F045 and F046 insert a structurally
  identical `if (...production... && !env.<VAR>) throw` block between the live-key block and `return env;`.
  Resolution: keep **both** throws (order irrelevant). **Post-merge gate:** `pnpm verify` green — which runs
  F045's `smoke.test.ts` (`/TOSS_WEBHOOK_SECRET/`) **and** F046's `mypage-auth-env.test.ts`
  (`MYPAGE_ACCESS_SECRET`) — proving neither throw was dropped.
- **`docs/DEPLOY.md` — hotspot (m8).** F045 already edited §2's webhook bullet, §10's table (flipped the
  webhook row TODO→DONE), and §11's canary row. F046 edits the **same §10 table** on the two *adjacent*
  rows ("Real buyer auth" + "MYPAGE_ACCESS_SECRET boot validation" → DONE) and refreshes its **own** §2
  mypage bullets (now stale: "mypage is NOT real buyer auth" / "fails closed" → fail-closed-until-provider).
  Touch **only** F046's rows; keep F045's webhook row/bullet. Expect an adjacent-row table conflict.
- **`feature_list.json`/`PROGRESS.md`** — append only the F046 entry; don't touch F045's.
- **`prisma/schema.prisma`** — additive (new model), low conflict.

**DB/E2E serialization:** never run `pnpm db:up` / `pnpm test:e2e` while F045 work holds docker/:3000.

---

## 12. `feature_list.json` entry (append-only, R9-safe)

```jsonc
{ "id": "F046", "category": "safety", "track": "product", "priority": 2,
  "description": "실 buyer 인증: 마이페이지 HMAC stand-in → 이메일 OTP 소유증명 + 주문당 durable·atomic rate-limit; MYPAGE_ACCESS_SECRET 부팅검증 흡수",
  "steps": [
    "주문번호+이메일 제출 → 일치 시 6자리 OTP 발송(결과는 일치 여부와 무관하게 균일, no existence oracle)",
    "OTP 입력 → 원자적 검증(단일사용·10m TTL·시도 5회·주문당 발송 throttle, 모두 atomic conditional write) 성공 시에만 capability 쿠키 발급 → /mypage/[orderId]",
    "MYPAGE_ACCESS_SECRET 부재 시 prod boot 거부(VERCEL_ENV 교차검증); 실 이메일은 prod provider 미설정 시 fail-closed(테스트=목)"
  ],
  "verification": "pnpm test:e2e -- mypage-photo.spec.ts mypage-finish.spec.ts",
  "state": "in_progress", "passes": false, "evidence": "" }
```
Own E2E ⇒ R8-exempt. Append `in_progress`/`passes:false` (R4 ok, R9 allows new id).

---

## 13. Named seams / follow-ups (DEPLOY §10, ADR-0021)

- **Check off:** "Real buyer auth (replace mypage HMAC stand-in)" — replaced by OTP + durable atomic
  limits; "`MYPAGE_ACCESS_SECRET` boot validation" — added to `env.ts`.
- **Refresh §2** (own mypage bullets): "mypage is NOT real buyer auth" / "fails closed without
  MYPAGE_ACCESS_SECRET" → now OTP-authed; **fail-closed until the email provider is provisioned**.
- **Add TODO rows:** (1) **Real transactional email provider** (Resend adapter + secret, via `after()`/await)
  — paired follow-up; until provisioned, prod mypage auth is fail-closed (accepted seam, D6c). (2)
  **Edge/WAF broad rate-limiting** for request-flood DoS (durable per-order caps cover targeted abuse). (3)
  **Edge constant-time-response** hardening for the §4.3 timing residual.

---

## 14. Spec-review checklist

1. ✅ §4.1/§4.2 — atomic upsert/throttle/debit/consume semantics (windowed; `markPaid` idiom; no RMW).
2. ✅ §6/D6 — **RATIFIED 2026-06-11:** Resend target; real adapter = **paired follow-up** (not F046); prod
   mypage fail-closed-until-provisioned on deploy **accepted** as a named seam.
3. ✅ §5 — migration via `prisma migrate dev --name otp_code` (generated).
4. ✅ §9 — preserved `mypage-photo.spec.ts` titles verified against the file.
5. ✅ §11 — ADR-0021 (not 0020); env.ts guaranteed conflict + `pnpm verify` post-merge gate; DEPLOY.md
   hotspot.
6. ✅ §9/§7/D5 — hardened `isProd` (VERCEL_ENV cross-check) so a wrong `APP_ENV` can't fail open.
