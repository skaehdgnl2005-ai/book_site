import { test, expect } from "@playwright/test";
import {
  installTossMock,
  addBirthToCart,
  checkoutFromCart,
  completePaidOrder,
  capturedTossRequest,
} from "./_helpers/tossMock";

// F044 — the real TossPayments browser SDK path: the client calls loadTossPayments→requestPayment
// (stood in hermetically by planting window.TossPayments), the success callback confirms server-side,
// and the order lands PAID. The reload/webhook-first short-circuit is unit-proven (webhook.test.ts);
// the sandbox provider always approves so it cannot be reproduced hermetically here.
test.describe("checkout — real Toss browser SDK (F044)", () => {
  test("requestPayment is invoked with the SERVER-issued amount, orderId, name and callback URLs", async ({ page }) => {
    await installTossMock(page, "abandon");
    await addBirthToCart(page);
    await checkoutFromCart(page);
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
