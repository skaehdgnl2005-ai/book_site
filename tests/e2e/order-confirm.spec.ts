import { test, expect, type Page } from "@playwright/test";

// F014 — the order confirmation page shows items, cover, total and status PAID.
async function addBirthToCart(page: Page, opts: { coverHard?: boolean } = {}) {
  await page.goto("/order/birth");
  await page.getByTestId("order-name-input").fill("도윤");
  await page.getByTestId("order-gender-male").check();
  await page.getByTestId("order-extravar-input").fill("2024-01-15");
  await page.getByTestId("order-next").click();
  await page.getByTestId("order-photo-skip").click();
  if (opts.coverHard) await page.getByTestId("order-cover-hard").check();
  await page.getByTestId("order-next").click();
  await page.getByTestId("order-add-to-cart").click();
  await page.waitForURL("**/cart");
}

async function payAndLand(page: Page, opts: { coverHard?: boolean } = {}): Promise<string> {
  await addBirthToCart(page, opts);
  await page.getByTestId("cart-checkout").click();
  await page.waitForURL("**/checkout");
  await page.getByTestId("checkout-buyer-name").fill("김부모");
  await page.getByTestId("checkout-buyer-email").fill("parent@example.com");
  await page.getByTestId("checkout-pay").click();
  await page.waitForURL("**/checkout/pay**");
  const orderId = new URL(page.url()).searchParams.get("order") ?? "";
  await page.getByTestId("pay-approve").click();
  await page.waitForURL(`**/orders/${orderId}`);
  return orderId;
}

test.describe("order confirmation (F014)", () => {
  test("shows the item (label + cover), grand total and PAID status", async ({ page }) => {
    const orderId = await payAndLand(page);
    await expect(page.getByTestId("order-id")).toContainText(orderId);
    await expect(page.getByTestId("order-item")).toHaveCount(1);
    await expect(page.getByTestId("order-item-title")).toHaveText("탄생");
    await expect(page.getByTestId("order-item-cover")).toHaveText("소프트커버");
    await expect(page.getByTestId("order-grand-total")).toHaveText("43,000원");
    await expect(page.getByTestId("order-status")).toHaveText("PAID");
  });

  test("a hard-cover order reflects 49,000원", async ({ page }) => {
    await payAndLand(page, { coverHard: true });
    await expect(page.getByTestId("order-item-cover")).toHaveText("하드커버");
    await expect(page.getByTestId("order-grand-total")).toHaveText("49,000원");
  });

  test("an unknown order id is a 404", async ({ page }) => {
    const res = await page.goto("/orders/ord_nonexistent");
    expect(res?.status()).toBe(404);
  });

  test("no horizontal overflow at 375px on the order page (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await payAndLand(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
