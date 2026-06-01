import { test, expect } from "@playwright/test";

// F026 — 후기. No real reviews yet (brief §10), and AGENTS.md forbids 날조 (fabrication).
// So: an honest empty state + the one real datum from brief §5 (beta 구매 예약율 80%),
// explicitly framed as an early beta signal, NOT customer reviews. No fake quotes.
test.describe("reviews (후기)", () => {
  test("renders honest empty state + honest beta signal (no fabricated quotes)", async ({ page }) => {
    await page.goto("/reviews");
    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /후기/ })).toBeVisible();
    await expect(page.getByText(/준비 중/)).toBeVisible(); // honest empty state
    await expect(page.getByText(/베타 인터뷰 구매 예약율/)).toBeVisible(); // framed as beta signal
    await expect(page.getByText(/80%/)).toBeVisible();
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/reviews");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
