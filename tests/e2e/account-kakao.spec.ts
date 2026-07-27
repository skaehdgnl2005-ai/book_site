import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F058 — 카카오 로그인. 비프로덕션은 sandbox 라운드트립: /api/auth/kakao/start가 state 쿠키를
// 굽고 즉시 자체 콜백으로 리다이렉트(sbx_id/sbx_email 쿼리가 프로필을 결정 — 프로덕션에선 실
// kauth로 가므로 도달 불가). 실 카카오 왕복은 배포 후 수동 카나리(F044/F045 전례).

test.describe("kakao login (F058)", () => {
  test("카카오 로그인 → OAuth 왕복(sandbox) → 로그인 (verified email)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("login-kakao")).toBeVisible();
    await page.goto("/api/auth/kakao/start?sbx_id=kk_e2e_1&sbx_email=kakao1@example.com");
    await page.waitForURL("**/account");
    await expect(page.getByTestId("account-email")).toHaveText("kakao1@example.com");
  });

  // F091 — 카카오 로그인 디자인 가이드는 컨테이너 #FEE500 · 심볼 필수 · 레이블 '카카오 로그인'을
  // '규정'으로 못박는다(색상 변경·심볼 생략 금지). 예전 버튼은 사이트 기본 네이비 pill에 레이블도
  // '카카오로 시작하기'(= 별도 제품인 카카오 싱크의 레이블)여서 셋 다 위반이었다.
  test("버튼이 카카오 가이드대로 렌더된다 — 노란 컨테이너 + 심볼 + '카카오 로그인'", async ({ page }) => {
    await page.goto("/login");
    const btn = page.getByTestId("login-kakao");
    await expect(btn).toHaveText("카카오 로그인");
    await expect(btn).toHaveCSS("background-color", "rgb(254, 229, 0)"); // #FEE500 — 변경 불가
    await expect(btn).toHaveCSS("border-radius", "12px"); // 가이드 "Fix 12px"
    await expect(btn.locator("svg")).toBeVisible(); // 심볼 없이 구성 불가
    await expect(btn).toHaveAttribute("href", "/api/auth/kakao/start");
    // 심볼은 장식 — 접근성 이름은 레이블만. aria-hidden 이 빠지면 스크린리더가 중복 낭독한다.
    await expect(btn.locator("svg")).toHaveAttribute("aria-hidden", "true");
  });

  test("state 불일치 콜백은 거부된다 (CSRF)", async ({ page }) => {
    // No start round-trip → no state cookie → the callback must fail uniformly.
    await page.goto("/api/auth/kakao/callback?code=whatever&state=deadbeef");
    await page.waitForURL("**/login?error=kakao");
    await expect(page.getByTestId("login-kakao-error")).toBeVisible();
    await page.goto("/account");
    await expect(page.getByTestId("account-login-cta")).toBeVisible(); // still signed out
  });

  // F091 — 카카오 동의 화면의 '취소'는 state를 그대로 echo 해서 돌아오므로 CSRF 검사를 통과한다.
  // 예전에는 code가 비어 exchange가 null → 다른 실패와 똑같이 빨간 "다시 시도해 주세요" 경고를
  // 띄웠다. 사용자가 방금 스스로 그만둔 일을 다시 하라고 말하는 셈이라 실패로 취급하지 않는다.
  test("동의 화면 '취소'는 경고 없이 /login 으로 돌아온다", async ({ page, context }) => {
    // 실제 카카오 왕복은 E2E에서 불가하므로, start 라우트가 굽는 것과 같은 state 쿠키를 심고
    // 카카오의 취소 리다이렉트를 그대로 재현한다.
    await context.addCookies([
      { name: "kakao_oauth_state", value: "st_cancel", domain: "localhost", path: "/api/auth/kakao" },
    ]);
    await page.goto(
      "/api/auth/kakao/callback?error=access_denied&error_description=User+denied+access&state=st_cancel",
    );
    await page.waitForURL((u) => u.pathname === "/login" && !u.search.includes("error"));
    await expect(page.getByTestId("login-kakao-error")).toHaveCount(0); // 실패가 아니므로 경고 없음
    await expect(page.getByTestId("login-kakao")).toBeVisible(); // 다시 시도할 수단은 그대로
    await page.goto("/account");
    await expect(page.getByTestId("account-login-cta")).toBeVisible(); // 로그인되지 않은 상태 유지
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
