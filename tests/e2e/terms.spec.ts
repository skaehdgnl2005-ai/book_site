import { test, expect } from "@playwright/test";

// F065 — 이용약관(/terms). 공정위 표준약관 구조의 조문 + 사업자 정보(businessInfo)
// 일치 + 푸터 법정 블록에서 도달 가능.
test.describe("terms (이용약관, F065)", () => {
  test("푸터의 이용약관 링크로 /terms에 도달하고 조문 구조가 렌더된다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name: "이용약관" }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { level: 1, name: "이용약관" })).toBeVisible();
    // 조문 구조 — 최소한 목적·청약철회·환급 조항.
    await expect(page.getByRole("heading", { name: /제1조.*목적/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /제8조.*청약철회/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /제9조.*환급/ })).toBeVisible();
  });

  test("약관의 사업자 정보가 businessInfo 값과 일치한다 (상호·미설정 플레이스홀더)", async ({
    page,
  }) => {
    await page.goto("/terms");
    const main = page.getByRole("main");
    // 상호(기본값)와, BIZ_OWNER 미설정 시 정직한 플레이스홀더가 조문에 반영된다.
    await expect(main.getByText("그림책 제작소").first()).toBeVisible();
    await expect(main.getByText("〔등록 준비 중〕").first()).toBeVisible();
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/terms");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
