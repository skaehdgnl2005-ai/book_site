import { test, expect } from "@playwright/test";

// F064 — 푸터 법정 표시사항(전자상거래법 제10조). Footer는 루트 layout에서 한 번만
// 렌더된다. BIZ_REG_NO는 playwright.config.ts webServer env의 결정적 픽스처
// (123-45-67890)라 공정위 링크 분기까지 E2E로 확인하고, 나머지 BIZ_*는 미설정이라
// '준비 중' 플레이스홀더 분기를 확인한다.
test.describe("legal footer (F064)", () => {
  test("초기화면 푸터에 법정 표시 블록이 보인다 — 라벨·플레이스홀더·호스팅", async ({
    page,
  }) => {
    await page.goto("/");
    const legal = page.getByRole("contentinfo").locator(".site-footer__legal");
    await expect(legal).toBeVisible();

    // 법정 표시 라벨 전항목.
    for (const label of [
      "상호",
      "대표",
      "사업자등록번호",
      "통신판매업 신고",
      "주소",
      "전화",
      "이메일",
      "개인정보관리책임자",
      "호스팅",
    ]) {
      await expect(legal.getByText(label, { exact: true })).toBeVisible();
    }

    // 상호 기본값 + 호스팅 제공자는 실값, 미설정 항목은 빈칸이 아니라 정직한 플레이스홀더.
    await expect(legal.getByText("Vercel Inc.")).toBeVisible();
    await expect(legal.getByText("〔등록 준비 중〕").first()).toBeVisible();
  });

  test("사업자등록번호가 설정되면 공정위 사업자정보확인 링크가 노출된다", async ({ page }) => {
    await page.goto("/");
    const ftc = page.getByRole("contentinfo").getByRole("link", { name: "사업자정보확인" });
    await expect(ftc).toBeVisible();
    await expect(ftc).toHaveAttribute(
      "href",
      "https://www.ftc.go.kr/bizCommPop.do?wrkr_no=1234567890",
    );
    await expect(ftc).toHaveAttribute("target", "_blank");
  });

  test("홈 외 페이지에서도 같은 푸터가 정확히 1번 렌더된다 (전역화·중복 없음)", async ({
    page,
  }) => {
    for (const path of ["/faq", "/cart", "/anniversary"]) {
      await page.goto(path);
      await expect(page.locator("footer.site-footer")).toHaveCount(1);
      await expect(
        page.locator("footer.site-footer .site-footer__legal"),
      ).toHaveCount(1);
    }
  });

  test("법정 블록 포함 375px 모바일에서 가로 오버플로가 없다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
