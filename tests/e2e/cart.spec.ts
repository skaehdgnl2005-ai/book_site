import { test, expect, type Page } from "@playwright/test";

// F011 — cart shows the configured book (template/cover/personalization) + grand total in 원.
async function configureAndAdd(page: Page, opts: { coverHard?: boolean; qr?: boolean } = {}) {
  await page.goto("/order/birth");
  await page.getByTestId("order-name-input").fill("도윤");
  await page.getByTestId("order-gender-male").check();
  await page.getByTestId("order-extravar-input").fill("2024-01-15");
  await page.getByTestId("order-next").click();
  await page.getByTestId("order-photo-skip").click();
  if (opts.coverHard) await page.getByTestId("order-cover-hard").check();
  if (opts.qr) await page.getByTestId("order-qr-toggle").check();
  await page.getByTestId("order-next").click(); // → review
  await page.getByTestId("order-add-to-cart").click();
  await page.waitForURL("**/cart");
}

test.describe("cart (F011)", () => {
  test("a soft-cover book shows its line + 43,000원 grand total", async ({ page }) => {
    await configureAndAdd(page);
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("cart-line-title")).toHaveText("탄생");
    await expect(page.getByTestId("cart-line-cover")).toHaveText("소프트커버");
    await expect(page.getByTestId("cart-grand-total")).toHaveText("43,000원");
  });

  test("hard cover reflects 49,000원 in the grand total", async ({ page }) => {
    await configureAndAdd(page, { coverHard: true });
    await expect(page.getByTestId("cart-grand-total")).toHaveText("49,000원");
  });

  test("direct navigation to an empty cart shows an honest empty state", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.getByTestId("cart-empty")).toBeVisible();
    await expect(page.getByTestId("cart-line")).toHaveCount(0);
  });

  test("no horizontal overflow at 375px (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await configureAndAdd(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
