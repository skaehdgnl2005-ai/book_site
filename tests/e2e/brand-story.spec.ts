import { test, expect } from "@playwright/test";

// F024 — 브랜드 스토리. Honest, grounded founder/brand narrative (no fabricated
// biography): the personal origin story is a visibly-flagged "준비 중" placeholder.
test.describe("brand-story (브랜드 스토리)", () => {
  test("renders nav, heading, grounded narrative, CTA", async ({ page }) => {
    await page.goto("/brand-story");
    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /브랜드 스토리/ })).toBeVisible();
    await expect(page.getByText(/우리말로 옮겨 온 번역가/)).toBeVisible(); // grounded fact (brief §1/§5)
    // Scoped to main: the F064 legal footer renders its own 〔등록 준비 중〕 rows site-wide.
    await expect(page.getByRole("main").getByText(/준비 중/)).toBeVisible(); // honest flagged placeholder
    await expect(page.getByRole("link", { name: "내 아이의 책 만들기" })).toBeVisible();
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/brand-story");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
