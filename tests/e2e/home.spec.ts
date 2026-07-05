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

  // F048 — the product-explanation layer: a first-time visitor can learn how the
  // book is made, what physically arrives, and reach the content pages from the footer.
  test("explains the product: process steps, kit contents, footer content links (F048)", async ({
    page,
  }) => {
    await page.goto("/");

    // Hero eyebrow leans on 초개인화 (customer surfaces keep AI backstage).
    await expect(page.getByText("초개인화 그림책", { exact: true })).toBeVisible();

    // "이렇게 만들어집니다" — 3 numbered steps.
    const how = page.getByTestId("how-it-works");
    await expect(how.getByRole("heading", { name: "이렇게 만들어집니다" })).toBeVisible();
    await expect(how.getByRole("heading", { name: "순간을 고릅니다" })).toBeVisible();
    await expect(how.getByRole("heading", { name: "단 한 권을 만들어 보냅니다" })).toBeVisible();

    // "한 권에 담기는 것" — the keepsake kit (책·자석 외함·축하 카드) + honest QR note.
    const kit = page.getByTestId("kit");
    await expect(kit.getByRole("heading", { name: "자석 외함" })).toBeVisible();
    await expect(kit.getByRole("heading", { name: "축하 카드" })).toBeVisible();
    await expect(kit.getByText("기본 미포함 · 요금 추후 안내")).toBeVisible();

    // Footer surfaces the previously-orphaned content pages, and they navigate.
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "브랜드 스토리" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "갤러리" })).toBeVisible();
    await footer.getByRole("link", { name: "자주 묻는 질문" }).click();
    await expect(page).toHaveURL(/\/faq$/);
    await expect(page.getByRole("heading", { level: 1, name: /자주 묻는 질문/ })).toBeVisible();
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
