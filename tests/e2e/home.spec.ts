import { test, expect } from "@playwright/test";

// Bootstrap E2E smoke (Phase 6): unit tests alone can't prove the user-facing
// page works (T1-A). This is the seed the buyer-journey flow extends.
test.describe("home → featured (skeleton smoke)", () => {
  test("renders the shop title and a featured region", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Storybook Shop", level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId("featured")).toBeVisible();
    // H3 budget: skeleton home must be well under the 2s p95 target.
    expect(Date.now() - start).toBeLessThan(5_000);
  });

  test("is mobile responsive (no horizontal overflow at 375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
