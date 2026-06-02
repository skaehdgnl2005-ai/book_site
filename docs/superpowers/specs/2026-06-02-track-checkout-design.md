# TRACK-CHECKOUT (F012–F016, F034) — Design

> Entry-line checkout: turn the localStorage cart into a server `Order`, drive a
> TossPayments **(test)** payment, and converge the order to **PAID** via two idempotent
> paths (synchronous confirm + async webhook). Hermetic by default (no DB, no network);
> production swaps a Prisma adapter + real Toss SDK behind the same documented seams.
> Precondition met: F003 (payments lib) + F011 (cart) merged. Branch: `feat/checkout`.

## Scope (features)
- **F012** Checkout creates a Toss (test) payment + redirects into the Toss flow.
- **F013** Toss SUCCESS: confirm + webhook mark the order PAID (signature-verified, idempotent via `ProcessedWebhook`).
- **F014** Order confirmation page `/orders/[id]` (items, cover, total, status PAID).
- **F015** Toss FAILURE handled (clear message, **no PAID order**).
- **F016** Toss CANCEL handled (return to `/cart`, **cart preserved**).
- **F034** (harness) checkout/confirm require explicit verification before `passes:true` — worker≠checker review recorded in PROGRESS/DECISIONS.
- Advances **F035** (checkout 375px no-overflow) and satisfies **F042** (worker≠checker pass).

## Constraints honored (the handoff from ADR-0011 + AGENTS.md)
1. **Buyer identity is a NEW `/checkout` step**, not in the cart. `buyerName`→`Order.buyerName`(+`customerName`), `buyerEmail`→`Order.buyerEmail`. PII — never logged/traced.
2. **Recompute the order amount server-side** from authoritative `Template` prices. The client `grandTotalWon`/`unitPriceWon`/`amountWon` are **display-only / untrusted**.
3. **Resolve `templateKey`→`Template`** (revalidate exists/active/price) at order creation. (Production also resolves `Template.id`; hermetic mode keys items by `templateKey` — see Seam notes.)
4. **`clearCart()` ONLY after PAID** — never on checkout start. That is what preserves F016's cart on cancel.
5. WIP=1; touch only the track-owned paths; TossPayments **TEST keys only**; untrusted() at every boundary; no secrets/PII in logs; design tokens only (R6/R7).

## Where track-owned code lives (no `src/lib/*` is in the file list)
The track file list grants `src/app/checkout/`, `src/app/api/payments/`, `src/app/orders/[id]/`
and the named tests — and "import `src/lib/cart` + `src/lib/payments` only". There is **no
`src/lib/checkout`** allowance, so all checkout domain logic is **co-located under the owned
app dirs** in Next.js *private folders* (`_lib/`, excluded from routing):

```
src/app/checkout/
  page.tsx                 # buyer-identity step + 결제하기 (client view)
  CheckoutView.tsx         # client: reads cart (localStorage), buyer form, POST /api/payments/create → redirect
  checkout.module.css
  pay/page.tsx             # SANDBOX Toss stand-in (server comp; reads order; outside-production only)
  pay/PaySandbox.tsx       # client: 결제 승인 / 결제 실패 / 취소 buttons
  failed/page.tsx          # F015 failure page (clear message; back to /cart)
src/app/api/payments/
  _lib/orders.ts           # hermetic Order store (globalThis) + ProcessedWebhook ledger; Prisma seam
  _lib/checkout.ts         # buildOrderFromCart (server price recompute), provider wiring, confirm/webhook logic
  create/route.ts          # F012 POST: create order + Toss checkout
  confirm/route.ts         # F013 POST: settle (sync) → PAID (idempotent)
  webhook/route.ts         # F013 POST: Toss webhook (signature-verified, idempotent via ProcessedWebhook)
src/app/orders/[id]/
  page.tsx                 # F014 confirmation (server comp; reads order)
  orders.module.css
tests/e2e/  checkout-start.spec.ts · checkout-success.spec.ts · checkout-failed.spec.ts · checkout-cancel.spec.ts · order-confirm.spec.ts
tests/unit/ webhook.test.ts
```

