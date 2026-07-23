import { test, expect, type Page } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F082 — 취소요청 큐: /admin/orders의 '취소요청' 필터(처리 대기 = 요청 접수 + status ∈
// PAID/IN_PRODUCTION) + take 50 컷과 분리된 전량 카운트 배지. 환불(REFUNDED)이 실행되면
// 큐에서 빠지고, 처리 완료 건은 REFUNDED 상태 필터로 조회한다 — 의미론 고정.
// 카운트는 서버 전역 상태라 이 E2E는 멤버십(내 주문의 큐 진입/이탈)과 배지의 형식(정수·
// 하한)만 단언한다 — 정확한 건수 증감(±1)은 fullyParallel 스위트에서 타 스펙(cancel-request·
// refund)의 구매자측 큐 변이와 교차해 결정론이 없으므로 유닛(cancel-queue.test.ts)이 고정한다
// (worker≠checker CONFIRMED major의 교정).

async function logout(page: Page): Promise<void> {
  await page.goto("/account");
  await page.getByTestId("account-logout").click();
  await page.waitForURL("**/login");
}

async function queueCount(page: Page): Promise<number> {
  const text = await page.getByTestId("admin-cancel-queue-count").innerText();
  const n = Number(text);
  expect(Number.isInteger(n)).toBe(true); // 배지는 항상 정수 전량 카운트
  return n;
}

test.describe("admin cancel-request queue (F082)", () => {
  test("취소요청 필터: 요청 건만 노출·배지 건수 → 환불 시 큐에서 제거·건수 감소 → REFUNDED 필터로 조회", async ({
    page,
  }) => {
    // 결제 퍼널 2회 + 로그인 2회 + 환불 + 필터 왕복의 단일 시나리오(카운트 델타의 원자성 유지) —
    // 단독 실행도 ~29s라 기본 30s 예산이 구조적으로 부족(perf.spec 선례의 명시 타임아웃).
    test.setTimeout(90_000);
    const buyer = "queuebuyer@example.com";
    const orderA = await completePaidOrder(page, { email: buyer }); // 취소요청 예정
    const orderB = await completePaidOrder(page, { email: "queueother@example.com" }); // 요청 없음

    // 구매자: A에 취소요청 접수
    await loginAs(page, buyer);
    await page.goto(`/account/orders/${orderA}`);
    await page.getByTestId("cancel-reason").fill("배송지를 잘못 입력했어요");
    await page.getByTestId("cancel-submit").click();
    await expect(page.getByTestId("cancel-requested")).toBeVisible();
    await logout(page);

    // 관리자: 전체 목록에는 A·B 모두, 큐 필터에는 A만
    await loginAs(page, "admin+f082q@example.com");
    await page.goto("/admin/orders");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderA })).toBeVisible();
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderB })).toBeVisible();
    const n1 = await queueCount(page);
    expect(n1).toBeGreaterThanOrEqual(1); // 최소 A가 처리 대기

    await page.getByTestId("admin-filter-cancel-requested").click();
    await page.waitForURL("**/admin/orders?queue=cancel-requested");
    const rowA = page.getByTestId("admin-order-row").filter({ hasText: orderA });
    await expect(rowA).toBeVisible();
    await expect(rowA.getByTestId("admin-cancel-badge")).toBeVisible(); // 행 배지(F062) 무회귀
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderB })).toHaveCount(0);

    // 환불 실행(F063 게이트: 대상 바인딩 DEV 토큰) → 처리 완료
    await page.goto(`/admin/orders/${orderA}`);
    await expect(page.getByTestId("refund-panel")).toBeVisible();
    await page.getByTestId("refund-approval-token").fill(`DEV:toss.refund.live:${orderA}`);
    await page.getByTestId("refund-submit").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("환불 완료");

    // 큐 의미론 고정: 환불된 A는 큐에서 빠진다 (정확한 -1 증감은 유닛이 결정론으로 고정)
    await page.goto("/admin/orders?queue=cancel-requested");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderA })).toHaveCount(0);
    await queueCount(page); // 배지는 여전히 정수 전량 카운트로 렌더된다 (형식 단언)

    // 처리 완료 건의 조회 경로는 REFUNDED 상태 필터
    await page.getByTestId("admin-filter-REFUNDED").click();
    await page.waitForURL("**/admin/orders?status=REFUNDED");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderA })).toBeVisible();
  });
});
