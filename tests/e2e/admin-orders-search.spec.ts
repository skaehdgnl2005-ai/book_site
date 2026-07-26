import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F090 — 검색. id는 전역 유일이라 q=<id>는 병렬 스위트에서도 정확히 1행(결정론);
// 이름 검색("김부모"는 공용 시드값)은 멤버십만 단언.

test.describe("admin orders search (F090)", () => {
  test("주문번호 정확 · 이메일/이름 부분(case-insensitive) · 교집합 · 0건", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "f090-search@example.com" });
    await loginAs(page, "admin+f090search@example.com");

    // 검색 폼 경로: input → submit → q= 반영
    await page.goto("/admin/orders");
    await page.getByTestId("admin-search-input").fill(orderId);
    await page.getByTestId("admin-search-submit").click();
    await page.waitForURL(/q=/);
    await expect(page.getByTestId("admin-order-row")).toHaveCount(1); // id 유일 — 정확히 1행
    await expect(page.getByTestId("admin-order-row")).toContainText(orderId);

    // 이메일 부분 일치, 대소문자 무시
    await page.goto("/admin/orders?q=F090-SEARCH");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toBeVisible();

    // 구매자명 부분 일치 (멤버십만 — 김부모는 공용 시드)
    await page.goto("/admin/orders?q=부모");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toBeVisible();

    // 기존 필터와 교집합 — PAID 주문은 CANCELLED 필터 아래에선 검색돼도 0건
    await page.goto(`/admin/orders?status=CANCELLED&q=${orderId}`);
    await expect(page.getByTestId("admin-order-row")).toHaveCount(0);
    await expect(page.getByTestId("admin-orders-empty")).toBeVisible();

    // 0건 빈 상태
    await page.goto("/admin/orders?q=no-such-order-xyz-0090");
    await expect(page.getByTestId("admin-orders-empty")).toBeVisible();
  });
});
