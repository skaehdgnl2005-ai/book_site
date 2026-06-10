import { test, expect, type Page } from "@playwright/test";
import { completePaidOrder, completePaidTwoBookOrder } from "./_helpers/tossMock";

// F018 — 마이페이지 마무리: dedication (헌정 문구) + QR add-on handling.
// Dedication is prefilled (buyer manages their OWN PII) and persists. QR (option B / ADR-0016): the
// order carries the qrVideoAddon flag and, when set, mypage shows a BACKSTAGE NOTICE (mypage-qr-backstage)
// — there is NO web upload; the studio receives the video separately. Per-item dedication / per-order
// QR scope (schema-faithful) is exercised by the multi-book isolation test (R12).

async function lookup(page: Page, orderId: string, email = "parent@example.com") {
  await page.goto("/mypage");
  await page.getByTestId("mypage-lookup-orderid").fill(orderId);
  await page.getByTestId("mypage-lookup-email").fill(email);
  await page.getByTestId("mypage-lookup-submit").click();
  await page.waitForURL(`**/mypage/${orderId}`);
}

test.describe("mypage finishing (F018)", () => {
  test("dedication saves and prefills on reload (buyer-authored PII shown by design)", async ({ page }) => {
    const orderId = await completePaidOrder(page, { qrOn: true });
    await lookup(page, orderId);

    const ded = page.getByTestId("mypage-dedication-0");
    await expect(ded).toHaveValue(""); // none yet
    await ded.fill("테스트 헌정");
    await page.getByTestId("mypage-dedication-save-0").click();
    await expect(page.getByTestId("mypage-dedication-saved-0")).toBeVisible();

    // Reload -> prefilled from the no-store /state route (R13: buyer-authored content is intentionally shown).
    await page.reload();
    await expect(page.getByTestId("mypage-dedication-0")).toHaveValue("테스트 헌정");
  });

  test("QR add-on ON -> backstage notice shown, no web upload (option B / ADR-0016)", async ({ page }) => {
    const orderId = await completePaidOrder(page, { qrOn: true });
    await lookup(page, orderId);

    await expect(page.getByTestId("mypage-qr-note")).toHaveText("QR 영상 옵션 · 기본 미포함 · 요금 추후 안내");
    await expect(page.getByTestId("mypage-qr-backstage")).toBeVisible();
    // Option B: the studio receives the video backstage — the web app has NO upload control.
    await expect(page.getByTestId("mypage-qr-input")).toHaveCount(0);
  });

  test("QR add-on OFF -> the QR section is absent (not just hidden)", async ({ page }) => {
    const orderId = await completePaidOrder(page, { qrOn: false });
    await lookup(page, orderId);
    await expect(page.getByTestId("mypage-dedication-0")).toBeVisible(); // finishing page rendered
    await expect(page.getByTestId("mypage-qr-input")).toHaveCount(0);
    await expect(page.getByTestId("mypage-qr-note")).toHaveCount(0);
  });

  test("R12: per-item dedication isolation in a 2-book order (per-order QR shared)", async ({ page }) => {
    const orderId = await completePaidTwoBookOrder(page, { qrOn: true });
    await lookup(page, orderId);

    // Two finishing cards, one per OrderItem.
    await expect(page.getByTestId("mypage-dedication-0")).toBeVisible();
    await expect(page.getByTestId("mypage-dedication-1")).toBeVisible();
    // Per-order QR: exactly ONE shared QR notice for the whole 2-item order (not one per book).
    await expect(page.getByTestId("mypage-qr-backstage")).toHaveCount(1);

    await page.getByTestId("mypage-dedication-0").fill("헌정0");
    await page.getByTestId("mypage-dedication-save-0").click();
    await expect(page.getByTestId("mypage-dedication-saved-0")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("mypage-dedication-0")).toHaveValue("헌정0");
    await expect(page.getByTestId("mypage-dedication-1")).toHaveValue(""); // isolated
  });

  test("no horizontal overflow at 375px on the finishing page (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const orderId = await completePaidOrder(page, { qrOn: true });
    await lookup(page, orderId);
    // Measure the fully-loaded finishing controls, not the SSR/loading shell.
    await expect(page.getByTestId("mypage-dedication-0")).toBeVisible();
    await expect(page.getByTestId("mypage-qr-backstage")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
