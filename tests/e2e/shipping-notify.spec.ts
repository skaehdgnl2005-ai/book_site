import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F068 — 배송 알림 + 택배 조회 딥링크. 발송 이메일은 서버 side-effect(비프로덕션 mock outbox,
// order_confirmation 선례처럼 유닛에서 composeEmail 검증) — 여기서는 사용자 대면 표면인
// 택배사별 조회 URL 딥링크를 관리자·구매자 화면 전부에서 검증한다.

test.describe("shipping notification + tracking deep-link (F068)", () => {
  test("배송중 전이 후 운송장이 택배사 조회 링크로 (관리자·/account·/mypage)", async ({ page }) => {
    const email = "f068buyer@example.com";
    const orderId = await completePaidOrder(page, { email });

    // 관리자: 제작중 → 배송중(운송장 CJ대한통운)
    await loginAs(page, "admin+f068@example.com");
    await page.goto(`/admin/orders/${orderId}`);
    await page.getByTestId("admin-move-in-production").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("제작중");
    await page.getByTestId("admin-tracking-carrier").fill("CJ대한통운");
    await page.getByTestId("admin-tracking-number").fill("6012345678901");
    await page.getByTestId("admin-move-shipped").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("배송중");

    // 관리자 화면 딥링크
    const adminLink = page.getByTestId("admin-order-tracking").getByTestId("tracking-link");
    await expect(adminLink).toHaveText("CJ대한통운 6012345678901");
    await expect(adminLink).toHaveAttribute("href", /cjlogistics\.com.*6012345678901/);

    // 구매자(회원) 시야: /account 주문 상세 — 로그아웃 후 구매 이메일로 로그인(F057 claim)
    await page.goto("/account");
    await page.getByTestId("account-logout").click();
    await page.waitForURL("**/login");
    await loginAs(page, email);
    await page.getByTestId("account-order-link").filter({ hasText: orderId }).click();
    const accountLink = page.getByTestId("account-order-tracking").getByTestId("tracking-link");
    await expect(accountLink).toBeVisible();
    await expect(accountLink).toHaveAttribute("href", /cjlogistics\.com.*6012345678901/);
    await expect(accountLink).toHaveAttribute("target", "_blank");
    await expect(accountLink).toHaveAttribute("rel", /noopener/);

    // 마이페이지(세션 소유 — OTP 없이 진입, F057)에서도 딥링크
    await page.goto(`/mypage/${orderId}`);
    const mypageLink = page.getByTestId("mypage-tracking").getByTestId("tracking-link");
    await expect(mypageLink).toHaveAttribute("href", /cjlogistics\.com.*6012345678901/);
  });

  test("등록되지 않은 택배사는 링크 없이 텍스트로만 표시된다", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "f068unknown@example.com" });

    await loginAs(page, "admin+f068unknown@example.com");
    await page.goto(`/admin/orders/${orderId}`);
    await page.getByTestId("admin-move-in-production").click();
    await page.getByTestId("admin-tracking-carrier").fill("동네퀵서비스");
    await page.getByTestId("admin-tracking-number").fill("999888777");
    await page.getByTestId("admin-move-shipped").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("배송중");

    // 운송장 정보는 보이되 클릭 링크는 없음(정직한 폴백)
    await expect(page.getByTestId("admin-order-tracking")).toContainText("동네퀵서비스 999888777");
    await expect(page.getByTestId("admin-order-tracking").getByTestId("tracking-link")).toHaveCount(0);
  });
});
