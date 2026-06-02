# TRACK-MYPAGE (F017, F018) — Design Spec

> 2026-06-02 · Branch `feat/mypage` · Precondition: F013 + F029 merged (both `passing`).
> Scope contract: **touch ONLY** `src/app/mypage/`, `src/app/_components/mypage/*`,
> `tests/e2e/mypage-*.spec.ts`. Of `src/lib/*`, import **assets** only (+ cross-cutting
> `untrusted`/`redact`). Photos/QR via `Asset` `storageKey`, PII redacted.

## 1. Problem & scope

After paying, a buyer **finishes** their keepsake book on 마이페이지:

- **F017** — see the order + its status; **upload the child photo if it was skipped** at checkout.
- **F018** — write a **dedication (헌정 문구)**; **upload a QR video** — the QR control appears
  **only if the QR add-on was chosen** (`Order.qrVideoAddon`).

Out of scope (named seams, not silent skips — continuing F009/checkout culture): the AI book
pipeline (backstage), durable object-storage of the uploaded **bytes** (we persist the
access-controlled *descriptor* only, per F009/ADR-0011), real buyer authentication, and the
Prisma persistence of finishing data.

## 2. The central constraint → architecture

The checkout-owned `OrderRepo` (`src/app/api/payments/_lib/orders.ts`) exposes only
`create/get/markPaid` — **no** way to attach a photo/dedication/QR — and is **out of my
touch-scope**. So:

- **Read** the order through `orderRepo().get(id)` (read-only import of a merged, settled module).
- **Persist** finishing data in a **new mypage-owned hermetic store** keyed by order, with a
  documented **Prisma seam** → `Personalization.photoAsset` / `Personalization.dedication`
  (per `OrderItem`) + an `Order`-level `Asset(kind=QR_VIDEO)`. This is exactly the pattern
  TRACK-CHECKOUT used (`api/payments/_lib/` co-location + seam; ADR-0013), not a workaround.

### Data model (schema-faithful)
- **Per `OrderItem`**: `photo` descriptor + `dedication` text  → mirrors `Personalization`.
- **Per `Order`**: `qrVideo` descriptor + the `qrVideoAddon` flag → mirrors `Order`.
- *TODO (intent, not this track):* if the product later wants **QR per book**, that is a
  **schema change** (`Asset` already links to `Order`; a per-item QR would need a new relation) —
  recorded as a TODO; today QR is per-order per the schema.

## 3. Access model — order # + email lookup, HMAC capability cookie

This harness has **no auth**, and order ids are sequential/guessable (`ord_0001`…), so
`/orders/[id]` renders zero PII. Mypage is write-capable + shows the buyer's own PII, so it needs
an ownership proof. Decision (user-approved): **order number + the email paid with**, verified
against `order.buyerEmail`, minting an **HMAC-signed httpOnly capability cookie**.

### `src/app/mypage/_lib/access.ts`
- `accessSecret(env = process.env)` → `env.MYPAGE_ACCESS_SECRET ?? (env.APP_ENV !== "production"
  ? "test_mypage_access_dev" : undefined)`. **No source-literal secret** in prod; **fail-closed**
  (returns `undefined` → mint/verify both fail) when unset in production. Mirrors checkout's
  `webhookSecret`. **Never logged** (R2 spirit).
- `mintAccess(orderId, now=Date.now())` → `${exp}.${hmac}` where `exp = now + TTL` (TTL = 2h) and
  `hmac = HMAC-SHA256(secret, `${orderId}.${exp}`)`. Returns `null` if no secret (fail-closed).
- `verifyAccess(orderId, token, now=Date.now())` → false if no secret / no token / malformed /
  `now >= exp` / **constant-time** HMAC mismatch (`timingSafeEqual`, length-guarded — same shape
  as `verifyWebhookSignature`). Expiry is *in the signed payload* so a leaked cookie dies.
