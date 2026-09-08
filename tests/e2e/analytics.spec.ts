import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./_helpers/account";
import { addBirthToCart, checkoutFromCart, installTossMock } from "./_helpers/tossMock";

/**
 * F092 — 전환 지표(퍼스트파티). 실제 구매 퍼널을 걸어 트래커가 page_view/scroll/cta_click을
 * 적재하는지, /admin/analytics가 그것을 표로 보여주는지 검증한다.
 *
 * 전역 in-memory 저장소는 병렬 스펙과 공유되므로 정확값 단언은 금지(F082/F083 패턴 —
 * 정밀 의미론은 tests/unit/analytics.test.ts 소관). 여기서는 ≥1 멤버십만 단언한다.
 * 비컨은 비동기 fire-and-forget이라 어드민 단언은 toPass 재시도로 감싼다.
 */

async function readCount(page: Page, testId: string): Promise<number> {
  const text = (await page.getByTestId(testId).textContent())?.trim() ?? "";
  const n = Number(text);
  return Number.isFinite(n) ? n : -1;
}

test.describe("전환 지표 (F092)", () => {
  test("구매 퍼널 완주 → 이벤트가 적재되고 /admin/analytics 퍼널·CTA·스크롤 표에 보인다", async ({ page }) => {
    await installTossMock(page, "success");

    // 홈: 페이지뷰 + 최하단 스크롤(임계 100%까지) + 히어로 CTA 클릭
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200); // scroll 이벤트 → 비컨 발화 여유
    await page.locator('[data-analytics="home_hero"]').click();
    await page.waitForURL("**/anniversary");

    // 카테고리: 템플릿 카드 클릭(cta_click template_card)
    await page.getByTestId("template-card").first().click();
    await page.waitForURL(/\/order\//);

    // 주문 위저드 → 장바구니 → 결제 완주(헬퍼가 실 CTA를 클릭하므로 order_next /
    // order_add_to_cart / cart_checkout / checkout_pay가 자연 발화한다)
    await addBirthToCart(page);
    await checkoutFromCart(page);
    await page.waitForURL(/\/orders\/ord_/);

    // 관리자로 확인 — 비컨 전달의 비동기성을 toPass 재시도로 흡수
    await loginAs(page, "admin+f092@example.com");
    await expect(async () => {
      await page.goto("/admin/analytics");
      // 퍼널: 각 단계에 이 세션이 최소 1로 잡힌다(전역 공유 저장소 — 멤버십만)
      for (const step of ["home", "category", "order_start", "add_to_cart", "cart", "checkout", "pay_click", "paid"]) {
        expect(await readCount(page, `admin-analytics-funnel-${step}-sessions`)).toBeGreaterThanOrEqual(1);
      }
      // CTA 클릭 수
      for (const cta of ["home_hero", "template_card", "order_add_to_cart", "cart_checkout", "checkout_pay"]) {
        expect(await readCount(page, `admin-analytics-cta-${cta}-clicks`)).toBeGreaterThanOrEqual(1);
      }
      // 홈 스크롤 100% 도달 세션
      expect(await readCount(page, "admin-analytics-scroll-home-100")).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 15_000 });
  });

  test("비로그인·비관리자는 /admin/analytics에서 404(존재 은닉)", async ({ page }) => {
    const anon = await page.goto("/admin/analytics");
    expect(anon?.status()).toBe(404);
    await loginAs(page, "buyer+f092@example.com");
    const nonAdmin = await page.goto("/admin/analytics");
    expect(nonAdmin?.status()).toBe(404);
  });

  test("닫힌 어휘 밖 페이로드는 204로 조용히 드롭된다(오류 오라클 없음)", async ({ request }) => {
    // 미지 kind / 미지 CTA / 미추적 경로 / 비JSON — 전부 204 (적재 여부의 정밀 의미론은 유닛 소관)
    const cases = [
      { kind: "hack", path: "/", sessionId: "s_zzzzzzzz" },
      { kind: "cta_click", name: "evil_cta", path: "/", sessionId: "s_zzzzzzzz" },
      { kind: "page_view", path: "/admin/orders", sessionId: "s_zzzzzzzz" },
    ];
    for (const body of cases) {
      const res = await request.post("/api/events", { data: body });
      expect(res.status()).toBe(204);
    }
    const raw = await request.post("/api/events", {
      headers: { "content-type": "text/plain" },
      data: "not-json{{{",
    });
    expect(raw.status()).toBe(204);
  });
});
