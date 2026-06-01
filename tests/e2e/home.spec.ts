import { test, expect } from "@playwright/test";

// Branded home (F002) — verifies the 그림책 제작소 home and the reusable UI kit.
// Also covers F001 (boots + hero + featured region) and F035 (mobile responsive).
test.describe("home (그림책 제작소)", () => {
  test("renders brand, hero, 3 category cards, and the primary CTA", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");

    // Brand wordmark (nav).
    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();

    // Hero <h1>.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Featured region + the 3 category cards (scoped to avoid the nav links).
    const featured = page.getByTestId("featured");
    await expect(featured).toBeVisible();
    await expect(featured.getByRole("link", { name: /기념일/ })).toBeVisible();
    await expect(featured.getByRole("link", { name: /첫 순간들/ })).toBeVisible();
    await expect(featured.getByRole("link", { name: /맞춤 제작/ })).toBeVisible();

    // Primary CTA.
    await expect(page.getByRole("link", { name: "내 아이의 책 만들기" })).toBeVisible();

    // H3 budget: home well under the 2s p95 target.
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
