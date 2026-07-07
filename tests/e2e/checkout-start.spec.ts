import { test, expect } from "@playwright/test";
import { addBirthToCart, completePaidOrder, installTossMock } from "./_helpers/tossMock";

// F012 — from the cart, 결제하기 creates a Toss (test) payment and redirects through the Toss flow.
// F053 — the buyer step also collects the shipping destination (required; physical keepsake).
test.describe("checkout start (F012 + F053 shipping)", () => {
  test("결제하기 in the cart leads to the checkout buyer step with a shipping block", async ({ page }) => {
    await addBirthToCart(page);
    await page.getByTestId("cart-checkout").click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByTestId("checkout-grand-total")).toHaveText("43,000원");
    // F053 — shipping fields are present and labelled.
    await expect(page.getByLabel("받는 분 이름")).toBeVisible();
    await expect(page.getByLabel("받는 분 연락처")).toBeVisible();
    await expect(page.getByLabel("우편번호")).toBeVisible();
    await expect(page.getByLabel("주소", { exact: true })).toBeVisible();
  });

  test("missing shipping blocks the payment with a clear error (server-validated, no order page)", async ({ page }) => {
    await installTossMock(page, "success");
    await addBirthToCart(page);
    await page.getByTestId("cart-checkout").click();
    await page.waitForURL("**/checkout");
    await page.getByTestId("checkout-buyer-name").fill("김부모");
    await page.getByTestId("checkout-buyer-email").fill("parent@example.com");
    await page.getByTestId("checkout-pay").click(); // shipping left empty
    await expect(page.getByTestId("checkout-error")).toBeVisible();
    await expect(page).toHaveURL(/\/checkout$/); // never reached Toss / the order page
  });

  test("submitting the buyer step creates an order and redirects through the Toss flow to the order page", async ({ page }) => {
    const orderId = await completePaidOrder(page);
    expect(orderId).toMatch(/^ord_/);
    await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
    await expect(page.getByTestId("order-item-title")).toHaveText("탄생");
    await expect(page.getByTestId("order-grand-total")).toHaveText("43,000원");
    // F053 — the UNAUTHENTICATED confirmation page never exposes the shipping destination (PII).
    await expect(page.locator("body")).not.toContainText("김수취");
    await expect(page.locator("body")).not.toContainText("세종대로");
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
