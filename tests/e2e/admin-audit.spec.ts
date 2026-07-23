import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F073 — 관리자 감사 로그: 변이(전이·환불·상담확정)마다 행위자·대상·전후 상태를 append 기록하고
// /admin/audit에서 최신순 열람. ADR-0024 D2 — 구매자 PII(이름·이메일·주소)는 기록도 표시도 안 한다.

test.describe("admin audit log (F073)", () => {
  test("관리자 전이가 감사 로그에 남고, 구매자 PII는 기록되지 않는다", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "auditbuyer@example.com" });

    // 스펙별 고유 관리자(plus-address 폴백 패밀리) — 병렬 스펙 간 OTP 단일사용/발송캡 경합 방지
    await loginAs(page, "admin+f073audit@example.com");
    await page.goto(`/admin/orders/${orderId}`);
    await page.getByTestId("admin-move-in-production").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("제작중"); // PAID → IN_PRODUCTION

    await page.goto("/admin/audit");
    await expect(page.getByTestId("admin-audit")).toBeVisible();

    // 방금 전이한 주문의 감사 행: 액션·대상·전후 상태가 남는다
    const row = page.getByTestId("admin-audit-row").filter({ hasText: orderId });
    await expect(row).toBeVisible();
    await expect(row).toContainText("주문 전이");
    await expect(row).toContainText("PAID");
    await expect(row).toContainText("IN_PRODUCTION");
    await expect(row).toContainText("관리자"); // 행위자 식별자 열이 렌더된다

    // ADR-0024 D2 — 구매자명 등 PII가 감사 화면 어디에도 나오지 않는다(completePaidOrder 기본 구매자명)
    await expect(page.locator("body")).not.toContainText("김부모");
  });

  test("비로그인은 /admin/audit 404 (존재 은닉)", async ({ page }) => {
    const res = await page.goto("/admin/audit");
    expect(res?.status()).toBe(404);
  });
});
