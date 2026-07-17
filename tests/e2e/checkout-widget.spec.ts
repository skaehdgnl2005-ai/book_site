import { test, expect } from "@playwright/test";
import {
  installTossMock,
  installFailingWidgetMock,
  addBirthToCart,
  checkoutFromCart,
  completePaidOrder,
  capturedTossRequest,
} from "./_helpers/tossMock";

// F069 — TossPayments 결제위젯 전환. 엔트리 체크아웃이 결제창(method:CARD 단일 수단)에서 결제위젯으로
// 바뀌어 카드 + 간편결제(네이버·카카오·토스페이)가 위젯에서 선택 가능해진다. 서버(create/confirm/webhook)는
// 수단 불문 재사용 — 결제 성공 경로가 그대로 PAID로 수렴하는지 확인한다.

test.describe("checkout payment widget — 간편결제 노출 (F069)", () => {
  test("결제위젯이 렌더되어 간편결제 수단 + 약관 UI가 노출되고 결제 버튼이 활성화된다", async ({ page }) => {
    await installTossMock(page, "abandon");
    await addBirthToCart(page);
    await page.getByTestId("cart-checkout").click();
    await page.waitForURL("**/checkout");

    // 결제수단 위젯: 카드 + 간편결제(네이버·카카오·토스페이)
    const methods = page.getByTestId("toss-payment-methods");
    await expect(methods).toBeVisible();
    await expect(methods).toContainText("카카오페이");
    await expect(methods).toContainText("네이버페이");
    await expect(methods).toContainText("토스페이");
    // 이용약관 위젯
    await expect(page.getByTestId("toss-agreement-ui")).toBeVisible();

    // 위젯이 준비되면 결제 버튼 활성화(그 전에는 '결제 수단 불러오는 중…'으로 잠김)
    await expect(page.getByTestId("checkout-pay")).toBeEnabled();
    await expect(page.getByTestId("checkout-widget-loading")).toHaveCount(0);
  });

  test("위젯 requestPayment로 결제하면 서버가 수단 불문 확정해 주문이 PAID로 완료된다", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "f069buyer@example.com" });
    expect(orderId).toMatch(/^ord_/);
    await expect(page.getByTestId("order-status")).toHaveText("PAID");
    await expect(page.getByTestId("order-grand-total")).toHaveText("43,000원");
  });

  test("클라이언트 카트 금액이 조작돼도 위젯엔 서버 금액이 설정된다(setAmount 재설정 검증)", async ({ page }) => {
    await installTossMock(page, "abandon");
    await addBirthToCart(page); // 실제 카트(43,000) 생성
    // 클라이언트 카트의 unitPriceWon을 1원으로 위조(templateKey는 birth 그대로 → 서버가 43,000 재계산).
    await page.evaluate(() => {
      const KEY = "gpms.cart.v1";
      const raw = localStorage.getItem(KEY);
      if (!raw) throw new Error("cart missing");
      const cart = JSON.parse(raw);
      cart.lines[0].unitPriceWon = 1;
      localStorage.setItem(KEY, JSON.stringify(cart));
    });
    await checkoutFromCart(page);
    const req = await capturedTossRequest(page);
    // 마운트 시엔 위조된 클라이언트 값(1)으로 setAmount됐지만, 제출 시 서버 금액(43,000)으로 재설정된다.
    // 제출 시 setAmount(서버 금액)이 사라지면 이 단언이 1을 보고 실패한다.
    expect(req.amount).toEqual({ value: 43000, currency: "KRW" });
  });

  test("결제위젯 로드 실패 시 오류 + 다시 불러오기 노출, 결제 버튼은 잠긴다", async ({ page }) => {
    await installFailingWidgetMock(page);
    await addBirthToCart(page);
    await page.getByTestId("cart-checkout").click();
    await page.waitForURL("**/checkout");

    await expect(page.getByTestId("checkout-widget-error")).toBeVisible();
    await expect(page.getByTestId("checkout-widget-retry")).toBeVisible();
    // 로딩 문구는 사라지고(모순 방지), 결제 버튼은 실패 상태로 잠긴다.
    await expect(page.getByTestId("checkout-widget-loading")).toHaveCount(0);
    await expect(page.getByTestId("checkout-pay")).toBeDisabled();
    await expect(page.getByTestId("checkout-pay")).toHaveText("결제 수단 불러오기 실패");
  });
});