### Justified, conflict-free scope deviations (precedent: ADR-0010 `approve.mjs`, ADR-0011 `templates.ts`)
- **Import `getTemplateByKey` from the merged, import-only catalog module** (`@/app/_components/catalog/templates`). The ADR-0011 handoff *mandates* authoritative server-side price recompute + `templateKey` resolution; the catalog is the template SoR. Import-only of an already-merged module; zero merge conflict (no concurrent writer).
- **Enable the `/cart` 결제하기 CTA** (one line in `src/app/_components/order/CartView.tsx`). TRACK-ORDER left it `disabled` "준비중 until TRACK-CHECKOUT lands" — an explicit handoff point. Flip `disabled` → a `Link href="/checkout"`. Minimal, at the documented seam.
Both recorded in the new ADR.

## Architecture & data flow
```
/cart (결제하기) ──▶ /checkout (buyer form)
                         │ POST /api/payments/create  { lines[], qrVideoAddon, buyerName, buyerEmail }  (untrusted)
                         │   server: validate buyer; for each line resolve templateKey→Template (revalidate),
                         │   recompute unitPriceWon from coverType (authoritative); amountWon = Σ + QR(0);
                         │   create Order(status=CREATED, tossOrderId=id, amountWon, buyer, items);
                         │   provider.createCheckout({orderId, amount, orderName, successUrl, failUrl})
                         ▼ returns { orderId, checkout, payUrl }
                   redirect to payUrl
   ┌─────────────────────── outside production: payUrl = /checkout/pay?order=<id> (SANDBOX) ──────────────────────┐
   │  /checkout/pay (server reads order → amount/orderName)  +  PaySandbox buttons:                                │
   │    결제 승인 → POST /api/payments/confirm {orderId} → (PAID) → clearCart() → /orders/[id]                      │
   │    결제 실패 → /checkout/failed                (no confirm call → order stays CREATED → no PAID order)         │
   │    취소     → /cart                            (clearCart never called → localStorage cart intact)            │
   └──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
   (production seam: payUrl drives the real Toss SDK; success/fail URLs point at confirm/failed — documented, not built/verified here)

async, server-to-server (F013): POST /api/payments/webhook  (raw body)
   verify HMAC sig (TOSS_WEBHOOK_SECRET, constant-time) → parse {eventId, orderId, status}
   dedupe via ProcessedWebhook(eventId): seen → 200 no-op; new → record + (DONE → markPaid idempotent)
   bad/missing sig → 401, no state change
```

### The hermetic Toss-redirect stand-in (key decision)
Real Toss opens a **hosted** payment window via the Toss SDK; on approve/fail/cancel it
redirects to our success/fail URLs (or the user closes it). The hermetic E2E (one `pnpm dev`,
**no DATABASE_URL, no network** — ADR-0002) cannot run that. So **outside production** the
create route returns `payUrl = /checkout/pay?order=<id>` — an **internal page that stands in for
Toss's hosted page**: it reads the authoritative order (server component) and shows amount +
orderName + three buttons (승인/실패/취소), clearly labeled **테스트 결제**. This makes all
three Toss outcome branches (F013/F015/F016) deterministically E2E-testable — exactly how you'd
exercise a real integration's three return paths. **In production the sandbox page is impossible**
(`APP_ENV==='production'` → real Toss SDK path); this mirrors ADR-0012 D2's "stub impossible in
production". Honest deferral: the real Toss **browser SDK** wiring is a documented seam (not built
or claimed here — adding an unverifiable SDK path would be a silent half-done thing); what ships +
verifies is the hermetic sandbox + the provider-agnostic create/confirm/webhook server logic.

### Server-side price recompute (anti-tampering) — `buildOrderFromCart`
Input is `untrusted()`. For each cart line: `getTemplateByKey(line.templateKey)`; `null` → reject
(400, unknown template). `unitPriceWon = coverType==='HARD' ? t.hardPriceWon : t.softPriceWon`
(authoritative; the client `unitPriceWon` is ignored). `amountWon = Σ unitPriceWon + (qrVideoAddon ? QR_ADDON_WON(0) : 0)`.
The client `grandTotalWon`/`amountWon` are never trusted. Buyer: `buyerName` non-empty (≤120),
`buyerEmail` simple shape; both untrusted, never logged. Empty cart → 400.

### Idempotent PAID convergence
`orderStore.markPaid(tossOrderId, paymentKey)` is **idempotent**: already-PAID → no-op (returns
existing). Both the sync confirm and the async webhook call it.
- **confirm** (`/api/payments/confirm`): load order by id (404 if missing); `amount = order.amountWon`
  (authoritative, server-held); `provider.confirm({paymentKey, orderId, amount})`; `PAID` → `markPaid`,
  store `tossPaymentKey`, 200; else **402, order stays CREATED** (no PAID). The client only sends
  `orderId` — never the amount.
