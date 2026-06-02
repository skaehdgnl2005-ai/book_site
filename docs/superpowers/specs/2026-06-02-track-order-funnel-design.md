# TRACK-ORDER — Entry-line order funnel (F007–F011, F019)

> Design spec. Status: **approved-with-fixes** (adversarial multi-agent review, 2026-06-02:
> 0 blockers, 6 confirmed majors + minors folded in; 2 findings refuted). Stop point per the
> session mode: this spec → implementation plan, **no code** until the plan is approved.

## 1. Goal & scope

Build the **stateful pre-pay configuration funnel** for the entry product line, from a template
card to a populated cart, hermetically (no DB, no network in `pnpm check`/E2E). Features:

| ID | Feature | Own E2E |
|----|---------|---------|
| F007 | Template select starts the flow; the template's extra-var (0~1) is resolved for the form | `order-start.spec.ts` |
| F008 | Pre-pay minimal form: 아동 이름·성별 + template var (0~1), validated, clear errors | `order-form.spec.ts` |
| F009 | Optional child-photo upload with skip (`나중에 올리기`) that **never** blocks payment | `order-photo.spec.ts` |
| F010 | Cover selection (소프트 43,000 / 하드 49,000원) reflected in the price | `order-cover.spec.ts` |
| F019 | QR video add-on toggle (optional, default off; flagged on the order) | `order-qr-addon.spec.ts` |
| F011 | Cart: line total(s) + grand total in 원 | `cart.spec.ts` |

**Confirmed decisions** (brainstorm, 2026-06-02): (1) **client-side stepped wizard + a pure cart
model** in `src/lib/cart.ts`, DB-free until checkout; (2) each template's extra-var lives in the
**extended catalog loader**; (3) QR is **flag-only, +0원, named TODO constant** for price.

**Out of web scope** (named, not silently dropped): DB persistence / `Order`/`OrderItem`/`Asset`
row creation (F012+); **durable photo byte storage** (no object-storage backend wired — backstage
infra, like the AI pipeline); the **honorific derivation** (형아/누나) from protagonist+sibling gender
(backstage story generation); real QR pricing; a Nav cart indicator; a multi-book "add another"
buyer affordance.

## 2. Architecture & data flow

```
category card  ──/order/<key>──▶  src/app/order/[templateKey]/page.tsx   (SERVER component)
                                    • export const dynamic = "force-dynamic"  (catalog precedent)
                                    • const { templateKey } = await params   (Next 15: params is a Promise)
                                    • template = await getTemplateByKey(key)  (hermetic DB-or-mirror)
                                    • unknown key (absent from BOTH db and mirror) → notFound()
                                    • renders <OrderWizard template={...} />  (CLIENT)
                                          │
        ┌─────────────────────────────────┴───────────────────────────────────┐
   OrderWizard (client, useReducer)        steps drive cart.ts; persist to localStorage
   step 1 정보 → 2 사진 → 3 커버&옵션 → 4 확인 ──"장바구니에 담기"──▶ /cart
                                          │
                       src/app/cart/page.tsx — CLIENT reading subtree
                       • renders an empty shell on the server, populates on mount (no hydration mismatch)
                       • empty-cart view: "장바구니가 비어 있습니다" + CTA to categories
                       • 결제하기 CTA (wired later by TRACK-CHECKOUT)
```

- **No DB writes anywhere in this track.** Template resolution is server-side and hermetic (the
  catalog seed-mirror fallback); the funnel and cart are client-side.
- **Why `/cart` reads client-side:** the cart lives in `localStorage` (survives client navigation
  **and** the Toss redirect round-trip → enables F016). A server component cannot read it, so the
  cart-reading subtree is a **client component** that renders a deterministic empty shell on the
  server and hydrates from `loadCart()` on mount.

## 3. `src/lib/cart.ts` — the cross-track contract (TRACK-CHECKOUT imports the whole module)

Pure model + a thin `localStorage` adapter. **Layering: `cart.ts` (lib) has ZERO upward imports** —
no `payments`, and **no app-layer import** (the catalog loader lives in `src/app/_components`, so a
`src/lib` → `src/app` dependency would invert layers). Therefore `kind` is stored as a `string`
(typed as a `TemplateExtraVar` and validated in the app-layer order code), and **display formatting
is the UI's job** (the order/cart components reuse the catalog's `formatWon`); `cart.ts` returns
integer won only.

