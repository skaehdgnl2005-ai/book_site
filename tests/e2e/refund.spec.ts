import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F063 — 환불 집행: requireApproval(toss.refund.live) default-deny 게이트 → Toss cancel
// (비프로덕션 sandbox가 CANCELED 승인) → REFUNDED 전이 → 구매자 화면 반영. 전액 취소만.
// Toss 게이트웨이 호출의 멱등(Idempotency-Key)·상태 매핑은 유닛(payments.test.ts) 전수.

test.describe("refund (F063)", () => {
  test("취소 요청 주문: 토큰 없이 거부 → 발급 토큰으로 환불 → REFUNDED → 구매자에게 환불 완료", async ({ page }) => {
    const email = "refundbuyer@example.com";
    const orderId = await completePaidOrder(page, { email });

    // 구매자: 취소 요청 접수
    await loginAs(page, email);
    await page.goto(`/account/orders/${orderId}`);
    await page.getByTestId("cancel-reason").fill("단순 변심");
    await page.getByTestId("cancel-submit").click();
    await expect(page.getByTestId("cancel-requested")).toBeVisible();
    await page.goto("/account");
    await page.getByTestId("account-logout").click();
    await page.waitForURL("**/login");

    // 관리자: 토큰 없이 → default-deny (상태 불변)
    await loginAs(page, "admin+f063main@example.com");
    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByTestId("refund-panel")).toBeVisible();
    await page.getByTestId("refund-submit").click();
    await expect(page.getByTestId("refund-error")).toBeVisible();
    await expect(page.getByTestId("admin-order-status")).toHaveText("결제 완료");

    // `pnpm approve toss.refund.live` 발급 토큰(고정 계약: APPROVED:<action>)으로만 실행
    await page.getByTestId("refund-approval-token").fill("APPROVED:toss.refund.live");
    await page.getByTestId("refund-submit").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("환불 완료");
    await expect(page.getByTestId("refund-panel")).toHaveCount(0); // terminal — no re-refund surface

    // 구매자 시야: 내 주문 상세가 환불 완료를 보인다
    await page.goto("/account");
    await page.getByTestId("account-logout").click();
    await page.waitForURL("**/login");
    await loginAs(page, email);
    await page.goto(`/account/orders/${orderId}`);
    await expect(page.getByTestId("account-order-status")).toHaveText("환불 완료");
    await expect(page.getByTestId("cancel-form")).toHaveCount(0); // 환불된 주문에 취소 요청 없음
  });

  test("배송중(SHIPPED) 주문에는 환불 패널 자체가 없다 (전이표: SHIPPED→REFUNDED 불허)", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "refundship@example.com" });

    await loginAs(page, "admin+f063guard@example.com");
    await page.goto(`/admin/orders/${orderId}`);
    await page.getByTestId("admin-move-in-production").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("제작중");
    await expect(page.getByTestId("refund-panel")).toBeVisible(); // IN_PRODUCTION은 아직 환불 가능

    await page.getByTestId("admin-tracking-carrier").fill("CJ대한통운");
    await page.getByTestId("admin-tracking-number").fill("1111-2222");
    await page.getByTestId("admin-move-shipped").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("배송중");
    await expect(page.getByTestId("refund-panel")).toHaveCount(0); // 배송 후엔 온라인 환불 불가
  });
});