- **webhook** (`/api/payments/webhook`): raw body; **verify signature** (HMAC-SHA256 over the raw
  body keyed by `TOSS_WEBHOOK_SECRET`, `crypto.timingSafeEqual`); parse `{eventId, orderId, status}`;
  **dedupe** via `ProcessedWebhook(eventId)` — seen → 200 no-op; new → record + (`DONE`→`markPaid`).
  Invalid/missing sig → 401, no state change.

### Signature-verification model (honest seam)
TossPayments' precise webhook authentication varies by product, so — to avoid fabricating Toss
specifics — the webhook authenticates via a **provider-agnostic HMAC-SHA256 signature** keyed by
`TOSS_WEBHOOK_SECRET`, documented as the seam the production Toss adapter maps its real scheme to.
Hermetic + deterministic; fully unit-tested.

### Approval-gate decision (`order.confirm`) — deliberate, recorded
**Do NOT** gate the buyer-facing **test** payment with `requireApproval("order.confirm")`. Rationale
(mirrors ADR-0012 D3): the test payment is sandbox/reversible; **real-money irreversibility is already
gated** at env + adapter (live keys refused at boot and in the adapter; `toss.charge.live`/`toss.refund.live`
in `IRREVERSIBLE_ACTIONS`). `order.confirm`/`fulfillment.trigger` stay reserved for the **backstage
operator commit-to-production** step (out of web scope per ADR-0009). Gating the buyer's confirm would
block the hermetic E2E (no `pnpm approve` inside Playwright) and misread intent. Constraint **R3** does
not fire — checkout calls no `.charge(`/`.refund(`/`sendEmail(`/`fulfill(`; marking PAID is a store write.

## Order confirmation page (F014)
`/orders/[id]` — server component, `force-dynamic`, reads the order store by id. Renders: order id,
each item (template label, cover label, unit price `formatWon`), grand total, buyer name (display only),
status. `PAID` → "결제 완료" summary; `CREATED` → honest "결제 미완료/대기" (no phantom success — the
status-gated-copy lesson from ADR-0012); missing → `notFound()` (404).

## Testing (TDD per feature)
- **webhook.test.ts** (unit, F013): valid sig → PAID; bad/missing sig → rejected (no PAID); redelivery
  same `eventId` → no-op (`ProcessedWebhook`); `markPaid` idempotency; confirm's non-PAID branch leaves
  CREATED; amount is server-authoritative. Pure functions in `_lib/*`, injectable store/secret/provider — hermetic.
- **checkout-start.spec.ts** (F012): configure+add → `/cart` 결제하기 → `/checkout` buyer form → 결제하기 → lands on sandbox pay page showing the amount (order created CREATED).
- **checkout-success.spec.ts** (F013): … → 승인 → `/orders/[id]` shows PAID + items + total.
- **order-confirm.spec.ts** (F014): the PAID `/orders/[id]` view — items, cover, total, status PAID.
- **checkout-failed.spec.ts** (F015): … → 실패 → failed page; the order is **not** PAID.
- **checkout-cancel.spec.ts** (F016): … → 취소 → `/cart`; cart lines **preserved**.
- 375px no-overflow assertions on checkout pages (advances F035).

## Production seams (documented, not silently skipped — pattern: F003/F004/ADR-0012)
- **Persistence**: hermetic `globalThis` Order store + `ProcessedWebhook` set; production swaps a Prisma
  adapter behind the same `orderStore` surface (the `Order`/`OrderItem`/`Personalization`/`ProcessedWebhook`
  models already exist). Hermetic items key by `templateKey`; the Prisma adapter resolves `templateKey`→`Template.id`.
- **Payment UI**: hermetic sandbox pay page vs production real Toss SDK (impossible to stub in production).
- **Webhook auth**: provider-agnostic HMAC seam vs Toss's real scheme in the production adapter.

## Rejected alternatives
- *Inline confirm with a fake paymentKey, no redirect* (the custom-WRITTEN shape): the custom track only
  needed the success path; checkout needs all three Toss branches (F013/F015/F016) deterministically → a
  branchable sandbox pay page is the better model.
