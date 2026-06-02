import { test, expect, type Page } from "@playwright/test";

// F010 — cover selection reflected in the price.
async function toCover(page: Page) {
  await page.goto("/order/birth");
  await page.getByTestId("order-name-input").fill("도윤");
  await page.getByTestId("order-gender-male").check();
  await page.getByTestId("order-extravar-input").fill("2024-01-15");
  await page.getByTestId("order-next").click();
  await page.getByTestId("order-photo-skip").click();
  await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "cover");
}

test.describe("order cover — price reflects the selection (F010)", () => {
  test("soft is 43,000원, hard is 49,000원", async ({ page }) => {
    await toCover(page);
    await page.getByTestId("order-cover-soft").check();
    await expect(page.getByTestId("order-line-price")).toHaveText("43,000원");
    await page.getByTestId("order-cover-hard").check();
    await expect(page.getByTestId("order-line-price")).toHaveText("49,000원");
  });
});
