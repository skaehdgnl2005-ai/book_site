import { expect, type Page } from "@playwright/test";

/** F056 — passwordless login (=signup) with the deterministic non-prod OTP 424242. */
export async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-otp-sent")).toBeVisible();
  await page.getByTestId("login-otp-input").fill("424242");
  await page.getByTestId("login-otp-submit").click();
  await page.waitForURL("**/account");
}
