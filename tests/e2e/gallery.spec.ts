import { test, expect } from "@playwright/test";

// F025 — 갤러리/포트폴리오. Real 내지·외함 sample images are not yet provided
// (brief §10 '추후 제공'), so the grid shows honest, flagged placeholder tiles.
test.describe("gallery (갤러리)", () => {
  test("renders nav, heading, and placeholder sample tiles", async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /갤러리/ })).toBeVisible();
    const tiles = page.getByTestId("gallery-tile");
    expect(await tiles.count()).toBeGreaterThan(0);
    await expect(tiles.first()).toContainText(/준비 중/); // honest placeholder, not a real asset
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/gallery");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
