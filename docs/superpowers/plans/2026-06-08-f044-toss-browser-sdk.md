# F044 — 실 TossPayments 브라우저 SDK 결제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** prod 에서 실제 TossPayments(테스트) 브라우저 결제창을 열고, 성공 콜백이 기존 서버 confirm 으로 주문을 PAID 로 확정하게 한다(503 게이트 제거).

**Architecture:** prod/test 단일 클라이언트 경로 — 클라이언트는 항상 `loadTossPayments→requestPayment` 를 호출하고, 헤르메틱 E2E 는 `page.addInitScript` 로 `window.TossPayments` 전역을 미리 심어 실 클라이언트 경로를 그대로 실행한다(앱에 테스트 훅 0줄, CDN fetch 0). 서버 측 결제 처리(`confirmPayment`/`orderRepo`/금액 재계산)는 재사용. sandbox `/checkout/pay` 는 제거.

**Tech Stack:** Next.js 15(App Router) · React 19 · TypeScript 5 · `@tosspayments/tosspayments-sdk` v2 · Playwright · vitest.

**Spec:** `docs/superpowers/specs/2026-06-08-f044-toss-browser-sdk-design.md` (ADR-0019 at completion).

---

## 검증된 사실 (계획의 근거)

- SDK `@tosspayments/tosspayments-sdk@2.7.x`(설치 시점 최신; 어드버서리얼 리뷰가 2.7.0 tarball 로 실측·tsc 컴파일 검증) 는
  thin 로더: `loadTossPayments(clientKey)` 가 `window.TossPayments` 존재 시 **CDN fetch 없이 즉시 반환**
  (`if (getNamespace(name) != null) return resolve(...)`, `SCRIPT_URL='https://js.tosspayments.com/v2/standard'`).
  → `addInitScript` 전역 주입이 견고한 목. (param/타입 형태는 2.5↔2.7 동일.)
- SDK 타입: `ANONYMOUS = "@@ANONYMOUS"` export; `payment({customerKey})`; `requestPayment({method:"CARD",
  amount:{value,currency}, orderId, orderName, successUrl?, failUrl?})` (`card` 중첩 불필요).
- vitest 는 `@/` 별칭 **없음**(`vitest.config.ts` = `tests/unit/**`만, alias 미설정). 따라서 `@/` 를 쓰는 **create 라우트는
  유닛테스트 불가 → E2E 로 검증**. `confirmPayment`(`checkout.ts`, 상대경로)는 유닛테스트 가능(`webhook.test.ts`).
