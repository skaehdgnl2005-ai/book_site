import { test, expect } from "@playwright/test";
import { completeVirtualAccountOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F070 — 가상계좌(무통장입금). 가상계좌 결제는 즉시 정산되지 않고 입금 대기(WAITING_FOR_DEPOSIT)
// 상태로 주문이 생성되며, 발급된 계좌·기한이 안내된다. 실제 입금 완료(→PAID)는 입금통보 웹훅이
// 처리(webhook.test.ts / order-status.test.ts 유닛에서 검증) — 여기서는 사용자 대면 입금 안내를 본다.

test.describe("virtual account 무통장입금 (F070)", () => {
  test("가상계좌 결제 → 입금 대기 주문 + 계좌·기한·현금영수증 안내", async ({ page }) => {
    const orderId = await completeVirtualAccountOrder(page, { email: "f070buyer@example.com" });
    expect(orderId).toMatch(/^ord_/);

    // 입금 대기 상태(정산 아님)
    await expect(page.getByTestId("order-status")).toHaveText("WAITING_FOR_DEPOSIT");
    await expect(page.getByRole("heading", { name: "입금을 기다리고 있어요" })).toBeVisible();
    // 결제 완료 카피는 나오지 않는다(입금 전)
    await expect(page.getByText("주문이 완료되었어요")).toHaveCount(0);

    // 발급된 가상계좌 안내
    const deposit = page.getByTestId("order-deposit");
    await expect(deposit).toBeVisible();
    await expect(page.getByTestId("order-deposit-bank")).toHaveText("우리은행");
    await expect(page.getByTestId("order-deposit-account")).toHaveText("56001234567890");
    await expect(page.getByTestId("order-deposit-due")).not.toHaveText("-");
    await expect(deposit).toContainText("43,000원");
    await expect(deposit).toContainText("현금영수증");
  });

  test("입금 대기 주문 상세는 375px에서 가로 오버플로가 없다 (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await completeVirtualAccountOrder(page, { email: "f070mobile@example.com" });
    await expect(page.getByTestId("order-deposit")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("/account·/mypage에도 입금 안내가 보이고, 입금 전엔 마무리가 열리지 않는다", async ({ page }) => {
    const email = "f070member@example.com";
    const orderId = await completeVirtualAccountOrder(page, { email });
    // 구매 이메일로 로그인 → 게스트 주문 소급 claim(F057) → 회원 소유
    await loginAs(page, email);

    // /account 주문 상세: 입금 안내 + 마무리 CTA 부재(입금 전 정산 아님)
    await page.goto(`/account/orders/${orderId}`);
    await expect(page.getByTestId("account-order-status")).toHaveText("입금 대기");
    await expect(page.getByTestId("order-deposit")).toBeVisible();
    await expect(page.getByTestId("order-deposit-account")).toHaveText("56001234567890");
    await expect(page.getByTestId("account-order-finish")).toHaveCount(0);

    // /mypage 주문 상세(세션 소유 진입, OTP 불필요): 입금 안내 + 마무리 폼 부재
    await page.goto(`/mypage/${orderId}`);
    await expect(page.getByTestId("order-deposit")).toBeVisible();
    await expect(page.getByTestId("mypage-not-paid")).toHaveCount(0); // WFD 분기(결제 대기 문구 아님)
  });
});
