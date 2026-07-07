import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F059 (ADR-0024) — /admin: 전역 세션 + ADMIN_EMAILS allowlist(비프로덕션 결정 폴백
// admin@example.com), 실패는 404(존재 은닉). 주문 목록(상태 필터)·상세(구매자·배송지·품목·결제).

test.describe("admin orders (F059)", () => {
  test("비관리자·비로그인은 404 — /admin의 존재가 드러나지 않는다", async ({ page }) => {
    const anon = await page.goto("/admin/orders");
    expect(anon?.status()).toBe(404);

    await loginAs(page, "regular-member@example.com");
    const member = await page.goto("/admin/orders");
    expect(member?.status()).toBe(404);
  });

  test("관리자는 주문 목록·상세(구매자/배송지/품목/결제)를 본다", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "adminview@example.com" });

    // 스펙별 고유 관리자(plus-address 폴백 패밀리) — 병렬 스펙 간 OTP 단일사용/발송캡 경합 방지
    await loginAs(page, "admin+f059detail@example.com");
    await page.goto("/admin/orders");
    await expect(page.getByTestId("admin-orders")).toBeVisible();
    const row = page.getByTestId("admin-order-row").filter({ hasText: orderId });
    await expect(row).toBeVisible();
    await expect(row).toContainText("결제 완료");

    await row.getByTestId("admin-order-link").click();
    await page.waitForURL(`**/admin/orders/${orderId}`);
    await expect(page.getByTestId("admin-order-status")).toHaveText("결제 완료");
    await expect(page.getByTestId("admin-order-buyer")).toContainText("김부모");
    await expect(page.getByTestId("admin-order-buyer")).toContainText("adminview@example.com");
    await expect(page.getByTestId("admin-order-shipping")).toContainText("김수취");
    await expect(page.getByTestId("admin-order-shipping")).toContainText("세종대로");
    await expect(page.locator("body")).toContainText("탄생"); // 품목
    await expect(page.locator("body")).toContainText("43,000원");
  });

  test("상태 필터가 목록을 좁힌다", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "adminfilter@example.com" });

    await loginAs(page, "admin+f059filter@example.com");
    await page.goto("/admin/orders?status=PAID");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toBeVisible();

    await page.getByTestId("admin-filter-CANCELLED").click();
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toHaveCount(0);
  });
});