- *Real DB / real Toss round-trip in the verifiable path*: flaky, non-hermetic (ADR-0002/0010).
- *Trust client `amountWon`*: tampering risk — recompute from authoritative Template prices.
- *Gate the test confirm on `requireApproval`*: blocks the buyer E2E, misreads the action (ADR-0012 D3).
- *Build the real Toss browser SDK path now*: unverifiable hermetically → would be a silent half-done claim; documented as a seam instead.

---

## Design-review resolutions (folded in — 33-agent adversarial review, 19 skeptic-verified findings)
This section is the **authoritative implementation contract**; where it sharpens anything above, it wins.

### Webhook — raw-body HMAC (was the highest-confidence real bug; 3 findings)
- The webhook handler reads the **raw body first**: `const rawBody = await req.text();` — *before any JSON parse* (calling `req.json()` consumes the stream and would make the HMAC verify the wrong bytes → every webhook 401s).
- Signature arrives in a header (`x-toss-signature`). Verify via a **pure, injectable** fn:
  `verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean` →
  `crypto.timingSafeEqual(hmacSha256Hex(secret, rawBody), signature)` with length-guarded buffers (timingSafeEqual throws on length mismatch — guard first). Only **after** a valid signature, `JSON.parse(rawBody)`.
- Route secret: `process.env.TOSS_WEBHOOK_SECRET ?? (APP_ENV !== "production" ? "test_whsec_sandbox" : undefined)`. Missing secret in production → 401 (no state change). (Mirrors `customTossProvider`'s test-fallback-outside-production pattern; does **not** edit `env.ts` — making `TOSS_WEBHOOK_SECRET` boot-required in prod is a flagged follow-up, out of this track's file scope.)
- `webhook.test.ts` (hermetic; calls the pure fns directly with a fixed test secret, no `process.env` dependency): (a) valid sig + `status:"DONE"` → order PAID; (b) **one byte mutated** in the body → reject, no PAID; (c) missing/!match sig → 401, no PAID; (d) redelivery of the same `eventId` → no-op (`ProcessedWebhook`); (e) `markPaid` idempotency; (f) a non-`DONE` event leaves the order CREATED.

