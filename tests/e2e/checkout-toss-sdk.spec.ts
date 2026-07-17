import { test, expect } from "@playwright/test";
import {
  installTossMock,
  addBirthToCart,
  checkoutFromCart,
  completePaidOrder,
  capturedTossRequest,
} from "./_helpers/tossMock";

// F044/F069 — the real TossPayments browser SDK path: the client loads the SDK (stood in hermetically
// by planting window.TossPayments), and the success callback confirms server-side so the order lands
// PAID. F069 migrated the entry checkout from the 결제창 (payment(), method:CARD) to the 결제위젯
// (widgets()), so requestPayment no longer carries a method — the amount comes from setAmount. The
// reload/webhook-first short-circuit is unit-proven (webhook.test.ts); the sandbox always approves.
test.describe("checkout — real Toss browser SDK (F044/F069 widget)", () => {
  test("requestPayment is invoked with the SERVER-issued amount, orderId, name and callback URLs", async ({ page }) => {
    await installTossMock(page, "abandon");
    await addBirthToCart(page);
    await checkoutFromCart(page);
    const req = await capturedTossRequest(page);
    // F069 — the entry charge routes through the WIDGET (widgets().requestPayment), which carries NO
    // per-request method (unlike the 결제창 payment() path) — pins that the migration didn't regress.
    expect(req.method).toBeUndefined();
    // amount is set on the widget (setAmount) from the SERVER-issued value, not the request.
    expect(req.amount).toEqual({ value: 43000, currency: "KRW" });
    expect(req.orderId).toMatch(/^ord_/);
    expect(req.orderName).toBe("탄생");
    expect(req.successUrl).toMatch(/\/checkout\/success$/);
    expect(req.failUrl).toMatch(/\/checkout\/failed$/);
    // F069 — the widget key is a 결제위젯 연동 키(gck), distinct from the 결제창 API key(ck). Assert the
    // SHAPE, not the literal: checkoutClientKey() uses NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY ?? the public
    // test_gck_ sandbox key. (A ck key here would make the real widgets() throw — the mock now enforces it.)
    const clientKey = await page.evaluate(() => (window as unknown as Record<string, unknown>).__TOSS_CLIENT_KEY__);
    expect(String(clientKey)).toMatch(/^test_gck_/);
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
