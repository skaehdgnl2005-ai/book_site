import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { completePaidOrder, completeVirtualAccountOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F083 — 관리자 대시보드: /admin이 리다이렉트 대신 6타일 카운트 오버뷰를 렌더한다.
// 카운트는 서버 전역 상태라(F082 교훈) 이 E2E는 하한(≥ 내 기여분)·정수 형식만 단언하고,
// 강한 결정론 단언은 타일 클릭스루 멤버십(내가 만든 주문/의뢰가 필터된 목록에 보인다)으로
// 고정한다. '오늘 주문'의 KST 일경계·상태 의미론은 페이지가 소비하는 todayOrdersFilter
// (admin/_lib/dashboard.ts) 자체를 유닛(dashboard-counts.test.ts)이 결정론으로 고정.

async function tileCount(page: Page, key: string): Promise<number> {
  const text = (await page.getByTestId(`admin-dash-${key}-count`).innerText()).trim();
  expect(text).toMatch(/^\d+$/); // 빈 렌더(Number("")===0)도 잡는 엄격 형식 단언
  return Number(text);
}

/** F061 인테이크 그대로 API로 SUBMITTED 맞춤 의뢰 조성 (admin-custom.spec 선례). */
async function createSubmittedWritten(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/custom/written", {
    data: {
      contactName: "김의뢰",
      contactPhone: "010-1234-5678",
      contactEmail: "dash-custom@example.com",
      withdrawalConsent: true,
      answers: { protagonist: { name: "서연" } },
    },
  });
  expect(res.ok()).toBeTruthy();
  const { id } = (await res.json()) as { id: string };
  const confirm = await request.post("/api/custom/written/confirm", {
    data: { id, paymentKey: `test_pk_${id}` },
  });
  expect(confirm.ok()).toBeTruthy();
  return id;
}

test.describe("admin dashboard (F083)", () => {
  test("6타일 카운트(내 기여분 하한) + 타일 클릭스루가 필터된 목록에서 기여 건을 보인다", async ({
    page,
    request,
  }) => {
    // 결제 퍼널 3회(VA 1 + 카드 2) + 로그인 2회 + 전이 + 클릭스루 4회의 단일 시나리오 —
    // F082 실측(단독 ~29s > 기본 30s 예산)의 확장판이라 처음부터 명시 타임아웃.
    test.setTimeout(120_000);

    const vaOrder = await completeVirtualAccountOrder(page, { email: "dashva@example.com" }); // 입금 대기
    const cancelOrder = await completePaidOrder(page, { email: "dashbuyer@example.com" }); // 취소요청 예정
    const prodOrder = await completePaidOrder(page, { email: "dashother@example.com" }); // 제작중 예정

    // 구매자: 취소요청 접수
    await loginAs(page, "dashbuyer@example.com");
    await page.goto(`/account/orders/${cancelOrder}`);
    await page.getByTestId("cancel-reason").fill("디자인 변경 요청");
    await page.getByTestId("cancel-submit").click();
    await expect(page.getByTestId("cancel-requested")).toBeVisible();
    await page.goto("/account");
    await page.getByTestId("account-logout").click();
    await page.waitForURL("**/login");

    // 신규 맞춤 의뢰 (API 조성)
    const customId = await createSubmittedWritten(request);

    // 관리자: prodOrder를 제작중으로 전이 → 대시보드 검증
    await loginAs(page, "admin+f083dash@example.com");
    await page.goto(`/admin/orders/${prodOrder}`);
    await page.getByTestId("admin-move-in-production").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("제작중");

    await page.goto("/admin");
    await expect(page.getByTestId("admin-dashboard")).toBeVisible();
    // 내 기여분 하한: 오늘 주문(방금 만든 WFD+PAID+IN_PRODUCTION 3건 — KST 자정 횡단은 사실상 불가능한 창)
    expect(await tileCount(page, "today")).toBeGreaterThanOrEqual(3);
    expect(await tileCount(page, "waiting-deposit")).toBeGreaterThanOrEqual(1);
    expect(await tileCount(page, "cancel-queue")).toBeGreaterThanOrEqual(1);
    expect(await tileCount(page, "in-production")).toBeGreaterThanOrEqual(1);
    expect(await tileCount(page, "new-custom")).toBeGreaterThanOrEqual(1);
    expect(await tileCount(page, "shipped")).toBeGreaterThanOrEqual(0); // 무시드 — 형식만

    // 클릭스루 멤버십: 타일 → 필터된 목록에 기여 건이 실제로 보인다
    await page.getByTestId("admin-dash-waiting-deposit").getByRole("link").click();
    await page.waitForURL("**/admin/orders?status=WAITING_FOR_DEPOSIT");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: vaOrder })).toBeVisible();

    await page.goto("/admin");
    await page.getByTestId("admin-dash-cancel-queue").getByRole("link").click();
    await page.waitForURL("**/admin/orders?queue=cancel-requested");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: cancelOrder })).toBeVisible();

    await page.goto("/admin");
    await page.getByTestId("admin-dash-in-production").getByRole("link").click();
    await page.waitForURL("**/admin/orders?status=IN_PRODUCTION");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: prodOrder })).toBeVisible();

    await page.goto("/admin");
    await page.getByTestId("admin-dash-new-custom").getByRole("link").click();
    await page.waitForURL("**/admin/custom?status=SUBMITTED");
    await expect(page.getByTestId("admin-custom-row").filter({ hasText: customId })).toBeVisible();

    // 배송중 타일도 시드 후 클릭스루 (prodOrder를 SHIPPED로 — 6타일 중 5개 필터 타일 전수)
    await page.goto(`/admin/orders/${prodOrder}`);
    await page.getByTestId("admin-tracking-carrier").fill("우체국택배");
    await page.getByTestId("admin-tracking-number").fill("F083-0001");
    await page.getByTestId("admin-move-shipped").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("배송중");
    await page.goto("/admin");
    expect(await tileCount(page, "shipped")).toBeGreaterThanOrEqual(1);
    await page.getByTestId("admin-dash-shipped").getByRole("link").click();
    await page.waitForURL("**/admin/orders?status=SHIPPED");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: prodOrder })).toBeVisible();

    // 오늘 주문 타일은 집계 전용 — 전체 주문 목록으로 진입한다(화면 문구와 동일 계약)
    await page.goto("/admin");
    await page.getByTestId("admin-dash-today").getByRole("link").click();
    await page.waitForURL("**/admin/orders");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: prodOrder })).toBeVisible();
  });

  test("비관리자·비로그인 /admin은 여전히 404 — 리다이렉트→렌더 교체 후에도 존재 은닉 유지", async ({ page }) => {
    const anon = await page.goto("/admin");
    expect(anon?.status()).toBe(404);

    await loginAs(page, "dash-member@example.com");
    const member = await page.goto("/admin");
    expect(member?.status()).toBe(404);
  });
});
