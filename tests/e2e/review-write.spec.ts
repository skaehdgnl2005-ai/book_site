import { test, expect } from "@playwright/test";
import { completePaidOrder, createUnpaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F071 — 구매 인증 후기. 결제 완료 구매자가 마이페이지에서 별점+후기를 작성하면 /reviews 목록에
// 표시된다. 작성 권한은 hasOrderAccess(주문 소유) — 회원은 게스트 주문을 로그인 시 claim(F057).
// /reviews의 F026 계약("준비 중" + 80% 베타 신호)은 reviews.spec.ts에서 별도로 보존 검증.

test.describe("purchase-verified reviews (F071)", () => {
  test("결제 완료 구매자의 후기가 /reviews 목록에 별점과 함께 표시되고, 주문당 1개만 작성된다", async ({ page }) => {
    const email = "f071buyer@example.com";
    const orderId = await completePaidOrder(page, { email });
    await loginAs(page, email); // 게스트 주문 소급 claim → 회원 소유 → 마이페이지 세션 진입

    await page.goto(`/mypage/${orderId}`);
    await page.getByTestId("review-rating-5").check();
    await page.getByTestId("review-body").fill("아이가 자기 이름이 나온 책을 정말 좋아해요. 선물로 완벽했어요.");
    await page.getByTestId("review-author").fill("도윤맘");
    await page.getByTestId("review-submit").click();
    await expect(page.getByTestId("review-success")).toBeVisible();

    // /reviews 목록에 별점·표시이름과 함께 노출 + 후기 운영정책 고지
    await page.goto("/reviews");
    const item = page.getByTestId("review-item").filter({ hasText: "아이가 자기 이름이" });
    await expect(item).toBeVisible();
    await expect(item).toContainText("도윤맘");
    await expect(item).toContainText("★★★★★");
    // 게시된 후기의 산술 평균 평점(운영정책 등급 기준이 고지하는 표시값)
    await expect(page.getByTestId("review-average")).toContainText("평균");
    await expect(page.getByTestId("review-average")).toContainText("5.0");
    const policy = page.getByTestId("review-policy");
    await expect(policy).toContainText("작성 권한");
    await expect(policy).toContainText("삭제");
    await expect(policy).toContainText("이의 제기");
    await expect(policy).toContainText("2026-07-21");

    // 주문당 1개: 다시 마이페이지에 오면 작성 폼 대신 감사 안내(중복 작성 불가)
    await page.goto(`/mypage/${orderId}`);
    await expect(page.getByTestId("review-done")).toBeVisible();
    await expect(page.getByTestId("review-form")).toHaveCount(0);
  });

  test("빈 후기 내용은 거부된다(형태 검증)", async ({ page }) => {
    const email = "f071empty@example.com";
    const orderId = await completePaidOrder(page, { email });
    await loginAs(page, email);
    await page.goto(`/mypage/${orderId}`);
    await page.getByTestId("review-rating-4").check();
    // body 미입력 → 제출
    await page.getByTestId("review-submit").click();
    await expect(page.getByTestId("review-error")).toBeVisible();
  });

  test("결제되지 않은 주문에는 후기 작성 폼이 노출되지 않는다(구매 인증 게이트)", async ({ page }) => {
    // createUnpaidOrder는 기본 이메일(parent@example.com)로 CREATED(미결제) 주문을 만든다.
    const orderId = await createUnpaidOrder(page);
    await loginAs(page, "parent@example.com"); // 게스트 주문 소급 claim → 회원 소유(마이페이지 진입 가능)
    await page.goto(`/mypage/${orderId}`);
    await expect(page.getByTestId("mypage-not-paid")).toBeVisible(); // 결제 대기 안내
    await expect(page.getByTestId("review-form")).toHaveCount(0); // 구매 인증 전엔 작성 폼 없음
    await expect(page.getByTestId("review-submit")).toHaveCount(0);
  });
});
