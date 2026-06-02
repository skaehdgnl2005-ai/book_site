import { test, expect, type Page } from "@playwright/test";

// F019 — QR add-on toggle: default off; flagged when on; honest "기본 미포함 · 요금 추후 안내"; +0 today.
async function toCover(page: Page) {
  await page.goto("/order/birth");
  await page.getByTestId("order-name-input").fill("도윤");
  await page.getByTestId("order-gender-male").check();
  await page.getByTestId("order-extravar-input").fill("2024-01-15");
  await page.getByTestId("order-next").click();
  await page.getByTestId("order-photo-skip").click();
  await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "cover");
}

test.describe("order QR add-on (F019)", () => {
  test("default off; toggling on flags it + shows the honest note; total unchanged (+0)", async ({ page }) => {
    await toCover(page);
    await expect(page.getByTestId("order-qr-toggle")).not.toBeChecked();
    await expect(page.getByTestId("order-line-price")).toHaveText("43,000원");
    await page.getByTestId("order-qr-toggle").check();
    await expect(page.getByTestId("order-qr-note")).toHaveText("기본 미포함 · 요금 추후 안내");
    await expect(page.getByTestId("order-line-price")).toHaveText("43,000원");
  });
});
