import { test, expect } from "@playwright/test";

// F066 — 개인정보처리방침(/privacy). 수집 항목·목적·보유 기간·처리 위탁 표 +
// 개인정보보호책임자(미설정 시 플레이스홀더) + 푸터 정책 링크에서 도달 가능.
test.describe("privacy (개인정보처리방침, F066)", () => {
  test("푸터의 개인정보처리방침 링크로 /privacy에 도달하고 핵심 섹션이 렌더된다", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "개인정보처리방침" })
      .click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "개인정보처리방침" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /수집하는 개인정보/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /보유.*이용 기간/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /처리 위탁/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /아동의 개인정보/ })).toBeVisible();
  });

  test("수집 항목에 아이 정보가, 위탁 표에 결제대행사가 명시된다", async ({ page }) => {
    await page.goto("/privacy");
    const main = page.getByRole("main");
    await expect(main.getByText(/아이 이름/).first()).toBeVisible();
    await expect(main.getByText("토스페이먼츠").first()).toBeVisible();
    // 책임자 미설정 → 정직한 플레이스홀더 (BIZ_PRIVACY_OFFICER 채우면 실값).
    await expect(main.getByText("〔등록 준비 중〕").first()).toBeVisible();
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/privacy");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