- `cookieName(orderId)` → `mypage_${orderId}` (per-order scope: one order's proof never grants
  another's).
- Cookie attributes when set: `httpOnly`, `sameSite:"lax"`, `secure: APP_ENV==="production"`,
  `path:"/mypage"`, `maxAge: TTL/1000` (belt-and-suspenders with the signed `exp`).

### Enumeration & abuse
- Lookup returns a **uniform error** ("주문번호와 이메일을 다시 확인해 주세요.") whether the id is
  unknown **or** the email mismatches — no existence oracle.
- *TODO:* lookup rate-limiting (no shared rate-limit infra in this harness; named, not silent).

## 4. Routes & components (all mypage-owned)

| File | Kind | Responsibility |
|---|---|---|
| `src/app/mypage/page.tsx` | server (`noindex`) | renders `<MypageLookup>` |
| `src/app/mypage/[orderId]/page.tsx` | server (`force-dynamic`, `noindex`) | cookie-gate → access prompt **or** non-PII shell + `<FinishingClient>` |
| `src/app/mypage/[orderId]/state/route.ts` | GET route handler | **cookie-gated**, `Cache-Control: no-store` JSON snapshot (the *only* place PII — the dedication — crosses the wire) |
| `src/app/mypage/_lib/access.ts` | server lib | §3 |
| `src/app/mypage/_lib/finishing.ts` | server lib | hermetic finishing store + `globalThis` singleton (Prisma seam) |
| `src/app/mypage/_lib/actions.ts` | `"use server"` | `lookupOrder`, `uploadFinishingPhoto`, `saveDedication`, `uploadQrVideo` (+ internal `requireAccess`) |
| `src/app/_components/mypage/MypageLookup.tsx` | client | order# + email form (FormData; calls `lookupOrder`) |
| `src/app/_components/mypage/FinishingClient.tsx` | client | fetches `/state`, renders photo/dedication/QR controls, calls the actions |
| `src/app/_components/mypage/mypage.module.css` | CSS module | DESIGN tokens only (R6/R7) |
| `tests/e2e/mypage-photo.spec.ts` | E2E | F017 |
| `tests/e2e/mypage-finish.spec.ts` | E2E | F018 |

### PII-out-of-document discipline
The `[orderId]` **page** SSRs only **non-PII** (status, template labels, cover labels via
`COVER_LABEL`, prices via `formatWon`, grand total, "photo on file?" boolean, the QR section
shell). The **dedication text (PII)** never enters the SSR HTML — it crosses **only** via the
`no-store`, cookie-gated `/state` JSON that `<FinishingClient>` fetches on mount and uses to
**prefill** the textarea (user-approved: the editor's purpose is the buyer managing *their own*
PII; rendering it is intended function, guarded by email-gate + HMAC + `no-store` + `noindex`).
This mirrors the repo's `/cart` "client view + SSR-safe shell" precedent (F011) and keeps PII off
any cacheable document — honoring the public-PC back-button concern deterministically (I control
the `no-store` header on the route handler; I do not rely on Next's default page caching).

## 5. Write paths (server actions — defense in depth)

Every write **re-verifies the cookie** for `orderId` (`requireAccess` reads `cookies()` →
`verifyAccess`) before touching the store — not just at page load. Each input is `untrusted()` at
the boundary.

- **`uploadFinishingPhoto(orderId, index, formData)`** → `requireAccess` → order is PAID →
  `receiveUpload({filename, contentType, bytes})` → `storeAsset("CHILD_PHOTO", …)` (the **real**
  F029 path) → `finishingStore.setPhoto(orderId, index, descriptor)`. Returns `{ok}` with **no
  PII** (no filename/childName). Unsupported type → friendly typed error (assets.ts throws a
  redacted message).
- **`saveDedication(orderId, index, text)`** → `requireAccess` → PAID → trim/length-guard →
  `finishingStore.setDedication`. **Never logged.**
- **`uploadQrVideo(orderId, formData)`** → `requireAccess` → PAID → **only meaningful if
  `order.qrVideoAddon`** (action also guards) → `storeAsset("QR_VIDEO", …)` →
  `finishingStore.setQrVideo`.
- **`lookupOrder(_prev, formData)`** → `untrusted` order#/email → `orderRepo().get` + normalized
  email match → `mintAccess` → set cookie → `redirect('/mypage/<id>')`; else uniform error.

“Photo on file” for an item = `order.items[i].photo != null` (attached at checkout) **OR**
`finishingStore` has a photo for it. The upload control shows only when **not** on file.

Finishing controls render/act **only when `order.status === "PAID"`**; a `CREATED` order shows
status + an honest "결제 완료 후 마무리" message and **no** controls (and the actions reject).

## 6. Safety / honesty summary
- External input `untrusted()` at every boundary (lookup, uploads, dedication).
- No PII in logs/traces: dedication/childName never logged; any asset trace uses
  `assetLogAttrs`/`redact`. Filenames consumed at the boundary, never persisted/echoed (assets.ts).
- `noindex` on mypage routes; `no-store` on the `/state` PII response; HMAC key from env,
  fail-closed in prod, never logged.
- Durable bytes + real `Asset`/`Personalization` rows + buyer-auth = named seams (ADR-0014).

## 7. Tests (E2E only — track scope adds no unit tests)

> These two specs are **F029's `e2e_via:[F009,F017,F018]` made real**: they drive `assets.ts`
> end-to-end with a genuine `setInputFiles` upload (→ `receiveUpload`→`storeAsset`), asserting an
> opaque `storageKey` outcome with **no filename/childName in the DOM or URL**.

**`mypage-photo.spec.ts` (F017)**
1. Pay for `/order/birth` **skipping** the photo → capture `orderId` (email `parent@example.com`).
2. `/mypage` → fill order# + email → submit → land `/mypage/<id>`; assert status **PAID** + label **탄생**.
3. Photo upload control visible (skipped) → `setInputFiles` a real small image → "사진이 등록되었습니다"; **no filename in DOM/URL**.
4. Reload → still shows photo on file (persists via the hermetic store).
5. Wrong email → uniform error, **no** redirect. Direct `/mypage/<id>` with **no cookie** → access prompt, **no** controls. Tampered cookie → access prompt (HMAC rejects).
6. 375px no-overflow.

**`mypage-finish.spec.ts` (F018)**
1. Pay with **QR add-on ON** → lookup → finishing page.
2. Dedication: fill "테스트 헌정" → save → "저장되었습니다" → **reload → textarea prefilled** "테스트 헌정".
3. QR add-on ON → QR upload visible → `setInputFiles` a small `.mp4` → "등록되었습니다"; "요금 추후 안내" note present.
4. Separate order with **QR add-on OFF** → finishing page → QR section **absent** (not rendered).
5. 375px no-overflow.

## 8. Ratified scope deviations (conflict-free — `feat/mypage` is the only active branch; every imported file is merged/settled; mirrors ADR-0011/0013)
- Read-only import: `orderRepo` (`@/app/api/payments/_lib/orders`), `formatWon`/`COVER_LABEL`
  (`@/app/_components/order/format`), `Nav`/`Footer` (shared kit — import-only is explicitly allowed).
- Co-locate `mypage/_lib/{access,finishing,actions}.ts` (track grants no new `src/lib/*`; same as
  checkout's `api/payments/_lib`).
- Cross-cutting `untrusted`/`redact` (AGENTS #5/#6 require them regardless of the per-track import line).

## 9. Definition of done
F017 & F018 → `passing` only when **(1)** `pnpm check` green, **(2)** `mypage-photo.spec.ts` +
`mypage-finish.spec.ts` green, **(3)** an independent worker≠checker review recorded (F042/ADR-0005).
