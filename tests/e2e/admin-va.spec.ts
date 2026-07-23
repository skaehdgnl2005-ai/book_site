import { test, expect } from "@playwright/test";
import { completeVirtualAccountOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F078 — 입금대기(가상계좌) 운영. 관리자 상세에 발급 계좌·기한(KST)·만료 여부가 보이고, 미입금 종료는
// ① 기한 만료분만(depositDueDate < now) ② 대상 바인딩 승인 토큰(order.close_unpaid_va) ③ 감사 기록의
// 3중 게이트 뒤에서만 CANCELLED로 종료된다. 기한 전 종료는 서버가 거부한다(은행 비동기 입금과의 경합
// 봉쇄 — 레드팀 치명 교정). 뒤늦은 입금 감지(LATE_DEPOSIT + system 감사)는 va-ops.test.ts 유닛 소관.

test.describe("admin 입금대기(VA) 운영 (F078)", () => {
  test("만료 주문: VA 정보 렌더 → 잘못된 토큰 거부 → 대상 바인딩 토큰으로 종료 → 감사 기록", async ({ page }) => {
    const orderId = await completeVirtualAccountOrder(page, { email: "f078expired@example.com", expired: true });

    // 스펙별 고유 관리자(plus-address 폴백 패밀리) — 병렬 스펙 간 OTP 단일사용/발송캡 경합 방지
    await loginAs(page, "admin+f078va@example.com");
    await page.goto(`/admin/orders/${orderId}`);

    // 발급 가상계좌 정보가 관리자 상세에 렌더된다 (은행·계좌·기한 KST·만료 여부)
    await expect(page.getByTestId("admin-order-status")).toHaveText("입금 대기");
    await expect(page.getByTestId("admin-va-account")).toContainText("우리은행");
    await expect(page.getByTestId("admin-va-account")).toContainText("56001234567890");
    await expect(page.getByTestId("admin-va-due")).toContainText("KST");
    await expect(page.getByTestId("admin-va-due")).toContainText("기한 만료");

    // 다른 액션의 DEV 토큰은 거부된다 (토큰은 액션+대상 바인딩 — F076)
    await page.getByTestId("va-close-approval-token").fill(`DEV:toss.refund.live:${orderId}`);
    await page.getByTestId("va-close-submit").click();
    await expect(page.getByTestId("va-close-error")).toContainText("승인 토큰이 필요합니다");
    await expect(page.getByTestId("admin-order-status")).toHaveText("입금 대기"); // 아무것도 안 움직였다

    // 올바른 대상 바인딩 토큰 → 종료(CANCELLED)
    await page.getByTestId("va-close-approval-token").fill(`DEV:order.close_unpaid_va:${orderId}`);
    await page.getByTestId("va-close-submit").click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("취소됨");

    // 감사 로그: 행위자·액션·전후 상태가 남는다 (PII 없음 — F073 규율)
    await page.goto("/admin/audit");
    const row = page.getByTestId("admin-audit-row").filter({ hasText: orderId });
    await expect(row).toBeVisible();
    await expect(row).toContainText("미입금 종료");
    await expect(row).toContainText("WAITING_FOR_DEPOSIT");
    await expect(row).toContainText("CANCELLED");
  });

  test("기한 전 주문: 올바른 토큰이라도 종료가 서버에서 거부된다 (무게이트 취소 봉쇄)", async ({ page }) => {
    const orderId = await completeVirtualAccountOrder(page, { email: "f078active@example.com" });

    await loginAs(page, "admin+f078va2@example.com");
    await page.goto(`/admin/orders/${orderId}`);

    await expect(page.getByTestId("admin-va-due")).toContainText("기한 전");

    // 게이트 순서 계약: 만료 게이트가 승인 게이트보다 먼저다 — 잘못된 토큰이어도 "기한 전" 에러가
    // 나와야 한다(토큰만 바꾸면 될 것처럼 오도하지 않음; worker≠checker 적대 리뷰 확정 건).
    await page.getByTestId("va-close-approval-token").fill(`DEV:toss.refund.live:${orderId}`);
    await page.getByTestId("va-close-submit").click();
    await expect(page.getByTestId("va-close-error")).toContainText("기한이 지나기 전에는 종료할 수 없습니다");

    // 올바른 대상 바인딩 토큰이라도 기한 전에는 동일하게 거부된다
    await page.getByTestId("va-close-approval-token").fill(`DEV:order.close_unpaid_va:${orderId}`);
    await page.getByTestId("va-close-submit").click();
    await expect(page.getByTestId("va-close-error")).toContainText("기한이 지나기 전에는 종료할 수 없습니다");
    await expect(page.getByTestId("admin-order-status")).toHaveText("입금 대기"); // 여전히 입금을 기다린다
  });
});
