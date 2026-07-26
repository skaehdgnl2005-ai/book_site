import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F089 — 기간 필터 + 합계줄. KST 경계·전량 합계의 정확값은 유닛 소관(resolvePeriod·sumAmount);
// E2E는 멤버십(기간 안/밖)·형식·교집합만 단언 (F082/F083 패턴).

test.describe("admin orders period filter + sum (F089)", () => {
  test("프리셋·직접 지정·합계줄·상태 교집합", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "f089-period@example.com" });
    await loginAs(page, "admin+f089period@example.com");

    // 프리셋 '오늘' — 방금 만든 주문은 기간 안 (링크 클릭 경로)
    await page.goto("/admin/orders");
    await page.getByTestId("admin-range-today").click();
    await page.waitForURL(/range=today/);
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toBeVisible();
    await expect(page.getByTestId("admin-orders-summary")).toHaveText(/^총 \d+건 · [\d,]+원$/);

    // 직접 지정: 과거 창(2000년) — 어떤 주문도 없다 (병렬 스위트에서도 결정론)
    await page.goto("/admin/orders?from=2000-01-01&to=2000-01-02");
    await expect(page.getByTestId("admin-order-row")).toHaveCount(0);
    await expect(page.getByTestId("admin-orders-summary")).toHaveText("총 0건 · 0원");
    await expect(page.getByTestId("admin-orders-empty")).toBeVisible();

    // 종료일 포함: 오늘을 종료일로 지정하면 오늘 주문이 잡힌다 (KST 정확 경계는 유닛)
    const kstToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    await page.goto(`/admin/orders?from=2000-01-01&to=${kstToday}`);
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toBeVisible();

    // 상태 × 기간 교집합
    await page.goto("/admin/orders?status=PAID&range=today");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toBeVisible();
    await page.goto("/admin/orders?status=CANCELLED&range=today");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toHaveCount(0);
  });
});
