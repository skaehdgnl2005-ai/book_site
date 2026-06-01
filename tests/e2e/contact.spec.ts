import { test, expect } from "@playwright/test";

// F028 — 문의. 전화·이메일 are honest flagged placeholders (brief §10 추후 제공). The
// 문의 폼 validates, tags input untrusted() at the trust boundary, and on submit shows
// HONEST guidance to use 전화/이메일 — never a fake "접수 완료" (no backend/mail sink).
test.describe("contact (문의)", () => {
  test("shows channels + a form that submits to honest guidance (no fake receipt)", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /문의/ })).toBeVisible();
    await expect(page.getByText(/전화번호 준비 중/)).toBeVisible(); // honest placeholder
    await expect(page.getByText(/이메일 준비 중/)).toBeVisible();

    await page.getByLabel("이름").fill("김부모");
    await page.getByLabel("연락처").fill("test@example.com");
    await page.getByLabel("문의 내용").fill("돌 기념 책 문의드려요.");
    await page.getByRole("button", { name: "보내기" }).click();
    await expect(page.getByText(/가장 빠른 답변은/)).toBeVisible(); // honest guidance, no fake receipt
  });

  test("empty submit is blocked with an error", async ({ page }) => {
    await page.goto("/contact");
    await page.getByRole("button", { name: "보내기" }).click();
    await expect(page.getByText(/모두 입력해 주세요/)).toBeVisible();
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/contact");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
