import { test, expect, type Page } from "@playwright/test";

// F016 — cancelling at Toss returns to the cart with the items preserved.
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

async function reachPay(page: Page) {
  await page.getByTestId("cart-checkout").click();
  await page.waitForURL("**/checkout");
  await page.getByTestId("checkout-buyer-name").fill("김부모");
  await page.getByTestId("checkout-buyer-email").fill("parent@example.com");
  await page.getByTestId("checkout-pay").click();
  await page.waitForURL("**/checkout/pay**");
}

test.describe("checkout cancel (F016)", () => {
  test("cancelling returns to the cart with the item still present", async ({ page }) => {
    await addBirthToCart(page);
    await reachPay(page);

    await page.getByTestId("pay-cancel").click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("cart-grand-total")).toHaveText("43,000원");
  });
});