```ts
type CoverType = "SOFT" | "HARD";
type Gender   = "MALE" | "FEMALE";
// kind is a TemplateExtraVar value, but stored opaquely as string here (validated in the order layer);
// shape matches Personalization.extraVar (Json), which checkout maps to the DB.
type ExtraVarValue = { kind: string; value: string } | null;

type CartLine = {
  id: string;                 // client line id (deterministic; see note)
  templateKey: string;        // DURABLE handle — checkout resolves to Template.id
  templateLabel: string;      // display only (e.g. "돌")
  coverType: CoverType;
  unitPriceWon: number;       // 43000 | 49000 (from the template's soft/hard price)
  personalization: { childName: string; childGender: Gender; extraVar: ExtraVarValue };
  photo: { storageKey: string; contentType: string; byteSize: number } | null; // null = skipped; opaque, non-PII
};
type Cart = { lines: CartLine[]; qrVideoAddon: boolean }; // QR is ORDER-level (matches Order.qrVideoAddon)

export const QR_ADDON_WON = 0; // TODO(pricing): brief lists QR as a paid add-on but states no price; see DECISIONS ADR.

// pure
export function lineTotalWon(line: CartLine): number;          // = unitPriceWon
export function grandTotalWon(cart: Cart): number;             // Σ lineTotalWon + (qrVideoAddon ? QR_ADDON_WON : 0)
export function addLine(cart: Cart, line: CartLine): Cart;
export function removeLine(cart: Cart, id: string): Cart;
export function setQrAddon(cart: Cart, on: boolean): Cart;
export function clearCart(): Cart;                             // empties + persists; cleared ONLY after F013 PAID
export function orderName(cart: Cart): string;                 // "돌" | "돌 외 1건" → checkout orderName
export function toCheckoutSummary(cart: Cart): { amountWon: number; orderName: string; lineCount: number };
// client persistence (SSR-safe: returns empty cart on the server)
export function loadCart(): Cart;
export function saveCart(cart: Cart): void;
```

- **`id` determinism:** `Date.now()`/`Math.random()` are fine in app code, but for stable E2E we
  derive line ids from a monotonic counter persisted in the cart, not a timestamp.
- **`toCheckoutSummary.amountWon` is display-derived and untrusted** — see §8 handoff note G.

## 4. Funnel steps ↔ features ↔ E2E

Stepped wizard inside `/order/[templateKey]`; one panel visible at a time (`useReducer`, `step`
index), 뒤로/다음 controls. A running line-price summary is visible from step 3.

| Step | Feature(s) | What it does | E2E assertions |
|------|-----------|--------------|----------------|
| Start | **F007** | card → `/order/birth` lands on step 1 with the **correct** extra-var field per template (생년월일 for `birth`; **none** for `hundred_days`/`first_birthday`/`first_steps`) | right field present/absent per template; invalid key → 404 |
| 1 정보 | **F008** | 이름·성별 (+ extra-var if any), validated; errors block 다음 | empty/invalid required field blocks + shows a clear error; valid advances |
| 2 사진 | **F009** | `지금 올리기` / `건너뛰기`; skip → step 3; upload → "사진 첨부됨" | **skip never blocks**; upload accepted; **no filename/child-name in DOM/URL**; bad file → friendly error, still skippable |
| 3 커버&옵션 | **F010** + **F019** | 소프트/하드 radios (live price 43,000/49,000) + QR toggle (default **off**) | price updates per cover; QR default off; QR line shows "기본 미포함 · 요금 추후 안내" when on |
| 4 확인 | **F011** | review → "장바구니에 담기" → `/cart` shows line + grand total | line (template/cover/personalization summary) + correct grand total in 원 |

Each step + `/cart` carries the canonical **375px no-overflow** assertion, identical in shape to
`category-anniversary.spec.ts` (`scrollWidth > innerWidth + 1` → `expect(false)`).

## 5. extraVar resolution (F007) — extend the catalog loader end-to-end

`extraVar` is template data, so it belongs in the one catalog SoR — but it must be threaded through
**every** branch or a DB-configured deploy silently drops it (3 review critics confirmed this; the
hermetic gate cannot catch it because CI runs only the seed-mirror branch). Changes to
[catalog/templates.ts](../../../src/app/_components/catalog/templates.ts):

1. **Re-export** the `TemplateExtraVar` union (single declaration; the app-layer order code —
   `personalization.ts` and the wizard — keys off it so a missing case is a compile error; `cart.ts`
   stays decoupled and stores `kind` as a string).
2. Add `extraVar: TemplateExtraVar` to **`CatalogTemplate`**.
3. Add `extraVar` to **`TemplateDelegate.findMany`'s return type** AND map `r.extraVar`
   (with `?? "NONE"` fallback) in **`readTemplatesFromDb`** — the previously-omitted DB seam.
4. Add `extraVar` to **every seed-mirror (`CATALOG`) row**, matching `prisma/seed.ts ENTRY_TEMPLATES`
   (birth=BIRTHDATE, hundred_days=NONE, first_birthday=NONE, birthday=AGE, admission=SCHOOL,
   first_steps=NONE, first_word=FIRST_WORD, became_sibling=SIBLING_GENDER).
