import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F060 — 관리자 상태 전이(전이표 가드 + 조건부 쓰기) + SHIPPED 운송장. 구매자 노출은
// /account 상세(회원)에서 확인. F054의 canTransition/transition은 유닛에서 전수 검증 —
// 여기서는 사용자 대면 플로우 전체를 밟는다.

test.describe("admin transitions (F060)", () => {
  test("PAID → 제작중 → 배송중(운송장) → 배송 완료 — 구매자 화면에 운송장이 보인다", async ({ page }) => {
    const email = "shipbuyer@example.com";
    const orderId = await completePaidOrder(page, { email });

    await loginAs(page, "admin+f060main@example.com");
    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByTestId("admin-order-status")).toHaveText("결제 완료");

    await page.getByTestId("admin-move-in-production").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("제작중");

    await page.getByTestId("admin-tracking-carrier").fill("CJ대한통운");
    await page.getByTestId("admin-tracking-number").fill("1234-5678-9012");
    await page.getByTestId("admin-move-shipped").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("배송중");
    await expect(page.getByTestId("admin-order-tracking")).toContainText("CJ대한통운 1234-5678-9012");

    await page.getByTestId("admin-move-completed").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("배송 완료");
    await expect(page.getByTestId("admin-move-in-production")).toHaveCount(0); // terminal — no forward move

    // 구매자(회원) 시야: 주문 상세에 상태 + 운송장
    await page.goto("/account");
    await page.getByTestId("account-logout").click();
    await page.waitForURL("**/login");
    await loginAs(page, email);
    await page.getByTestId("account-order-link").filter({ hasText: orderId }).click();
    await expect(page.getByTestId("account-order-status")).toHaveText("배송 완료");
    await expect(page.getByTestId("account-order-tracking")).toContainText("1234-5678-9012");
  });

  test("운송장 없이 배송중 전이는 거부된다 (상태 불변)", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "shipfail@example.com" });

    await loginAs(page, "admin+f060guard@example.com");
    await page.goto(`/admin/orders/${orderId}`);
    await page.getByTestId("admin-move-in-production").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("제작중");

    await page.getByTestId("admin-move-shipped").click(); // 운송장 비움
    await expect(page.getByTestId("admin-move-error")).toBeVisible();
    await expect(page.getByTestId("admin-order-status")).toHaveText("제작중"); // unchanged
  });
});
