import { test, expect, type Page } from "@playwright/test";

// F056 (ADR-0023) — passwordless 이메일 OTP 로그인(=가입). Hermetic: 비프로덕션 결정 코드 424242
// (mypage OTP와 동일 규율), 세션은 httpOnly HMAC 쿠키 account_session.

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-otp-sent")).toBeVisible();
  await page.getByTestId("login-otp-input").fill("424242");
  await page.getByTestId("login-otp-submit").click();
  await page.waitForURL("**/account");
}

test.describe("account login (F056)", () => {
  test("email → OTP → logged in at /account (first login IS signup)", async ({ page }) => {
    await loginAs(page, "member@example.com");
    await expect(page.getByTestId("account-email")).toHaveText("member@example.com");
  });

  test("a wrong code shows an error and does NOT log in", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("login-email").fill("member2@example.com");
    await page.getByTestId("login-submit").click();
    await page.getByTestId("login-otp-input").fill("111111");
    await page.getByTestId("login-otp-submit").click();
    await expect(page.getByTestId("login-otp-error")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/account");
    await expect(page.getByTestId("account-login-cta")).toBeVisible(); // still signed out
  });

  test("logout clears the session — /account returns to the login prompt", async ({ page }) => {
    await loginAs(page, "member3@example.com");
    await page.getByTestId("account-logout").click();
    await page.waitForURL("**/login");
    await page.goto("/account");
    await expect(page.getByTestId("account-login-cta")).toBeVisible();
  });

  test("a forged session cookie is rejected (HMAC verification)", async ({ page, context, baseURL }) => {
    await context.addCookies([
      {
        name: "account_session",
        value: `usr_0001.0.${Date.now() + 86_400_000}.deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`,
        url: baseURL ?? "http://localhost:3000",
      },
    ]);
    await page.goto("/account");
    await expect(page.getByTestId("account-login-cta")).toBeVisible();
  });

  test("/login while signed in redirects to /account", async ({ page }) => {
    await loginAs(page, "member4@example.com");
    await page.goto("/login");
    await page.waitForURL("**/account");
    await expect(page.getByTestId("account-email")).toHaveText("member4@example.com");
  });

  test("no horizontal overflow at 375px on /login", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/login");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
