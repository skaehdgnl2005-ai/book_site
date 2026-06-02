import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";

// F017 — 마이페이지: order status + post-pay child-photo upload (if skipped at checkout).
// These specs make F029's e2e_via:[F009,F017,F018] REAL: the upload drives the actual
// src/lib/assets path (receiveUpload -> storeAsset) via a genuine setInputFiles, asserting an
// opaque storageKey outcome with NO filename/childName in the DOM or URL.

// Non-prod dev fallback of accessSecret() (src/app/mypage/_lib/access.ts) — the E2E always runs
// with APP_ENV!=production (checkout 503s in prod), so this is the active signing key. Used only
// to forge expired / precisely-tampered tokens for the access-gate branch tests (R7/R9), staying
// in tests/e2e scope (no tests/unit).
const DEV_SECRET = "test_mypage_access_dev";
function signToken(orderId: string, exp: number): string {
  const hmac = createHmac("sha256", DEV_SECRET).update(`${orderId}.${exp}`).digest("hex");
  return `${exp}.${hmac}`;
}
async function setMypageCookie(page: Page, orderId: string, value: string) {
  await page.context().addCookies([
    { name: `mypage_${orderId}`, value, domain: "localhost", path: "/mypage", httpOnly: true },
  ]);
}

async function addBirthToCart(page: Page, opts: { coverHard?: boolean; qrOn?: boolean } = {}) {
  await page.goto("/order/birth");
  await page.getByTestId("order-name-input").fill("도윤");
  await page.getByTestId("order-gender-male").check();
  await page.getByTestId("order-extravar-input").fill("2024-01-15");
  await page.getByTestId("order-next").click(); // info -> photo
  await page.getByTestId("order-photo-skip").click(); // SKIP photo -> cover
  if (opts.coverHard) await page.getByTestId("order-cover-hard").check();
  if (opts.qrOn) await page.getByTestId("order-qr-toggle").check();
  await page.getByTestId("order-next").click(); // cover -> review
  await page.getByTestId("order-add-to-cart").click();
  await page.waitForURL("**/cart");
}

async function payCart(page: Page): Promise<string> {
  await page.getByTestId("cart-checkout").click();
  await page.waitForURL("**/checkout");
  await page.getByTestId("checkout-buyer-name").fill("김부모");
  await page.getByTestId("checkout-buyer-email").fill("parent@example.com");
  await page.getByTestId("checkout-pay").click();
  await page.waitForURL("**/checkout/pay**");
  const orderId = new URL(page.url()).searchParams.get("order") ?? "";
  await page.getByTestId("pay-approve").click();
  await page.waitForURL(`**/orders/${orderId}`);
  return orderId;
}

/** Pay for /order/birth SKIPPING the photo; returns the PAID orderId (email parent@example.com). */
async function payBirthSkippingPhoto(page: Page): Promise<string> {
  await addBirthToCart(page);
  return payCart(page);
}

async function lookup(page: Page, orderId: string, email = "parent@example.com") {
  await page.goto("/mypage");
  await page.getByTestId("mypage-lookup-orderid").fill(orderId);
  await page.getByTestId("mypage-lookup-email").fill(email);
  await page.getByTestId("mypage-lookup-submit").click();
}

// A tiny non-empty image payload — assets.ts allowlists by contentType, not bytes (so content
// is irrelevant), but rejects empty bodies, so the buffer must be non-empty (R15).
const PNG = { name: "도윤이-돌사진.png", mimeType: "image/png", buffer: Buffer.from("fake-png-bytes-nonempty") };

