import { test, expect, type Page } from "@playwright/test";

// F015 — a Toss failure shows a clear message and leaves NO PAID order.
async function addBirthToCart(page: Page) {
  await page.goto("/order/birth");
  await page.getByTestId("order-name-input").fill("도윤");
  await page.getByTestId("order-gender-male").check();
  await page.getByTestId("order-extravar-input").fill("2024-01-15");
  await page.getByTestId("order-next").click();
  await page.getByTestId("order-photo-skip").click();
  await page.getByTestId("order-next").click();
  await page.getByTestId("order-add-to-cart").click();
  await page.waitForURL("**/cart");
}

async function reachPay(page: Page): Promise<string> {
  await page.getByTestId("cart-checkout").click();
  await page.waitForURL("**/checkout");
  await page.getByTestId("checkout-buyer-name").fill("김부모");
  await page.getByTestId("checkout-buyer-email").fill("parent@example.com");
  await page.getByTestId("checkout-pay").click();
  await page.waitForURL("**/checkout/pay**");
  return new URL(page.url()).searchParams.get("order") ?? "";
}

test.describe("checkout failure (F015)", () => {
  test("a failed payment shows a clear message and no PAID order is created", async ({ page }) => {
    await addBirthToCart(page);
    const orderId = await reachPay(page);

    await page.getByTestId("pay-fail").click();
    await expect(page).toHaveURL(/\/checkout\/failed/);
    await expect(page.getByTestId("checkout-failed")).toBeVisible();

    // The order must NOT be PAID (F015: "No PAID order exists").
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByTestId("order-status")).toHaveText("CREATED");
  });

  test("the failure page offers a way back to the cart", async ({ page }) => {
    await addBirthToCart(page);
    await reachPay(page);
    await page.getByTestId("pay-fail").click();
    await page.getByTestId("checkout-failed-back").click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
  });
});