5. Add **`getTemplateByKey(key): Promise<CatalogTemplate | null>`** that mirrors
   `getTemplatesByCategory`'s fallback exactly: optional DB read inside `try/catch` with dynamic
   `import("@/lib/db")`; on null row, empty result, **or any throw**, scan the in-file `CATALOG`
   mirror; return `null` only when the key is absent from the mirror too (route page maps `null`→
   `notFound()`).
6. **Drift-guard unit test** (`tests/unit/catalog.test.ts`, extended): import `ENTRY_TEMPLATES`
   from `prisma/seed.ts` (import-safe — its runner is gated behind `import.meta.url === argv[1]`)
   and assert, for every key, mirror `{label, extraVar, prices, sortOrder}` === the seed row, **plus
   full enum-set equality** (a new `TemplateExtraVar` member added to seed but missing from the
   mirror fails). The DB-branch fake-client test gains an `extraVar` field so the mapper is guarded.

## 6. Validation (F008) — pure, untrusted-wrapped

`src/app/_components/order/personalization.ts` — pure functions, unit-tested. All buyer input
wrapped with `untrusted()` at the boundary; security/validation never trusts raw input.

- 이름: trimmed, non-empty, length-capped.
- 성별: ∈ `{MALE, FEMALE}`.
- extra-var: required **iff** `template.extraVar !== "NONE"`, with per-kind rules —
  - `BIRTHDATE` = a valid date (not in the future),
  - `AGE` = positive integer (1–12),
  - `SCHOOL` / `FIRST_WORD` = non-empty, length-capped string,
  - `SIBLING_GENDER` = ∈ `{MALE, FEMALE}`.
- **`became_sibling` has two gender inputs** (childGender + SIBLING_GENDER). They get **distinct,
  unambiguous labels** so they can't be swapped: childGender = "우리 아이(형·누나가 될 아이) 성별",
  SIBLING_GENDER = "새로 태어난 동생의 성별". `order-form.spec.ts` asserts both render with their
  distinct labels for this template. (Honorific derivation from the pair is backstage / out of scope.)

## 7. Photo (F009) & QR (F019)

**Photo.** A server action builds `UploadInput` from the multipart `File`
(`contentType = file.type`, `bytes = new Uint8Array(await file.arrayBuffer())`), calls
`receiveUpload(untrusted)` → `storeAsset("CHILD_PHOTO")`, and returns the opaque descriptor
`{storageKey, contentType, byteSize}` held in the cart line. A `storeAsset` throw (unsupported type
/ empty bytes) is caught and surfaced as a **typed validation error** ("지원하지 않는 형식입니다") — never
a 500, and **never blocks the `건너뛰기` path**.

- This makes F009's E2E genuinely exercise the F029 asset path (its declared `e2e_via`), and
  satisfies F009 step 3 ("stores an access-controlled Asset, not inline") in the **descriptor**
  sense (opaque key, no inline PII).
- **Honest limitation (documented, not silent):** `storeAsset` is pure — no object-storage PUT, no
  `Asset` DB row. Durable byte persistence is backstage infra **not yet wired**; the **durable
  upload path is mypage (F017)**. F009's evidence must state precisely what is persisted (the
  access-controlled descriptor) vs deferred (durable bytes + `Asset` row), so `passes:true` is not
  false-completion. Recorded in DECISIONS.md.
- **E2E** uses `setInputFiles({ name, mimeType: "image/png", buffer })` with a small non-empty
  buffer (or a committed tiny PNG fixture) so the allowlist + non-empty checks pass deterministically;
  asserts the filename and entered child-name never appear in the DOM/URL/any asset attribute.

**QR.** The toggle sets `cart.qrVideoAddon`; default off. Price comes from the single named
constant `QR_ADDON_WON = 0` (not a magic 0), so wiring a real price later is one edit and
`cart.spec.ts` references the constant. The cart/review present QR honestly as
"QR 영상 옵션 · 기본 미포함 · 요금 추후 안내" (not "included"); `order-qr-addon.spec.ts` asserts that
disclosure and the default-off state. The +0 deferral + brief-deviation are recorded in DECISIONS.md.

## 8. Handoff to TRACK-CHECKOUT (contract notes — F012/F013/F016)

These resolve cross-track findings now so the next session inherits no surprises:

- **(E) Cart-clear timing:** the cart is cleared via `clearCart()` **only after F013 PAID
  confirmation**, never on checkout start — this is what makes F016 (cancel at Toss → return to
  `/cart`, items preserved) and F012 (redirect) mutually consistent.
- **(F) Buyer identity:** the funnel collects the **child** (`childName`/`childGender`/extra-var)
  only. `Order.buyerName`/`buyerEmail` are required and are **TRACK-CHECKOUT's** responsibility — a
  buyer-identity step on `/checkout` before `createCheckout`, mapping `buyerName` →
  `CreatePaymentInput.customerName` + `Order.buyerName`, `buyerEmail` → `Order.buyerEmail`. Do **not**
  push buyer fields into `cart.ts`.
