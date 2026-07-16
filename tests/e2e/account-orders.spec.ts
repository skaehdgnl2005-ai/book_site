import { test, expect } from "@playwright/test";
import { addBirthToCart, completePaidOrder, installTossMock } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F057 — 주문-계정 연결: 게스트 주문의 로그인 시 소급 연결(claim), 로그인 결제의 즉시 연결 +
// 이메일 프리필, 내 주문 목록/상세, 그리고 상세→마이페이지 마무리 OTP-프리 진입. 게스트 OTP
// 경로는 무변경(기존 mypage 스펙이 계속 커버).

test.describe("account orders (F057)", () => {
  test("a guest order is retroactively claimed on login; detail opens mypage finishing WITHOUT an OTP", async ({ page }) => {
    const email = "claim1@example.com";
    const orderId = await completePaidOrder(page, { email }); // guest checkout

    await loginAs(page, email); // email ownership proven → claim runs
    await expect(page.getByTestId("account-orders")).toBeVisible();
    await expect(page.getByTestId("account-order-row").filter({ hasText: orderId })).toBeVisible();

    await page.getByTestId("account-order-link").filter({ hasText: orderId }).click();
    await page.waitForURL(`**/account/orders/${orderId}`);
    await expect(page.getByTestId("account-order-status")).toHaveText("결제 완료");
    await expect(page.getByTestId("account-order-shipping")).toContainText("김수취"); // owner sees own address

    await page.getByTestId("account-order-finish").click(); // → /mypage/[orderId], no OTP round-trip
    await page.waitForURL(`**/mypage/${orderId}`);
    await expect(page.getByTestId("mypage-order-id")).toContainText(orderId);
  });

  test("a signed-in checkout prefills the member email and links the order immediately", async ({ page }) => {
    const email = "memberbuy@example.com";
    await loginAs(page, email);

    await installTossMock(page, "success");
    await addBirthToCart(page);
    await page.getByTestId("cart-checkout").click();
    await page.waitForURL("**/checkout");
    await expect(page.getByTestId("checkout-buyer-email")).toHaveValue(email); // prefilled

    await page.getByTestId("checkout-buyer-name").fill("김부모");
    await page.getByTestId("checkout-ship-name").fill("김수취");
    await page.getByTestId("checkout-ship-phone").fill("010-2222-3333");
    await page.getByTestId("checkout-ship-zip").fill("04524");
    await page.getByTestId("checkout-ship-address").fill("서울특별시 중구 세종대로 110");
    await page.getByTestId("checkout-withdrawal-consent").check(); // F067
    await page.getByTestId("checkout-pay").click();
    await page.waitForURL(/\/orders\/ord_/);
    const orderId = new URL(page.url()).pathname.split("/").pop() as string;

    await page.goto("/account");
    await expect(page.getByTestId("account-order-row").filter({ hasText: orderId })).toBeVisible();
  });

  test("a member who does NOT own the order cannot open its mypage or account detail", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "victim@example.com" });

    await loginAs(page, "stranger@example.com");
    await page.goto(`/mypage/${orderId}`);
    await expect(page.getByTestId("mypage-access-prompt")).toBeVisible(); // uniform gate — no oracle
    const res = await page.goto(`/account/orders/${orderId}`);
    expect(res?.status()).toBe(404); // strict ownership
  });
});
