import { type Page, expect } from "@playwright/test";

export type TossOutcome = "success" | "fail" | "cancel" | "abandon";

/**
 * Plant a hermetic stand-in for the TossPayments browser SDK BEFORE any page script runs.
 * loadTossPayments (v2 thin loader) short-circuits when window.TossPayments already exists, so the
 * REAL client path runs with ZERO app test-hooks and NO CDN fetch. The CDN route is aborted as a
 * backstop. MUST be called BEFORE the first navigation so addInitScript fires on the first document
 * load and the global persists across SPA navigation.
 *
 * Provides BOTH SDK surfaces (the real SDK has both): `payment()` = 결제창 (F044 — still used by the
 * 맞춤 written flow) and `widgets()` = 결제위젯 (F069 — the entry checkout; renders 카드+간편결제 UI
 * into the page and takes the amount from setAmount, not the request). Both share one redirect.
 */
export async function installTossMock(page: Page, outcome: TossOutcome): Promise<void> {
  await page.route("https://js.tosspayments.com/**", (route) => route.abort());
  await page.addInitScript((o: string) => {
    const w = window as unknown as Record<string, unknown>;
    const redirect = (
      req: { orderId: string; successUrl: string; failUrl: string },
      amountValue: number,
    ) => {
      w.__TOSS_LAST_ORDER_ID__ = req.orderId;
      if (o === "success")
        location.assign(`${req.successUrl}?paymentKey=test_pk_${req.orderId}&orderId=${req.orderId}&amount=${amountValue}&paymentType=NORMAL`);
      else if (o === "fail")
        location.assign(`${req.failUrl}?code=PAY_PROCESS_ABORTED&message=${encodeURIComponent("결제에 실패했습니다")}&orderId=${req.orderId}`);
      else if (o === "cancel")
        location.assign(`${req.failUrl}?code=PAY_PROCESS_CANCELED&message=${encodeURIComponent("결제를 취소했습니다")}&orderId=${req.orderId}`);
      // "abandon": no redirect — simulates the buyer closing the window (order stays CREATED).
    };
    w.TossPayments = (clientKey: string) => {
      w.__TOSS_CLIENT_KEY__ = clientKey;
      return {
        // F044 — 결제창 (method-locked). Still used by the 맞춤 written flow.
        // Real SDK: payment() throws NotSupportedWidgetKeyError for a 결제위젯 키(gck) — model it so
        // a mis-keyed surface fails the E2E instead of passing (worker≠checker F069 mock-fidelity).
        payment: () => {
          if (clientKey.includes("gck_")) throw new Error("NotSupportedWidgetKeyError: payment() requires an API-individual key (ck)");
          return {
            requestPayment: async (req: {
              method: string;
              amount: { value: number; currency: string };
              orderId: string;
              orderName: string;
              successUrl: string;
              failUrl: string;
            }) => {
              w.__TOSS_REQUEST__ = req;
              redirect(req, req.amount.value);
            },
          };
        },
        // F069 — 결제위젯. Renders method + agreement UI; amount comes from setAmount.
        // Real SDK: widgets() throws NotSupportedAPIIndividualKeyError for an API-individual key(ck) —
        // model it so the entry checkout must be handed a 결제위젯 키(gck) or the E2E fails.
        widgets: (_opts: { customerKey: string }) => {
          if (!clientKey.includes("gck_")) throw new Error("NotSupportedAPIIndividualKeyError: widgets() requires a payment-widget key (gck)");
          let amount = { currency: "KRW", value: 0 };
          return {
            setAmount: async (a: { currency: string; value: number }) => {
              amount = a;
              w.__TOSS_AMOUNT__ = a;
            },
            renderPaymentMethods: async ({ selector }: { selector: string }) => {
              const el = document.querySelector(selector);
              if (el)
                el.innerHTML =
                  '<div data-testid="toss-payment-methods">카드 · 네이버페이 · 카카오페이 · 토스페이</div>';
              return {};
            },
            renderAgreement: async ({ selector }: { selector: string }) => {
              const el = document.querySelector(selector);
              if (el) el.innerHTML = '<div data-testid="toss-agreement-ui">결제 약관 동의</div>';
              return {};
            },
            requestPayment: async (req: {
              orderId: string;
              orderName: string;
              successUrl: string;
              failUrl: string;
            }) => {
              w.__TOSS_REQUEST__ = { ...req, amount };
              redirect(req, amount.value);
            },
          };
        },
      };
    };
  }, outcome);
}