- **(G) Price is recomputed server-side:** `grandTotalWon`/`toCheckoutSummary.amountWon` are
  **display-derived from client `localStorage` and therefore untrusted**. TRACK-CHECKOUT MUST
  recompute the order amount server-side from authoritative `Template` prices
  (per line: `coverType` → soft/hardPriceWon from the DB) and persist that as `Order.amountWon`;
  the `confirm` tamper-guard then compares against a trusted figure. `cart.ts`'s pure pricing fns
  may be reused server-side so the numbers agree, but the trusted source is the DB, not the cart.
- **(H) templateKey → templateId:** the cart stores `templateKey` (durable slug), not
  `Template.id`. F012 resolves key → `Template.id` and revalidates `active`/price at order-creation
  time; this **requires a seeded DB at checkout** (the hermetic seed-mirror has no ids).

## 9. Styling & constraints

Atelier Sans via co-located CSS Modules (the F005 pattern), consuming `:root` tokens only — warm
neutrals + the single ink-navy accent, **1px hairlines (R6: no `box-shadow`)**, radius 0, **no pure
`#fff`/`#000` (R7)**. 명조 (`--font-serif-ko`) **only** for the book/template title echoed in the
wizard; all labels, prices, inputs, and controls are grotesk. Reuses the `_components` kit
(`Nav`/`Footer`/`CtaLink`/`SectionHeader`) import-only; does **not** touch `globals.css` or the
shared kit.

## 10. Testing & Definition of Done

- **Per-feature E2E** (table §4) green + `pnpm check` green (lint/type/unit/constraints R1–R8) →
  `passes:true` with dated evidence. `cart.spec.ts` is F011's own E2E (no `e2e_via`).
- **`tests/unit/cart.test.ts`** (new, unowned by siblings): the pure model — `grandTotalWon`,
  `orderName` ("외 N건"), `removeLine`, `clearCart`, `toCheckoutSummary` — covered for **≥2 lines**,
  so the multi-line model is verified even though the buyer flow is single-line (a multi-book buyer
  entry point is a named follow-up, not built here). Plus the personalization validator cases.
- **`/cart` empty state** asserted on direct navigation (not only add-then-view).
- **F035** is **advanced, not completed**: this track adds the order + `/cart` 375px specs and
  updates F035's *evidence* to enumerate them, but leaves F035 `state:"in_progress"` until
  TRACK-CHECKOUT adds the checkout 375px coverage. Do **not** flip F035 to `passing`.
- **Worker≠checker** adversarial review (F042 protocol) before any `passes:true`.

## 11. Decisions & scope deviations (to ratify in DECISIONS.md / PROGRESS.md when the track lands)

1. **Catalog file edit:** extending `src/app/_components/catalog/templates.ts` (a merged TRACK-CAT
   file; no concurrent writer) exceeds the literal "touch only `src/app/order/`" contract — ratified
   like ADR-0010 (F003's `approve.mjs` precedent).
2. **`/cart` ownership:** the order track creates `src/app/cart/` because the checkout features
   reference `/cart` explicitly (F012 "From cart…", F016 "Return to /cart").
3. **New tests:** `tests/unit/cart.test.ts` + extended `tests/unit/catalog.test.ts`.
4. **QR +0원:** brief lists QR as a paid add-on but states no price and the schema has no price
   field; shipped as a flagged `QR_ADDON_WON = 0` constant, presented honestly, price deferred.
5. **Child PII in `localStorage`:** the cart holds `childName`/`childGender`/`extraVar` (sensitive
   child PII) device-locally. This is within the brief's PII rules (the forbidden surfaces are
   logs/traces/E2E fixtures, not the buyer's own device); the photo descriptor is non-PII by
   construction. The cart is cleared after checkout success (§8 E). E2E asserts no child-name /
   photo-filename in DOM/URL/server logs.

## 12. Review provenance

Adversarial review 2026-06-02 (`track-order-design-critique`, 32 agents, 6 dimensions, refute-by-
default verification): **0 blockers**, 6 confirmed majors (extraVar-on-DB-seam ×3, getTemplateByKey
fallback, photo-upload robustness, cart-clear timing) and 12 confirmed/partial minors — all folded
in above. 2 refuted: "toCheckoutSummary strands per-line data" (checkout imports the whole `cart`
module → `Cart.lines` is reachable) and "pre-pay photo needs `pii.store` approval" (pre-pay persists
nothing durable — already stated). The "blocker" on buyer identity was downgraded to a handoff note
(§8 F) on verification — it is TRACK-CHECKOUT's responsibility, not a defect in this design.