### Confirm — `paymentKey` source (2 findings)
- Client POSTs `{ orderId, paymentKey }` (matches the WRITTEN precedent). In the **sandbox**, `PaySandbox` generates a synthetic `paymentKey = "test_pk_" + orderId` (confirm doesn't validate it — only `provider.confirm()` consumes it); in **production** the real Toss success redirect supplies the real `paymentKey`.
- Route: `const { orderId, paymentKey } = untrusted(body).value`; load order (404 if missing); `amount = order.amountWon` (**server-authoritative**, never from the client); `provider.confirm({ paymentKey, orderId, amount })`; `PAID` → `markPaid(orderId, paymentKey)` → 200 `{status:"PAID", orderId}`; else → **402, order stays CREATED** (no PAID).

### Create — server-computed `payUrl`, PII-free `orderName` (3 findings)
- The route computes `payUrl` server-side (not the provider interface): outside production `payUrl = "/checkout/pay?order=" + orderId`; production → the real Toss flow (seam). Response: `{ orderId, payUrl }`. Client navigates to `payUrl`.
- `orderName` is built from **authoritative** template labels resolved server-side: `"<firstLabel> 외 N건"` (or just `<firstLabel>` for one line) — **never** `buyerName`/`childName`/email. `customerName` is **not** passed to the provider (it's unused by the Toss adapter and a PII footgun).

### `clearCart()` runs client-side after PAID (real bug)
- `clearCart()` is `window.localStorage`-only → it **must** be called from the client. `PaySandbox` calls `clearCart()` **then** `router.push("/orders/"+orderId)` only when confirm returns `PAID`. The confirm route returns **JSON** (never a 302 that would bypass client clear). On non-PAID, the cart is left intact (retry/cancel preserve it — F015/F016).

### `markPaid` contract (idempotent, no key overwrite)
`markPaid(orderId, paymentKey)`: order missing → return `undefined` (caller → 404); status `CREATED` → set `tossPaymentKey`, status `PAID`, return order; **already PAID** → no-op, **keep the first `paymentKey`** (defensive against replay; the schema's `tossPaymentKey @unique` forbids overwrite anyway), return existing. Both confirm and webhook call it; idempotency makes the confirm/webhook race harmless.

### Buyer validation (Korean errors, untrusted)
In `buildOrderFromCart`/route: `untrusted()` the body; `buyerName` trimmed, non-empty, ≤120 → else 400 `{errors:["보호자 이름을 입력해 주세요."]}`; `buyerEmail` matches `/^\S+@\S+\.\S+$/` → else 400 `{errors:["올바른 이메일을 입력해 주세요."]}`; empty cart → 400 `{errors:["장바구니가 비어 있습니다."]}`; an unknown/`null` `templateKey` → 400 `{errors:["알 수 없는 상품입니다."]}`. Neither name nor email is ever logged/traced.

### Domain-logic location — keep under `src/app/api/payments/_lib/` (NOT `src/lib/checkout.ts`)
The track's **explicit "Touch ONLY"** list grants the three app dirs + named tests and "import `src/lib/cart` + `src/lib/payments` only" — it does **not** grant a new `src/lib/*` file (unlike TRACK-CUSTOM, whose prompt explicitly granted `src/lib/customRequest.ts`). Co-locating in the private `_lib/` folder (excluded from routing, importable by any server module incl. `orders/[id]/page.tsx`) stays strictly in-scope. Reusing the order domain from a future mypage track is that track's concern (its real shared surface is the production Prisma seam). **Cross-cutting import allowed:** `untrusted` from `@/lib/guardrails` — a project-wide safety primitive required by AGENTS #6 (precedent: ADR-0012, content track). Server `_lib/*` modules use `node:crypto`/`globalThis` and are **never** imported by client components (which only `fetch()` + import `@/lib/cart`).

### Webhook dedupe atomicity (prod seam)
Hermetic store is single-process JS (no real race); `check-then-record` + idempotent `markPaid` is safe. The production Prisma seam uses the `ProcessedWebhook` `@id` unique constraint as the atomic gate (insert-first; on unique-violation → 200 no-op). Documented, not built here.

### Active-template revalidation (honest deferral, hermetic-safe)
`getTemplateByKey` rejects unknown keys (→400). It does **not** currently filter `active:false` (the `CatalogTemplate` view-model has no `active` field, and editing `templates.ts` to add it exceeds import-only scope). Hermetic mode has no inactive templates, so **no gate impact**; admin deactivation does not yet exist (existing PROGRESS TRACK-CAT follow-up #2). Enforcing `active` at checkout lands with the production Prisma seam + admin deactivation — recorded as a deferral, aligned with the existing follow-up, not silently skipped.

### F034 wording / R3 future-proofing (clarity, no code change)
No `requireApproval("order.confirm")` in checkout code: the test payment is sandbox/reversible; real-money irreversibility is gated at env (live keys refused at boot) + adapter (`toss.charge.live`/`toss.refund.live`). F034's "explicit verification" gate = the **worker≠checker review recorded in PROGRESS/DECISIONS** before `passes:true` (a process gate, not a code gate). R3 stays the automated backstop: any *future* `.charge(`/`.refund(` added to `/api/payments/*` would fire R3 unless gated — checkout itself calls none (marking PAID is a store write).

## Real Toss SDK contract (production seam detail — documented, not built/verified here)
For a future maintainer wiring production keys (`APP_ENV="production"`):
1. **Open the payment window**: `/checkout/pay` (or `/checkout` directly) loads `@tosspayments/payment-sdk`'s `loadTossPayments(clientKey)` and calls `requestPayment("카드", { amount, orderId, orderName, successUrl, failUrl })` — Toss hosts the window; the internal sandbox page is **not** rendered in production (guard below).
2. **Return routing**: on approval Toss redirects to `successUrl?paymentKey=…&orderId=…&amount=…`; the success page POSTs `{orderId, paymentKey}` to `/api/payments/confirm`. On failure → `failUrl` (`/checkout/failed`). On user cancel → back to `/cart`.
3. **Webhook auth**: Toss sends an `x-toss-signature` header; the production Toss adapter maps Toss's real scheme onto `verifyWebhookSignature(rawBody, sig, liveSecret)` and returns `{eventId, orderId, status}`.
4. **Wire point + impossibility guard**: `/checkout/pay` renders the sandbox **only** when `APP_ENV !== "production"`; in production it routes to the real Toss-hosted flow. Live keys already fail at boot (`env.ts`) and in the adapter (`toss.ts` `assertTestKey`), so a sandbox-in-production is impossible.