/**
 * F069 — plant a TossPayments stand-in whose widgets() THROWS (models a CDN/SDK load failure or a
 * key-type mismatch). Lets the E2E exercise CheckoutView's widget-load-failure branch (error copy +
 * 다시 불러오기 + the pay button staying locked). payment() still resolves so unrelated flows are unaffected.
 */
export async function installFailingWidgetMock(page: Page): Promise<void> {
  await page.route("https://js.tosspayments.com/**", (route) => route.abort());
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.TossPayments = () => ({
      widgets: () => {
        throw new Error("widget load failed (test)");
      },
      payment: () => ({ requestPayment: async () => {} }),
    });
  });
}

/** Add one 탄생 book to the cart (photo skipped). */
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

async function fillBuyer(page: Page, email = "parent@example.com"): Promise<void> {
  await page.getByTestId("checkout-buyer-name").fill("김부모");
  await page.getByTestId("checkout-buyer-email").fill(email);
  // F053 — shipping is required on an ENTRY order (single funnel point for every checkout spec).
  await page.getByTestId("checkout-ship-name").fill("김수취");
  await page.getByTestId("checkout-ship-phone").fill("010-2222-3333");
  await page.getByTestId("checkout-ship-zip").fill("04524");
  await page.getByTestId("checkout-ship-address").fill("서울특별시 중구 세종대로 110");
  await page.getByTestId("checkout-ship-address-detail").fill("101동 1001호");
  // F067 — 주문제작 청약철회 제한 동의(결제 전 필수; 서버도 게이트).
  await page.getByTestId("checkout-withdrawal-consent").check();
}

/** From a populated /cart, walk checkout and trigger requestPayment. The SDK mock MUST already be installed. */
export async function checkoutFromCart(page: Page, opts: { email?: string } = {}): Promise<void> {
  await page.getByTestId("cart-checkout").click();
  await page.waitForURL("**/checkout");
  await fillBuyer(page, opts.email);
  await page.getByTestId("checkout-pay").click();
}

/** Build a cart + pay successfully; returns the PAID orderId (from the /orders/[id] landing). */
export async function completePaidOrder(
  page: Page,
  opts: { coverHard?: boolean; qrOn?: boolean; email?: string } = {},
): Promise<string> {
  await installTossMock(page, "success");
  await addBirthToCart(page, opts);
  await checkoutFromCart(page, { email: opts.email });
  await page.waitForURL(/\/orders\/ord_/);
  return new URL(page.url()).pathname.split("/").pop() as string;
}

/** Build a 2-book cart (QR on book 2 if qrOn) + pay successfully; returns the PAID orderId. */
export async function completePaidTwoBookOrder(page: Page, opts: { qrOn?: boolean } = {}): Promise<string> {
  await installTossMock(page, "success");
  await addBirthToCart(page);
  await addBirthToCart(page, { qrOn: opts.qrOn }); // QR is order-level (last add-to-cart wins)
  await checkoutFromCart(page);
  await page.waitForURL(/\/orders\/ord_/);
  return new URL(page.url()).pathname.split("/").pop() as string;
}

/** Pay then FAIL; returns the orderId carried on the failUrl query. */
export async function payAndFail(page: Page): Promise<string> {
  await installTossMock(page, "fail");
  await addBirthToCart(page);
  await checkoutFromCart(page);
  await page.waitForURL(/\/checkout\/failed/);
  return new URL(page.url()).searchParams.get("orderId") ?? "";
}

/** Pay then CANCEL; lands back on /cart (cart preserved). */
export async function payAndCancel(page: Page): Promise<void> {
  await installTossMock(page, "cancel");
  await addBirthToCart(page);
  await checkoutFromCart(page);
  await page.waitForURL(/\/cart$/);
}

/** Create a CREATED-but-unpaid order (buyer abandons the window); returns the orderId. */
export async function createUnpaidOrder(page: Page): Promise<string> {
  await installTossMock(page, "abandon");
  await addBirthToCart(page);
  await checkoutFromCart(page);
  await page.waitForFunction(() => (window as unknown as Record<string, unknown>).__TOSS_LAST_ORDER_ID__);
  return (await page.evaluate(() => (window as unknown as Record<string, unknown>).__TOSS_LAST_ORDER_ID__)) as string;
}

/** Read the captured requestPayment() args (only valid for the "abandon" outcome — no navigation).
 *  `method` is present only on the 결제창 path (payment()); the 결제위젯 path (widgets(), F069) has
 *  no per-request method — the amount is what setAmount last received. */
export async function capturedTossRequest(page: Page): Promise<{
  method?: string;
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
