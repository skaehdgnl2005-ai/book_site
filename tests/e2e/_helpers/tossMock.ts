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