- `confirmProvider` 비-prod = sandbox(transport DONE), prod = `tossFromEnv`. 헤르메틱 confirm 은 항상 PAID.
- order id: 헤르메틱 `ord_XXXX`([orders.ts:78](../../../src/app/api/payments/_lib/orders.ts#L78)), prod `randomUUID()`([orders.ts:301](../../../src/app/api/payments/_lib/orders.ts#L301)) — 둘 다 Toss 6–64 `[A-Za-z0-9-_]` 충족.
- 영향 스펙 7개: `checkout-start`(F012)·`checkout-success`(F013)·`order-confirm`(F014)·`checkout-failed`(F015)·
  `checkout-cancel`(F016)·`mypage-photo`(F017)·`mypage-finish`(F018) — 모두 `/checkout/pay` 경유.
- 거버넌스: `pnpm check` 는 E2E 미포함(lint+typecheck+unit+constraints). R9 는 git HEAD 대비 append-only(새 id 추가 OK,
  기존 항목은 state/passes/evidence 만 가변, 스펙 파일명 보존 시 `verification` 불변). R8: 자체 E2E 보유 피처는 면제.

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `src/app/checkout/_lib/tossClient.ts` | SDK 경계 1함수(`requestTossPayment`) | 신규 |
| `src/app/checkout/success/page.tsx` | Toss success 콜백 → 서버 confirm → 분기 | 신규 |
| `src/app/checkout/success/ClearCartRedirect.tsx` | PAID 시 clearCart + /orders 이동(client) | 신규 |
| `src/app/api/payments/create/route.ts` | 503 제거 + Checkout 공개필드 반환 | 수정 |
| `src/app/checkout/CheckoutView.tsx` | requestTossPayment 호출 | 수정 |
| `src/app/checkout/failed/page.tsx` | cancel code → /cart 리다이렉트 | 수정 |
| `src/app/api/payments/_lib/checkout.ts` | `confirmPayment` PAID 단락 | 수정 |
| `src/app/checkout/pay/page.tsx`, `.../PaySandbox.tsx` | sandbox stand-in | 삭제 |
| `tests/e2e/_helpers/tossMock.ts` | addInitScript 목 + 공통 헬퍼 | 신규 |
| `tests/e2e/checkout-toss-sdk.spec.ts` | F044 자체 E2E | 신규 |
| `tests/e2e/checkout-{start,success,failed,cancel}.spec.ts`, `order-confirm.spec.ts`, `mypage-{photo,finish}.spec.ts` | 헬퍼로 이전 | 수정 |
| `tests/unit/webhook.test.ts` | confirmPayment 단락 테스트 | 수정 |
| `feature_list.json` | F044/F045 추가 + F012–F018 evidence | 수정 |
| `package.json` | SDK 의존성 | 수정 |

---

## Task 0: feature_list 에 F044/F045 등록 + attempt 시작

**Files:** Modify: `feature_list.json`

- [ ] **Step 1: `feature_list.json` 의 `features` 배열 끝에 F044, F045 추가** (다른 항목/최상위 키는 절대 변경 금지 — R9)

```json
{
  "id": "F044",
  "category": "checkout",
  "track": "product",
  "priority": 1,
  "description": "실 TossPayments 브라우저 SDK 로 결제창을 열고(prod), 성공 콜백이 주문을 PAID 로 확정",
  "steps": [
    "/checkout 에서 결제하기",
    "loadTossPayments→requestPayment 로 Toss 결제창 오픈(prod: 실제 호스티드 창)",
    "성공 콜백 → /api/payments/confirm(서버) → PAID → /orders/[id]"
  ],
  "verification": "pnpm test:e2e -- checkout-toss-sdk.spec.ts",
  "state": "in_progress",
  "passes": false,
  "evidence": ""
},
{
  "id": "F045",
  "category": "checkout",
  "track": "product",
  "priority": 2,
  "description": "Toss webhook 실 서명 스킴 매핑 + TOSS_WEBHOOK_SECRET boot 검증(결제 정합성 안전망)",
  "steps": [
    "Toss 실제 webhook 서명 스킴을 verifyWebhookSignature 에 매핑",
    "TOSS_WEBHOOK_SECRET 부재 시 prod boot 거부",
    "리다이렉트 전 이탈 주문도 webhook 으로 PAID 도달"
  ],
  "verification": "pnpm test -- webhook.test.ts",
  "state": "not_started",
  "passes": false,
  "evidence": ""
}
```

- [ ] **Step 2: 제약 통과 확인**

Run: `pnpm constraints`
Expected: `"ok": true, "count": 0` — R4(F044/F045 passes:false ↔ 비-passing) OK, R9(새 id 추가 허용) OK.

- [ ] **Step 3: attempt 기록**

Run: `pnpm attempt F044`
Expected: F044 attempt 1 기록(exit 0).

- [ ] **Step 4: Commit**

```bash
git add feature_list.json
git commit -m "feat(F044): register F044 (Toss browser SDK) + F045 (webhook seam) in feature_list"
```

---

## Task 1: Toss 브라우저 SDK 설치

**Files:** Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: 설치**

Run: `pnpm add @tosspayments/tosspayments-sdk`
Expected: `dependencies` 에 `@tosspayments/tosspayments-sdk` 추가(설치 시점 최신 — 현재 2.7.x; param/타입은 2.5↔2.7 동일).

- [ ] **Step 2: 로더 메커니즘 spike(필수 — 목 전략 전제 재확인)**

Run: `node -e "const p=require('@tosspayments/tosspayments-sdk/package.json'); console.log(p.version, p.main, p.module)"`
그리고 `node_modules/@tosspayments/tosspayments-sdk/dist/index.esm.js` 에서 `js.tosspayments.com` 문자열과
`window.TossPayments` 존재-시-단락 로직을 확인(Grep). 만약 (a) CDN 주입이 아니거나 (b) 기존 전역을 재사용하지 않으면
**중단하고 에스컬레이션**(설계 §7a 전제 붕괴 — `page.route` fulfill 방식으로 전환 검토).
Expected: src 가 `https://js.tosspayments.com/v2/standard` 를 주입하고 기존 `window.TossPayments` 를 재사용함.

- [ ] **Step 3: typecheck 확인**

Run: `pnpm typecheck`
Expected: PASS(아직 SDK 미사용).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(F044): add @tosspayments/tosspayments-sdk (browser SDK)"
```

---

## Task 2: confirmPayment 멱등 PAID 단락 (유닛 TDD)

이미 PAID 인 주문에 confirm 이 재호출되면 실 Toss 는 처리완료 paymentKey 를 거부(402)한다 — success 페이지 reload
및 webhook-우선 레이스 안전을 위해 `provider.confirm` 호출 전에 단락한다.

**Files:**
- Modify: `src/app/api/payments/_lib/checkout.ts:134-149`
- Test: `tests/unit/webhook.test.ts` (describe "confirmPayment")

- [ ] **Step 1: 실패 테스트 추가** — `tests/unit/webhook.test.ts` 의 `describe("confirmPayment", ...)` 블록 안 끝에 추가

```ts
  it("short-circuits an already-PAID order without re-calling the gateway (reload / webhook-first safe)", async () => {
    const { repo, order } = await paidOrder();
    await repo.markPaid(order.id, "pk_first"); // already PAID (e.g. the webhook beat the redirect)
    const captured: { input?: ConfirmInput } = {};
    const res = await confirmPayment(repo, stubProvider("FAILED", captured), {
      orderId: order.id,
      paymentKey: "pk_second",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PAID");
    expect(captured.input).toBeUndefined(); // gateway NOT re-called (real Toss would reject the used key)
    expect((await repo.get(order.id))?.tossPaymentKey).toBe("pk_first"); // first key preserved
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test -- webhook.test.ts`
Expected: FAIL — 현재는 PAID 여도 `provider.confirm` 호출 → `captured.input` 정의됨 + FAILED→402.

- [ ] **Step 3: 단락 구현** — `checkout.ts` 의 `confirmPayment`, `if (!order) return 404` 다음 줄에 삽입

`checkout.ts:141-143` 현재:
```ts
  const order = await repo.get(orderId);
  if (!order) return { status: 404, body: { errors: ["주문을 찾을 수 없습니다."] } };
  if (!paymentKey) return { status: 400, body: { errors: ["결제 정보가 없습니다."] } };
```
다음으로 변경(404 와 paymentKey 검사 사이에 단락 추가):
```ts
  const order = await repo.get(orderId);
  if (!order) return { status: 404, body: { errors: ["주문을 찾을 수 없습니다."] } };
  // Idempotent: an already-PAID order is settled — do NOT re-call the gateway (the real Toss
  // /confirm rejects an already-used paymentKey → 402). Makes the success-page reload and a
  // webhook-first race safe. The stored (first) paymentKey is preserved.
  if (order.status === "PAID") return { status: 200, body: { status: "PAID", orderId: order.id } };
  if (!paymentKey) return { status: 400, body: { errors: ["결제 정보가 없습니다."] } };
```

- [ ] **Step 4: 테스트 통과 + 전체 게이트 확인**

Run: `pnpm test -- webhook.test.ts` → PASS
Run: `pnpm check` → green(lint+typecheck+unit+constraints R1–R9).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/payments/_lib/checkout.ts tests/unit/webhook.test.ts
git commit -m "fix(F044): confirmPayment short-circuits already-PAID orders (reload/webhook-first safe)"
```

---

## Task 3: SDK 경계 함수 `tossClient.ts`

브라우저 전용 SDK 를 동적 import(SSR 안전)하는 한 함수로 격리. CheckoutView 가 호출.

**Files:** Create: `src/app/checkout/_lib/tossClient.ts`

- [ ] **Step 1: 파일 작성**

```ts
/**
 * F044 — the TossPayments browser SDK boundary. ONE function so the SDK call site is isolated
 * (and E2E can stand it in by planting window.TossPayments via addInitScript). Dynamic import
 * keeps the browser-only SDK out of the SSR module graph. amount MUST be the server-issued value
 * (from /api/payments/create); it must equal the confirm-time server amount or Toss rejects it.
 */
export interface TossCheckout {
  orderId: string;
  clientKey: string;
  amount: number; // KRW won (integer) — server-issued, forwarded as-is
  orderName: string;
  successUrl: string;
  failUrl: string;
}

export async function requestTossPayment(checkout: TossCheckout): Promise<void> {
  const { loadTossPayments, ANONYMOUS } = await import("@tosspayments/tosspayments-sdk");
  const toss = await loadTossPayments(checkout.clientKey);
  const payment = toss.payment({ customerKey: ANONYMOUS }); // 게스트 결제(buyer 인증 없음)
  await payment.requestPayment({
    method: "CARD",
    amount: { currency: "KRW", value: checkout.amount },
    orderId: checkout.orderId,
    orderName: checkout.orderName,
    successUrl: checkout.successUrl,
    failUrl: checkout.failUrl,
  });
}
```

> 유닛테스트 없음(브라우저 SDK 경계). F044 E2E(Task 6/7)가 실제 호출·인자를 검증한다 — 의도된 선택(설계 §5).

- [ ] **Step 2: typecheck 확인**

Run: `pnpm typecheck`
Expected: PASS. (실패 시 설치 SDK 의 `requestPayment` 타입에 맞춰 인자 형태 조정 — 설계 §7b.)

- [ ] **Step 3: Commit**

```bash
git add src/app/checkout/_lib/tossClient.ts
git commit -m "feat(F044): add tossClient requestTossPayment (browser SDK boundary)"
```

---

## Task 4: success 콜백 페이지 + clearCart 리다이렉트

Toss success 리다이렉트(`?paymentKey&orderId&amount`)를 받아 서버에서 confirm(금액은 서버 보유분; amount 쿼리 무시).
PAID 면 client 자식이 clearCart 후 `/orders/[id]` 로 이동, 아니면 서버 redirect → failed.

**Files:**
- Create: `src/app/checkout/success/page.tsx`
- Create: `src/app/checkout/success/ClearCartRedirect.tsx`

- [ ] **Step 1: server page 작성** — `src/app/checkout/success/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { confirmPayment, checkoutProvider } from "../../api/payments/_lib/checkout";
import { orderRepo } from "../../api/payments/_lib/orders";
import { ClearCartRedirect } from "./ClearCartRedirect";

export const dynamic = "force-dynamic";

/**
 * F044 — TossPayments success redirect lands here with ?paymentKey&orderId(&amount). We settle
 * server-side with the SERVER-held amount (the `amount` query is IGNORED — anti-tamper). confirmPayment
 * is idempotent (already-PAID short-circuits), so a reload / webhook-first is safe. On PAID a tiny client
 * child clears the localStorage cart and navigates to the canonical /orders/[id]; otherwise → failed.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ paymentKey?: string; orderId?: string }>;
}) {
  const { paymentKey, orderId } = await searchParams;
  const res = await confirmPayment(orderRepo(), checkoutProvider(), { orderId, paymentKey });
  if (res.status !== 200 || res.body.status !== "PAID") {
    redirect("/checkout/failed?code=CONFIRM_FAILED");
  }
  return <ClearCartRedirect orderId={String(orderId)} />;
}
```

- [ ] **Step 2: client 자식 작성** — `src/app/checkout/success/ClearCartRedirect.tsx`

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearCart } from "@/lib/cart";
import { Nav } from "../../_components/Nav";
import { Footer } from "../../_components/Footer";

/** Runs ONLY after a server-confirmed PAID: empties the cart (localStorage) then goes to /orders/[id]. */
export function ClearCartRedirect({ orderId }: { orderId: string }) {
  const router = useRouter();
  useEffect(() => {
    clearCart(); // client-side; preserves the cart on cancel/failure (which never reach here)
    router.replace(`/orders/${orderId}`);
  }, [orderId, router]);
  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="success-title">
          <p className="eyebrow">결제 완료</p>
          <h1 className="hero__title" id="success-title">주문을 확인하고 있어요…</h1>
        </section>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 3: typecheck 확인**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/checkout/success/
git commit -m "feat(F044): /checkout/success — server confirm → clearCart → /orders/[id]"
```

---

## Task 5: failed 페이지 — 취소 코드 → /cart (F016 계약 보존)

Toss v2 는 취소도 failUrl 로 보낸다(code=`PAY_PROCESS_CANCELED`). 이때 `/cart` 로 리다이렉트해 F016 의 동결 steps
("Return to /cart")를 정확히 보존한다. 그 외 실패는 기존 메시지.

**Files:** Modify: `src/app/checkout/failed/page.tsx`

- [ ] **Step 1: 페이지를 async + searchParams 로 변경** — 상단 import 에 `redirect` 추가, 컴포넌트 시그니처/본문 교체

`failed/page.tsx:1-13` 의 import + 함수 시작을 다음으로 변경:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "../../_components/Nav";
import { Footer } from "../../_components/Footer";
import styles from "../checkout.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "결제 미완료 · 그림책 제작소" };

/**
 * F015 — a Toss failure. Honest copy: NOT paid, the cart is preserved, so the buyer can retry.
 * F016 — a user CANCEL at Toss arrives here with code=PAY_PROCESS_CANCELED; we send them back to
 * /cart (the cart is intact — clearCart runs only after PAID), preserving the F016 contract.
 */
export default async function CheckoutFailedPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (code === "PAY_PROCESS_CANCELED") redirect("/cart");
  return (
```
(이하 기존 JSX `<> <Nav /> ... </>` 본문은 그대로 유지.)

- [ ] **Step 2: typecheck 확인**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/checkout/failed/page.tsx
git commit -m "feat(F044): failed page redirects PAY_PROCESS_CANCELED → /cart (F016 contract)"
```

---

## Task 6: E2E 목 헬퍼 + F044 스펙 (RED 확인)

**Files:**
- Create: `tests/e2e/_helpers/tossMock.ts`
- Create: `tests/e2e/checkout-toss-sdk.spec.ts`

- [ ] **Step 1: 목 헬퍼 작성** — `tests/e2e/_helpers/tossMock.ts`

```ts
import { type Page, expect } from "@playwright/test";

export type TossOutcome = "success" | "fail" | "cancel" | "abandon";

/**
 * Plant a hermetic stand-in for the TossPayments browser SDK BEFORE any page script runs.
 * loadTossPayments (v2 thin loader) short-circuits when window.TossPayments already exists, so the
 * REAL client path (loadTossPayments → payment → requestPayment) runs with ZERO app test-hooks and
 * NO CDN fetch. The CDN route is aborted as a backstop (a missing global fails fast, never the network).
 */
export async function installTossMock(page: Page, outcome: TossOutcome): Promise<void> {
  await page.route("https://js.tosspayments.com/**", (route) => route.abort());
  await page.addInitScript((o: string) => {
    const w = window as unknown as Record<string, unknown>;
    w.TossPayments = (clientKey: string) => {
      w.__TOSS_CLIENT_KEY__ = clientKey;
      return {
        payment: () => ({
          requestPayment: async (req: {
            method: string;
            amount: { value: number; currency: string };
            orderId: string;
            orderName: string;
            successUrl: string;
            failUrl: string;
          }) => {
            w.__TOSS_REQUEST__ = req;
            w.__TOSS_LAST_ORDER_ID__ = req.orderId;
            if (o === "success")
              location.assign(`${req.successUrl}?paymentKey=test_pk_${req.orderId}&orderId=${req.orderId}&amount=${req.amount.value}`);
            else if (o === "fail")
              location.assign(`${req.failUrl}?code=PAY_PROCESS_ABORTED&message=${encodeURIComponent("결제에 실패했습니다")}&orderId=${req.orderId}`);
            else if (o === "cancel")
              location.assign(`${req.failUrl}?code=PAY_PROCESS_CANCELED&message=${encodeURIComponent("결제를 취소했습니다")}`);
            // "abandon": no redirect — simulates the buyer closing the window (order stays CREATED).
          },
        }),
      };
    };
  }, outcome);
}

/** Add one 탄생 book to the cart (photo skipped). Mirrors the legacy per-spec helper. */
export async function addBirthToCart(page: Page, opts: { coverHard?: boolean; qrOn?: boolean } = {}): Promise<void> {
  await page.goto("/order/birth");
  await page.getByTestId("order-name-input").fill("도윤");
  await page.getByTestId("order-gender-male").check();
  await page.getByTestId("order-extravar-input").fill("2024-01-15");
  await page.getByTestId("order-next").click(); // info -> photo
  await page.getByTestId("order-photo-skip").click(); // SKIP photo -> cover
  if (opts.coverHard) await page.getByTestId("order-cover-hard").check();
  if (opts.qrOn) await page.getByTestId("order-qr-toggle").check();
  await page.getByTestId("order-next").click(); // cover -> review
  await page.getByTestId("order-add-to-cart").click();
  await page.waitForURL("**/cart");
}

async function fillBuyer(page: Page): Promise<void> {
  await page.getByTestId("checkout-buyer-name").fill("김부모");
  await page.getByTestId("checkout-buyer-email").fill("parent@example.com");
}

/** From a populated /cart: install the SDK mock with `outcome`, walk checkout, trigger requestPayment. */
export async function payFromCart(page: Page, outcome: TossOutcome): Promise<void> {
  await installTossMock(page, outcome);
  await page.getByTestId("cart-checkout").click();
  await page.waitForURL("**/checkout");
  await fillBuyer(page);
  await page.getByTestId("checkout-pay").click();
}

/** Build a cart + pay successfully; returns the PAID orderId (from the /orders/[id] landing). */
export async function completePaidOrder(page: Page, opts: { coverHard?: boolean; qrOn?: boolean } = {}): Promise<string> {
  await addBirthToCart(page, opts);
  await payFromCart(page, "success");
  await page.waitForURL(/\/orders\/ord_/);
  return new URL(page.url()).pathname.split("/").pop() as string;
}

/** Build a 2-book cart (QR on book 2 if qrOn) + pay successfully; returns the PAID orderId. */
export async function completePaidTwoBookOrder(page: Page, opts: { qrOn?: boolean } = {}): Promise<string> {
  await addBirthToCart(page);
  await addBirthToCart(page, { qrOn: opts.qrOn }); // QR is order-level (last add-to-cart wins)
  await payFromCart(page, "success");
  await page.waitForURL(/\/orders\/ord_/);
  return new URL(page.url()).pathname.split("/").pop() as string;
}

/** Pay then FAIL; returns the orderId carried on the failUrl query. */
export async function payAndFail(page: Page): Promise<string> {
  await addBirthToCart(page);
  await payFromCart(page, "fail");
  await page.waitForURL(/\/checkout\/failed/);
  return new URL(page.url()).searchParams.get("orderId") ?? "";
}

/** Pay then CANCEL; lands back on /cart (cart preserved). */
export async function payAndCancel(page: Page): Promise<void> {
  await addBirthToCart(page);
  await payFromCart(page, "cancel");
  await page.waitForURL(/\/cart$/);
}

/** Create a CREATED-but-unpaid order (buyer abandons the window); returns the orderId. */
export async function createUnpaidOrder(page: Page): Promise<string> {
  await addBirthToCart(page);
  await payFromCart(page, "abandon");
  await page.waitForFunction(() => (window as unknown as Record<string, unknown>).__TOSS_LAST_ORDER_ID__);
  return (await page.evaluate(() => (window as unknown as Record<string, unknown>).__TOSS_LAST_ORDER_ID__)) as string;
}

/** Read the captured requestPayment() args (only valid for the "abandon" outcome — no navigation). */
export async function capturedTossRequest(page: Page): Promise<{
  method: string;
  amount: { value: number; currency: string };
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
}> {
  await page.waitForFunction(() => (window as unknown as Record<string, unknown>).__TOSS_REQUEST__);
  return page.evaluate(() => (window as unknown as Record<string, unknown>).__TOSS_REQUEST__ as never);
}

export { expect };
```

- [ ] **Step 2: F044 스펙 작성** — `tests/e2e/checkout-toss-sdk.spec.ts`

```ts
import { test, expect } from "@playwright/test";
import {
  addBirthToCart,
  payFromCart,
  completePaidOrder,
  capturedTossRequest,
} from "./_helpers/tossMock";

// F044 — the real TossPayments browser SDK path: the client calls loadTossPayments→requestPayment
// (stood in hermetically by planting window.TossPayments), the success callback confirms server-side,
// and the order lands PAID. The reload/webhook-first short-circuit is unit-proven (webhook.test.ts);
// the sandbox provider always approves so it cannot be reproduced hermetically here.
test.describe("checkout — real Toss browser SDK (F044)", () => {
  test("requestPayment is invoked with the SERVER-issued amount, orderId, name and callback URLs", async ({ page }) => {
    await addBirthToCart(page);
    await payFromCart(page, "abandon"); // capture args without navigating away
    const req = await capturedTossRequest(page);
    expect(req.method).toBe("CARD");
    expect(req.amount).toEqual({ value: 43000, currency: "KRW" });
    expect(req.orderId).toMatch(/^ord_/);
    expect(req.orderName).toBe("탄생");
    expect(req.successUrl).toMatch(/\/checkout\/success$/);
    expect(req.failUrl).toMatch(/\/checkout\/failed$/);
    // clientKey is server-issued (from createCheckout) — assert the SHAPE, not the literal: the sandbox
    // uses NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "test_ck_checkoutsandbox", and dev (.env.local) + CI (ci.yml) set it.
    const clientKey = await page.evaluate(() => (window as unknown as Record<string, unknown>).__TOSS_CLIENT_KEY__);
    expect(String(clientKey)).toMatch(/^test_ck_/);
  });

  test("a successful Toss payment confirms server-side and lands the order PAID", async ({ page }) => {
    const orderId = await completePaidOrder(page);
    expect(orderId).toMatch(/^ord_/);
    await expect(page.getByTestId("order-status")).toHaveText("PAID");
    await expect(page.getByTestId("order-grand-total")).toHaveText("43,000원");
    await expect(page.getByTestId("order-item")).toHaveCount(1);
  });

  test("the cart is emptied after a PAID order (clearCart ran on success)", async ({ page }) => {
    await completePaidOrder(page);
    await page.goto("/cart");
    await expect(page.getByTestId("cart-line")).toHaveCount(0);
  });
});
```

- [ ] **Step 3: RED 확인** — 흐름(create 라우트/CheckoutView)이 아직 구 sandbox 경로라 실패해야 함

Run: `pnpm test:e2e -- checkout-toss-sdk.spec.ts`
Expected: FAIL — CheckoutView 가 아직 `payUrl`(/checkout/pay)로 push → `window.TossPayments` 미호출 → `__TOSS_REQUEST__`
대기 타임아웃 / `/orders/ord_` 미도달.

- [ ] **Step 4: Commit (RED 스펙 — 흐름 전환 전)**

```bash
git add tests/e2e/_helpers/tossMock.ts tests/e2e/checkout-toss-sdk.spec.ts
git commit -m "test(F044): add Toss SDK mock helper + F044 e2e spec (RED until flow switch)"
```

---

## Task 7: create 라우트 + CheckoutView 전환 → F044 GREEN

**Files:**
- Modify: `src/app/api/payments/create/route.ts`
- Modify: `src/app/checkout/CheckoutView.tsx`

- [ ] **Step 1: create 라우트 교체** — `create/route.ts` 전체를 다음으로 변경(503 제거 + Checkout 공개필드 반환)

```ts
import { NextResponse } from "next/server";
import { untrusted } from "@/lib/guardrails";
import { getTemplateByKey } from "@/app/_components/catalog/templates";
import { buildOrderDraft, checkoutProvider } from "../_lib/checkout";
import { orderRepo } from "../_lib/orders";

export const dynamic = "force-dynamic";

/**
 * F012/F044 — create a TossPayments payment from the cart. The body is untrusted() at the boundary;
 * the amount is RECOMPUTED server-side from authoritative Template prices (the client totals are
 * display-only). The response carries ONLY public, non-secret fields the browser SDK needs
 * (clientKey is the publishable test key); the browser opens the real Toss window via requestPayment.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errors: ["잘못된 요청입니다."] }, { status: 400 });
  }

  const built = await buildOrderDraft(untrusted(body).value, getTemplateByKey);
  if (!built.ok) return NextResponse.json({ errors: built.errors }, { status: built.status });

  const order = await orderRepo().create(built.draft);
  const origin = new URL(req.url).origin;

  const checkout = checkoutProvider().createCheckout({
    orderId: order.id,
    amount: order.amountWon,
    orderName: order.orderName, // PII-free product summary
    successUrl: `${origin}/checkout/success`,
    failUrl: `${origin}/checkout/failed`,
  });

  return NextResponse.json({
    orderId: order.id,
    clientKey: checkout.clientKey,
    amount: checkout.amount, // server-issued; the client forwards this to requestPayment as-is
    orderName: checkout.orderName,
    successUrl: checkout.successUrl,
    failUrl: checkout.failUrl,
  });
}
```

- [ ] **Step 2: CheckoutView 전환** — `CheckoutView.tsx` 3개 지점 수정

(2a) import 교체 — `useRouter` 제거, `requestTossPayment` 추가. `CheckoutView.tsx:2-3` 부근:
```tsx
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Nav } from "../_components/Nav";
import { Footer } from "../_components/Footer";
import { formatWon, COVER_LABEL } from "../_components/order/format";
import { loadCart, grandTotalWon, type Cart } from "@/lib/cart";
import { requestTossPayment } from "./_lib/tossClient";
import styles from "./checkout.module.css";
```
(`import { useRouter } from "next/navigation";` 삭제.)

(2b) `const router = useRouter();`([CheckoutView.tsx:18](../../../src/app/checkout/CheckoutView.tsx#L18)) 삭제.

(2c) `onSubmit` 의 try 본문([CheckoutView.tsx:37-58](../../../src/app/checkout/CheckoutView.tsx#L37-L58))을 다음으로 교체:
```tsx
    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName,
          buyerEmail,
          qrVideoAddon: cart.qrVideoAddon,
          lines: cart.lines,
        }),
      });
      const data = (await res.json()) as {
        orderId?: string;
        clientKey?: string;
        amount?: number;
        orderName?: string;
        successUrl?: string;
        failUrl?: string;
        errors?: string[];
      };
      if (!res.ok || !data.orderId || !data.clientKey) {
        setError(data.errors?.[0] ?? "결제를 시작할 수 없습니다.");
        setSubmitting(false);
        return;
      }
      // Forward the SERVER-issued amount as-is (NOT grandTotalWon(cart)) — it must equal the
      // confirm-time server amount or Toss rejects the payment. Opens the real hosted window.
      await requestTossPayment({
        orderId: data.orderId,
        clientKey: data.clientKey,
        amount: data.amount as number,
        orderName: data.orderName as string,
        successUrl: data.successUrl as string,
        failUrl: data.failUrl as string,
      });
      // requestPayment redirects the browser. If it returns without redirecting, re-enable the button.
      setSubmitting(false);
    } catch {
      setError("결제창을 여는 중 오류가 발생했습니다. 다시 시도해 주세요.");
      setSubmitting(false);
    }
```

- [ ] **Step 3: F044 스펙 GREEN 확인**

Run: `pnpm test:e2e -- checkout-toss-sdk.spec.ts`
Expected: PASS(3 tests).

- [ ] **Step 4: 게이트 확인**

Run: `pnpm check`
Expected: green(lint+typecheck+unit+constraints). (참고: 구 7개 스펙은 아직 RED — Task 8 에서 이전.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/payments/create/route.ts src/app/checkout/CheckoutView.tsx
git commit -m "feat(F044): create route returns Checkout fields + CheckoutView opens real Toss SDK (503 removed)"
```

---

## Task 8: 기존 7개 스펙 이전 + sandbox 삭제 → 전체 E2E GREEN

각 스펙의 로컬 헬퍼(addBirthToCart/reachPay/payCart/payAndLand/createUnpaidBirth)를 `_helpers/tossMock` 으로 교체.
테스트 본문(assertion)은 의미 동일하게 유지. **스펙 파일명·`verification` 필드는 불변**(R9).

**Files (modify):** `tests/e2e/checkout-start.spec.ts`, `checkout-success.spec.ts`, `order-confirm.spec.ts`,
`checkout-failed.spec.ts`, `checkout-cancel.spec.ts`, `mypage-photo.spec.ts`, `mypage-finish.spec.ts`
**Files (delete):** `src/app/checkout/pay/page.tsx`, `src/app/checkout/pay/PaySandbox.tsx`

- [ ] **Step 1: checkout-start.spec.ts (F012)** — 전체 교체

```ts
import { test, expect } from "@playwright/test";
import { addBirthToCart, completePaidOrder } from "./_helpers/tossMock";

// F012 — from the cart, 결제하기 creates a Toss (test) payment and redirects through the Toss flow.
test.describe("checkout start (F012)", () => {
  test("결제하기 in the cart leads to the checkout buyer step", async ({ page }) => {
    await addBirthToCart(page);
    await page.getByTestId("cart-checkout").click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByTestId("checkout-grand-total")).toHaveText("43,000원");
  });

  test("submitting the buyer step creates an order and redirects through the Toss flow to the order page", async ({ page }) => {
    // The hermetic SDK mock stands in for the hosted window; the success redirect proves the
    // create → requestPayment → successUrl → confirm → /orders/[id] chain (the frozen "Redirect to Toss flow" step).
    const orderId = await completePaidOrder(page);
    expect(orderId).toMatch(/^ord_/);
    await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
    await expect(page.getByTestId("order-item-title")).toHaveText("탄생");
    await expect(page.getByTestId("order-grand-total")).toHaveText("43,000원");
  });

  test("no horizontal overflow at 375px on /checkout (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await addBirthToCart(page);
    await page.getByTestId("cart-checkout").click();
    await page.waitForURL("**/checkout");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
```

- [ ] **Step 2: checkout-success.spec.ts (F013)** — 전체 교체

```ts
import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";

// F013 — a successful Toss (test) payment confirms the order PAID and lands on the order page.
test.describe("checkout success (F013)", () => {
  test("a successful payment marks the order PAID and shows the confirmation", async ({ page }) => {
    const orderId = await completePaidOrder(page);
    expect(orderId).toMatch(/^ord_/);
    await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
    await expect(page.getByTestId("order-status")).toHaveText("PAID");
    await expect(page.getByTestId("order-grand-total")).toHaveText("43,000원");
    await expect(page.getByTestId("order-item")).toHaveCount(1);
  });

  test("the paid order persists on reload (server-side order store)", async ({ page }) => {
    const orderId = await completePaidOrder(page, { coverHard: true });
    await page.reload();
    await expect(page.getByTestId("order-status")).toHaveText("PAID");
    await expect(page.getByTestId("order-grand-total")).toHaveText("49,000원");
    expect(page.url()).toContain(orderId);
  });
});
```

- [ ] **Step 3: order-confirm.spec.ts (F014)** — 로컬 `addBirthToCart`+`payAndLand`(lines 4-29)를 삭제하고 import 로 교체

상단을 다음으로:
```ts
import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
```
그리고 본문의 `await payAndLand(page)` → `await completePaidOrder(page)`, `await payAndLand(page, { coverHard: true })`
→ `await completePaidOrder(page, { coverHard: true })` 로 치환. 나머지 assertion(order-id/item/cover/total/status,
unknown→404, 375px)은 그대로. (unknown-id 404 테스트는 `completePaidOrder` 불필요 — 그대로 `page.goto("/orders/ord_nonexistent")`.)

- [ ] **Step 4: checkout-failed.spec.ts (F015)** — 전체 교체

```ts
import { test, expect } from "@playwright/test";
import { payAndFail } from "./_helpers/tossMock";

// F015 — a Toss failure shows a clear message and leaves NO PAID order.
test.describe("checkout failure (F015)", () => {
  test("a failed payment shows a clear message and no PAID order is created", async ({ page }) => {
    const orderId = await payAndFail(page);
    await expect(page).toHaveURL(/\/checkout\/failed/);
    await expect(page.getByTestId("checkout-failed")).toBeVisible();
    // The order must NOT be PAID (F015: "No PAID order exists").
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByTestId("order-status")).toHaveText("CREATED");
  });

  test("the failure page offers a way back to the cart", async ({ page }) => {
    await payAndFail(page);
    await page.getByTestId("checkout-failed-back").click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
  });
});
```

- [ ] **Step 5: checkout-cancel.spec.ts (F016)** — 전체 교체

```ts
import { test, expect } from "@playwright/test";
import { payAndCancel } from "./_helpers/tossMock";

// F016 — cancelling at Toss (code=PAY_PROCESS_CANCELED) returns to the cart with items preserved.
test.describe("checkout cancel (F016)", () => {
  test("cancelling returns to the cart with the item still present", async ({ page }) => {
    await payAndCancel(page);
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("cart-grand-total")).toHaveText("43,000원");
  });
});
```

- [ ] **Step 6: mypage-photo.spec.ts (F017)** — 로컬 결제 헬퍼를 import 로 교체

`payCart`(lines 38-49), `payBirthSkippingPhoto`(51-55), `createUnpaidBirth`(57-67), 로컬 `addBirthToCart`(24-36)를 삭제.
상단 import 에 추가:
```ts
import { addBirthToCart, completePaidOrder, createUnpaidOrder } from "./_helpers/tossMock";
```
치환: `await payBirthSkippingPhoto(page)` → `await completePaidOrder(page)`; `await createUnpaidBirth(page)` →
`await createUnpaidOrder(page)`. (`signToken`/`setMypageCookie`/`lookup`/`PNG` 및 모든 assertion 은 그대로.)
주의: 로컬 `addBirthToCart` 제거 후에도 다른 곳에서 직접 호출하지 않으면 import 불필요 — 사용처가 없으면 import 에서 빼서
lint(unused) 회피. (현재 F017 은 직접 `addBirthToCart` 호출 없음 → import 는 `completePaidOrder, createUnpaidOrder` 만.)

- [ ] **Step 7: mypage-finish.spec.ts (F018)** — 로컬 결제 헬퍼를 import 로 교체

로컬 `addBirthToCart`(9-20), `payCart`(22-33), `payBirth`(35-38), `payTwoBirths`(40-44) 삭제. 상단 import 추가:
```ts
import { completePaidOrder, completePaidTwoBookOrder } from "./_helpers/tossMock";
```
치환: `await payBirth(page, { qrOn: true })` → `await completePaidOrder(page, { qrOn: true })`;
`await payBirth(page, { qrOn: false })` → `await completePaidOrder(page, { qrOn: false })`;
`await payTwoBirths(page, { qrOn: true })` → `await completePaidTwoBookOrder(page, { qrOn: true })`.
(`lookup` 및 모든 assertion 은 그대로.)

- [ ] **Step 8: sandbox 페이지 삭제**

Run:
```bash
git rm src/app/checkout/pay/page.tsx src/app/checkout/pay/PaySandbox.tsx
```
(`src/app/checkout/pay/` 디렉터리가 비면 자동 정리.)

- [ ] **Step 9: 전체 E2E + 게이트 확인**

Run: `pnpm test:e2e`
Expected: 전부 PASS(신규 F044 3 + 기존 스펙 무회귀; `/checkout/pay` 참조 0).
Run: `pnpm check`
Expected: green. (typecheck 가 삭제된 pay 페이지 참조 없음 확인 — 다른 import 없음.)

- [ ] **Step 10: Commit**

```bash
git add tests/e2e/
git commit -m "test(F044): migrate 7 checkout/mypage specs to Toss SDK mock; remove /checkout/pay sandbox"
```

---

## Task 9: F044 passing 전환 + F012–F018 evidence 갱신

**Files:** Modify: `feature_list.json`

- [ ] **Step 1: 전체 게이트 재확인(evidence 작성 근거)**

Run: `pnpm check` → green; `pnpm test:e2e` → all pass; `pnpm status` → product delivery 확인.
실제 출력(unit 수/E2E 수)을 기록해 evidence 에 인용.

- [ ] **Step 2: F044 를 passing 으로** — `feature_list.json` 의 F044 만 변경(state/passes/evidence)

```json
  "state": "passing",
  "passes": true,
  "evidence": "2026-06-08 Playwright checkout-toss-sdk.spec.ts: 3 passed — 실 Toss 브라우저 SDK 경로(loadTossPayments→payment(ANONYMOUS)→requestPayment)를 addInitScript 로 window.TossPayments 를 심어 hermetic 하게 실행: requestPayment 가 서버 발급 amount(43,000원 KRW)·orderId(ord_)·orderName(탄생)·successUrl(/checkout/success)·failUrl(/checkout/failed)·서버 clientKey 로 호출됨을 검증, success 콜백 → 서버 confirmPayment → PAID → /orders/[id], PAID 후 cart 비움. create 라우트의 APP_ENV==='production' 503 제거 + Checkout 공개필드 반환(clientKey 는 publishable test 키). confirmPayment 가 이미-PAID 주문을 gateway 재호출 없이 단락(webhook.test.ts: reload/webhook-first 안전). 취소는 failUrl code=PAY_PROCESS_CANCELED → /cart(F016 계약 보존). pnpm check green(lint+typecheck+<UNIT_N> unit+0 constraints R1–R9) + <E2E_N> E2E(기존 7개 스펙 sandbox→SDK-mock 이전, 무회귀). 독립 worker≠checker 리뷰: <결과>. 실 Toss 호스티드 창 오픈은 Vercel prod 카나리 수동 라운드트립으로 검증(<evidence ref>). webhook 안전망은 F045 로 분리(설계 §9). · ADR-0019."
```
(`<UNIT_N>`/`<E2E_N>`/리뷰결과/카나리 ref 는 Step 1 + Task 10/11 실측치로 채움.)

- [ ] **Step 3: F012–F018 + F034 evidence 갱신** — 각 항목의 **evidence 만** 한 줄 덧붙임(state/passes/verification/steps 불변)

각 F012/F013/F014/F015/F016/F017/F018 의 evidence 끝에 다음 취지를 추가:
`· 2026-06-08 (F044): sandbox /checkout/pay stand-in 제거 → 실 Toss 브라우저 SDK 경로를 addInitScript 목으로 재검증(스펙 파일명 동일, <spec>.spec.ts 무회귀).` (F016 은 추가로 `취소는 Toss code=PAY_PROCESS_CANCELED → /cart 로 동작이 동결 steps 와 일치.`)

**F034**(harness 안전 게이트 — evidence 가 503 게이트·server-computed payUrl·ADR-0013 을 인용)의 evidence 끝에도 한 줄 추가
(이 메커니즘들을 F044 가 제거하므로, 인용 일관성 위해):
`· 2026-06-08 (F044/ADR-0019): production 503 게이트 + sandbox payUrl/PaySandbox 제거됨(실 Toss 브라우저 SDK 로 전환); checkout-success.spec.ts verification + worker≠checker 리뷰는 보존(state/passes/steps/verification 불변).`

- [ ] **Step 4: 제약 + 게이트 확인**

Run: `pnpm constraints` → `ok:true`(R4: F044 passing↔passes:true; R8: F044 verification 에 test:e2e 포함→면제; R9: 기존 항목(F012–F018, F034)은 evidence 만 변경, 신규 F044 state/passes 변경 허용).
Run: `pnpm check` → green.

- [ ] **Step 5: Commit**

```bash
git add feature_list.json
git commit -m "feat(F044): mark passing + record evidence; note SDK re-verification on F012-F018"
```

---

## Task 10: 독립 worker≠checker 리뷰 (F042 프로토콜)

**Files:** (리뷰 결과에 따른 수정) + `PROGRESS.md`, `DECISIONS.md`

- [ ] **Step 1: refute-by-default 어드버サ리얼 리뷰 디스패치** — worker 와 독립된 checker(서브에이전트)로 6차원 점검:
  (1) 목 전략이 실 prod 경로를 실제로 실행하는가(테스트 훅 누수 0) (2) confirmPayment 단락 정합성 (3) 금액 forward
  (서버 권위) (4) PII/clientKey 노출 (5) F016 계약/동결 steps 일치 (6) R9/R4/R8 거버넌스. 각 발견은 독립 검증.
- [ ] **Step 2: 확정된 발견 수정** — blocker/major 0 될 때까지. 각 수정은 원자 커밋 + 해당 테스트 재실행.
- [ ] **Step 3: 게이트 재확인**

Run: `pnpm check` → green; `pnpm test:e2e` → all pass.

- [ ] **Step 4: 기록 + Commit** — `DECISIONS.md` 에 ADR-0019(결정·거부안·범위편차), `PROGRESS.md` Handoff/Session log 갱신,
  `pnpm attempt F044 --reset`.

```bash
git add PROGRESS.md DECISIONS.md .harness/attempts.json
git commit -m "docs(F044): ADR-0019 + worker≠checker review record; reset attempt"
```

---

## Task 11: 배포 + prod 카나리 수동 라운드트립 (실 결제창 검증)

**참고:** 시크릿 주입은 하니스가 차단 → `vercel --prod` 는 사용자가 실행. prod 도 TEST 키라 실제 돈 0(안전).

- [ ] **Step 1: prod 재배포** — 사용자에게 명령 제시: `vercel --prod` (env 10개 이미 세팅됨).
- [ ] **Step 2: 503 해소 확인**

Run(배포 후): `curl -s -o /dev/null -w "%{http_code}" -X POST https://storybook-shop.vercel.app/api/payments/create -H "Content-Type: application/json" -d '{}'`
Expected: 400(빈 본문 검증) — **503 아님**(게이트 제거 확인). (정상 본문이면 200 + clientKey.)

- [ ] **Step 3: 실 결제창 라운드트립** — 브라우저로 `https://storybook-shop.vercel.app` → 주문→장바구니→결제하기→buyer 입력
  →결제하기 클릭 → **실제 Toss 테스트 결제창 오픈 확인** → 테스트 카드로 승인 → `/orders/[id]` PAID 확인. 스크린샷/HAR evidence 캡처.
- [ ] **Step 4: evidence 를 F044 + PROGRESS 에 반영** — Task 9 Step 2 의 `<evidence ref>` 채움(별도 커밋).

---

## Self-Review (계획 vs 스펙)

**1. Spec coverage:** R1(Task7 create)·R2(Task7 buildOrderDraft 재사용+create)·R3(Task3 tossClient·Task7 CheckoutView)·
R4(Task4 success)·R5(Task2 단락)·R6(Task5/8 failed+F015)·R7(Task5/8 cancel→/cart)·R8(Task3 try/catch+CheckoutView catch)·
R9(Task6 addInitScript+abort)·R10(Task6/7 orderId ord_ 검증; 설계에 제약 명문화)·R11(목은 Playwright측, live 키 가드 불변)·
R12(Task8 7스펙 무회귀, F016 동결 steps 일치) → 전 요구사항에 대응 태스크 존재.

**2. Placeholder scan:** evidence 의 `<UNIT_N>/<E2E_N>/<결과>/<evidence ref>` 는 실측 후 채우는 의도된 placeholder(실행 시 확정);
그 외 TBD/TODO 없음. 모든 코드 스텝은 실제 코드 포함.

**3. Type consistency:** `requestTossPayment`/`TossCheckout`(Task3) ↔ CheckoutView 호출(Task7) 일치; create 응답
`{orderId,clientKey,amount,orderName,successUrl,failUrl}`(Task7) ↔ CheckoutView data 타입(Task7) ↔ tossMock `req` 형태(Task6) 일치;
헬퍼 이름(`completePaidOrder`/`completePaidTwoBookOrder`/`payAndFail`/`payAndCancel`/`createUnpaidOrder`/`capturedTossRequest`)
이 정의(Task6)와 사용(Task8)에서 동일.

**4. 거버넌스:** R9 — 신규 id 추가/기존 evidence-only/스펙 파일명 보존 모두 검증됨. 최상위 키 불변(build_order 등 미수정).
