import { test, expect, type Page } from "@playwright/test";

// F012 — from the cart, 결제하기 creates a Toss (test) payment and redirects to the Toss flow.
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

test.describe("checkout start (F012)", () => {
  test("결제하기 in the cart leads to the checkout buyer step", async ({ page }) => {
    await addBirthToCart(page);
    await page.getByTestId("cart-checkout").click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByTestId("checkout-grand-total")).toHaveText("43,000원");
  });

  test("submitting the buyer step creates an order and redirects to the Toss (test) payment page", async ({ page }) => {
    await addBirthToCart(page);
    await page.getByTestId("cart-checkout").click();
    await page.waitForURL("**/checkout");

    await page.getByTestId("checkout-buyer-name").fill("김부모");
    await page.getByTestId("checkout-buyer-email").fill("parent@example.com");
    await page.getByTestId("checkout-pay").click();

    await expect(page).toHaveURL(/\/checkout\/pay\?order=ord_/);
    await expect(page.getByTestId("pay-amount")).toHaveText("43,000원");
    await expect(page.getByTestId("pay-order-name")).toHaveText("탄생");
    await expect(page.getByRole("heading", { name: /테스트 결제/ })).toBeVisible();
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
