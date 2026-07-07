import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F062 — 구매자 취소 요청: PAID/IN_PRODUCTION에서만 사유와 함께 1회 접수(중복 no-op),
// SHIPPED 이후는 고객센터 안내. 관리자 목록 배지 + 상세 사유. 환불 집행은 F063.

test.describe("cancel request (F062)", () => {
  test("결제 완료 주문: mypage(회원 직행)에서 사유와 함께 접수 → 중복 불가 → 관리자 배지·사유", async ({ page }) => {
    const email = "cancelbuyer@example.com";
    const orderId = await completePaidOrder(page, { email });

    await loginAs(page, email);
    await page.goto(`/account/orders/${orderId}`);
    await expect(page.getByTestId("cancel-form")).toBeVisible();
    await page.getByTestId("cancel-reason").fill("아이 이름을 잘못 입력했어요");
    await page.getByTestId("cancel-submit").click();
    await expect(page.getByTestId("cancel-requested")).toBeVisible();
    await expect(page.getByTestId("cancel-form")).toHaveCount(0); // 접수 후 폼 소멸 = 중복 차단 UI

    await page.reload();
    await expect(page.getByTestId("cancel-requested")).toBeVisible(); // 영속 상태

    // mypage(세션 소유 직행)에도 동일 접수 상태가 보인다
    await page.goto(`/mypage/${orderId}`);
    await expect(page.getByTestId("cancel-requested")).toBeVisible();

    // 관리자: 목록 배지 + 상세 사유
    await page.goto("/account");
    await page.getByTestId("account-logout").click();
    await page.waitForURL("**/login");
    await loginAs(page, "admin+f062badge@example.com");
    await page.goto("/admin/orders");
    const row = page.getByTestId("admin-order-row").filter({ hasText: orderId });
    await expect(row.getByTestId("admin-cancel-badge")).toBeVisible();
    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByTestId("admin-order-cancel-request")).toContainText("아이 이름을 잘못 입력했어요");
  });

  test("배송중 이후 주문에는 취소 폼 대신 고객센터 안내가 보인다", async ({ page }) => {
    const email = "cancelshipped@example.com";
    const orderId = await completePaidOrder(page, { email });

    // 관리자가 배송중까지 전이
    await loginAs(page, "admin+f062ship@example.com");
    await page.goto(`/admin/orders/${orderId}`);
    await page.getByTestId("admin-move-in-production").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("제작중");
    await page.getByTestId("admin-tracking-carrier").fill("우체국택배");
    await page.getByTestId("admin-tracking-number").fill("9999-0000");
    await page.getByTestId("admin-move-shipped").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("배송중");

    // 구매자 시야: 폼 없음 + 안내문
    await page.goto("/account");
    await page.getByTestId("account-logout").click();
    await page.waitForURL("**/login");
    await loginAs(page, email);
    await page.goto(`/account/orders/${orderId}`);
    await expect(page.getByTestId("cancel-form")).toHaveCount(0);
    await expect(page.getByTestId("cancel-contact-cs")).toBeVisible();
  });
});
