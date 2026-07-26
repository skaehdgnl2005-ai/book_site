import { test, expect, type Page } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F088 — 테이블 + 페이지네이션. 정확 카운트·페이지 수 산출은 유닛 소관(전역 상태 — F082/F083
// 패턴); E2E는 렌더·멤버십·필터 보존만 단언. 시드는 결제 퍼널이 아닌 create API 직접 호출
// (hermetic: dev-auth 하에서 per-IP rate limit은 enforceRateLimit이 전면 바이패스).

async function seedCreatedOrder(page: Page, email: string): Promise<string> {
  const res = await page.request.post("/api/payments/create", {
    data: {
      buyerName: "김부모",
      buyerEmail: email,
      shipName: "김수취",
      shipPhone: "010-2222-3333",
      shipZip: "04524",
      shipAddress: "서울특별시 중구 세종대로 110",
      withdrawalConsent: true,
      lines: [
        {
          templateKey: "birth",
          coverType: "SOFT",
          personalization: { childName: "도윤", childGender: "MALE", extraVar: null },
        },
      ],
    },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { orderId: string }).orderId;
}

test.describe("admin orders table + pagination (F088)", () => {
  test("테이블(주문일·주문·상태·금액) 렌더 + 행 링크로 상세 진입", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "f088-table@example.com" });
    await loginAs(page, "admin+f088table@example.com");
    await page.goto("/admin/orders");
    await expect(page.getByTestId("admin-orders")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "주문일" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "금액" })).toBeVisible();
    const row = page.getByTestId("admin-order-row").filter({ hasText: orderId });
    await expect(row).toContainText("결제 완료");
    await expect(row).toContainText("43,000원");
    await row.getByTestId("admin-order-link").click();
    await page.waitForURL(`**/admin/orders/${orderId}`);
  });

  test("51건 이상이면 페이저 — 다음 페이지 이동, 필터 보존", async ({ page }) => {
    test.setTimeout(120_000); // 51건 API 시드 (F082 선례 — 구조적 예산 명시)
    for (let i = 0; i < 51; i++) await seedCreatedOrder(page, `f088-page-${i}@example.com`);
    await loginAs(page, "admin+f088paging@example.com");

    // 시드는 전부 CREATED에 머문다(퍼널 미진행) — status=CREATED 뷰는 항상 ≥51건.
    await page.goto("/admin/orders?status=CREATED");
    await expect(page.getByTestId("admin-orders-pager")).toBeVisible();
    await expect(page.getByTestId("admin-page-indicator")).toHaveText(/^1 \/ \d+$/);
    await expect(page.getByTestId("admin-order-row")).toHaveCount(50); // 페이지 컷

    await page.getByTestId("admin-page-next").click();
    // 목적지에서만 참인 패턴을 기다린다 — /status=CREATED/는 1페이지 URL에도 이미 참이라
    // 내비게이션 전에 통과해 버린다(레이스).
    await page.waitForURL(/[?&]page=2\b/);
    const next = new URL(page.url());
    expect(next.searchParams.get("page")).toBe("2");
    expect(next.searchParams.get("status")).toBe("CREATED"); // 필터 보존
    await expect(page.getByTestId("admin-page-indicator")).toHaveText(/^2 \/ \d+$/);
    await expect(page.getByTestId("admin-order-row").first()).toBeVisible(); // 2페이지에도 행
  });
});