test.describe("mypage photo (F017)", () => {
  test("lookup -> see order PAID + label, upload the skipped photo, no PII leaks, persists on reload", async ({ page }) => {
    const orderId = await payBirthSkippingPhoto(page);

    await lookup(page, orderId);
    await page.waitForURL(`**/mypage/${orderId}`);
    await expect(page.getByTestId("mypage-order-status")).toHaveText("PAID");
    await expect(page.getByTestId("mypage-order-id")).toContainText(orderId);
    await expect(page.getByTestId("mypage-item-title-0")).toContainText("탄생");

    // Skipped at checkout -> the upload control is offered; the "on file" status is not.
    await expect(page.getByTestId("mypage-photo-input-0")).toBeVisible();
    await expect(page.getByTestId("mypage-photo-status-0")).toHaveCount(0);

    // Real upload -> drives receiveUpload/storeAsset (the F029 path).
    await page.getByTestId("mypage-photo-input-0").setInputFiles(PNG);
    await expect(page.getByTestId("mypage-photo-status-0")).toHaveText("사진이 등록되었습니다");

    // R10: the filename (도윤이-돌사진) and the child name (도윤) must NOT appear in DOM or URL.
    const html = await page.content();
    expect(html).not.toContain("도윤이-돌사진");
    expect(html).not.toContain("도윤");
    expect(page.url()).not.toContain("도윤");

    // Persists across reload (hermetic store; mirrors checkout-success reload test).
    await page.reload();
    await expect(page.getByTestId("mypage-photo-status-0")).toHaveText("사진이 등록되었습니다");
    await expect(page.getByTestId("mypage-photo-input-0")).toHaveCount(0);
  });

  test("the finishing page is noindex (R5)", async ({ page }) => {
    const orderId = await payBirthSkippingPhoto(page);
    await lookup(page, orderId);
    await page.waitForURL(`**/mypage/${orderId}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("wrong email -> uniform error, no redirect, no access", async ({ page }) => {
    const orderId = await payBirthSkippingPhoto(page);
    await lookup(page, orderId, "intruder@example.com");
    await expect(page.getByTestId("mypage-lookup-error")).toHaveText("주문번호와 이메일을 다시 확인해 주세요.");
    await expect(page).toHaveURL(/\/mypage$/);
  });

  test("R1: no-cookie visit is an identical access prompt for an existing AND a non-existent id (no existence oracle)", async ({ page }) => {
    const orderId = await payBirthSkippingPhoto(page);

    // Existing order, but no capability cookie -> access prompt, HTTP 200 (NOT a 404, NOT the shell).
    const resExisting = await page.goto(`/mypage/${orderId}`);
    expect(resExisting?.status()).toBe(200);
    await expect(page.getByTestId("mypage-access-prompt")).toBeVisible();
    await expect(page.getByTestId("mypage-order-status")).toHaveCount(0);

    // Non-existent order, no cookie -> the SAME access prompt + same 200 (no get/notFound pre-gate).
    const resUnknown = await page.goto("/mypage/ord_does_not_exist");
    expect(resUnknown?.status()).toBe(200);
    await expect(page.getByTestId("mypage-access-prompt")).toBeVisible();
  });

  test("R9: a token with a valid exp but a tampered HMAC is rejected (isolates the HMAC-mismatch branch)", async ({ page }) => {
    const orderId = await payBirthSkippingPhoto(page);
    const good = signToken(orderId, Date.now() + 3_600_000); // future exp, valid signature
    const tampered = good.slice(0, -1) + (good.endsWith("a") ? "b" : "a"); // flip ONLY the last hmac hex char
    await setMypageCookie(page, orderId, tampered);
    await page.goto(`/mypage/${orderId}`);
    await expect(page.getByTestId("mypage-access-prompt")).toBeVisible();
    await expect(page.getByTestId("mypage-order-status")).toHaveCount(0);
  });

  test("R7: an expired (validly-signed, past-exp) token is rejected", async ({ page }) => {
    const orderId = await payBirthSkippingPhoto(page);
    const expired = signToken(orderId, Date.now() - 1000); // valid HMAC, exp in the past
    await setMypageCookie(page, orderId, expired);
    await page.goto(`/mypage/${orderId}`);
    await expect(page.getByTestId("mypage-access-prompt")).toBeVisible();
    await expect(page.getByTestId("mypage-order-status")).toHaveCount(0);
  });

  test("no horizontal overflow at 375px on the finishing page (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const orderId = await payBirthSkippingPhoto(page);
    await lookup(page, orderId);
    await page.waitForURL(`**/mypage/${orderId}`);
    await expect(page.getByTestId("mypage-order-status")).toHaveText("PAID");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
