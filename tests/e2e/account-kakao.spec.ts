import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F058 — 카카오 로그인. 비프로덕션은 sandbox 라운드트립: /api/auth/kakao/start가 state 쿠키를
// 굽고 즉시 자체 콜백으로 리다이렉트(sbx_id/sbx_email 쿼리가 프로필을 결정 — 프로덕션에선 실
// kauth로 가므로 도달 불가). 실 카카오 왕복은 배포 후 수동 카나리(F044/F045 전례).

test.describe("kakao login (F058)", () => {
  test("카카오로 시작하기 → OAuth 왕복(sandbox) → 로그인 (verified email)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("login-kakao")).toBeVisible();
    await page.goto("/api/auth/kakao/start?sbx_id=kk_e2e_1&sbx_email=kakao1@example.com");
    await page.waitForURL("**/account");
    await expect(page.getByTestId("account-email")).toHaveText("kakao1@example.com");
  });

  test("state 불일치 콜백은 거부된다 (CSRF)", async ({ page }) => {
    // No start round-trip → no state cookie → the callback must fail uniformly.
    await page.goto("/api/auth/kakao/callback?code=whatever&state=deadbeef");
    await page.waitForURL("**/login?error=kakao");
    await expect(page.getByTestId("login-kakao-error")).toBeVisible();
    await page.goto("/account");
    await expect(page.getByTestId("account-login-cta")).toBeVisible(); // still signed out
  });

  test("카카오 검증 이메일이 기존 계정과 일치하면 그 계정으로 로그인 + 게스트 주문까지 연결", async ({ page }) => {
    const email = "kakaolink@example.com";
    const orderId = await completePaidOrder(page, { email }); // guest order under this email
    await loginAs(page, email); // creates the email account
    await page.getByTestId("account-logout").click();
    await page.waitForURL("**/login");

    await page.goto(`/api/auth/kakao/start?sbx_id=kk_e2e_link&sbx_email=${email}`);
    await page.waitForURL("**/account");
    await expect(page.getByTestId("account-email")).toHaveText(email); // SAME account (unique email)
    await expect(page.getByTestId("account-order-row").filter({ hasText: orderId })).toBeVisible();
  });

  test("이메일 미동의 → email 없는 계정 + /account 연결 배너 → OTP로 이메일 연결", async ({ page }) => {
    await page.goto("/api/auth/kakao/start?sbx_id=kk_e2e_noemail");
    await page.waitForURL("**/account");
    await expect(page.getByTestId("account-email")).toContainText("이메일 미등록");
    await expect(page.getByTestId("account-connect-email")).toBeVisible();

    // attach flow: /login while signed-in-without-email verifies an OTP → email attaches
    await page.getByTestId("account-connect-email").getByRole("link").click();
    await page.waitForURL("**/login");
    await page.getByTestId("login-email").fill("attached@example.com");
    await page.getByTestId("login-submit").click();
    await page.getByTestId("login-otp-input").fill("424242");
    await page.getByTestId("login-otp-submit").click();
    await page.waitForURL("**/account");
    await expect(page.getByTestId("account-email")).toHaveText("attached@example.com");
    await expect(page.getByTestId("account-connect-email")).toHaveCount(0); // banner gone
  });
});
