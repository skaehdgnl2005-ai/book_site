import { test, expect, type Page } from "@playwright/test";

// F013 — approving the Toss (test) payment confirms the order PAID and lands on the order page.
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

async function startCheckout(page: Page): Promise<string> {
  await page.getByTestId("cart-checkout").click();
  await page.waitForURL("**/checkout");
  await page.getByTestId("checkout-buyer-name").fill("김부모");
  await page.getByTestId("checkout-buyer-email").fill("parent@example.com");
  await page.getByTestId("checkout-pay").click();
  await page.waitForURL("**/checkout/pay**");
  return new URL(page.url()).searchParams.get("order") ?? "";
}

test.describe("checkout success (F013)", () => {
  test("approving the test payment marks the order PAID and shows the confirmation", async ({ page }) => {
    await addBirthToCart(page);
    const orderId = await startCheckout(page);
    expect(orderId).toMatch(/^ord_/);

    await page.getByTestId("pay-approve").click();
    await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
    await expect(page.getByTestId("order-status")).toHaveText("PAID");
    await expect(page.getByTestId("order-grand-total")).toHaveText("43,000원");
    await expect(page.getByTestId("order-item")).toHaveCount(1);
  });

  test("the paid order persists on reload (server-side order store)", async ({ page }) => {
    await addBirthToCart(page, { coverHard: true });
    const orderId = await startCheckout(page);
    await page.getByTestId("pay-approve").click();
    await page.waitForURL(`**/orders/${orderId}`);
    await page.reload();
    await expect(page.getByTestId("order-status")).toHaveText("PAID");
    await expect(page.getByTestId("order-grand-total")).toHaveText("49,000원");
  });
});
