import { test, expect, type Page } from "@playwright/test";

// F018 — 마이페이지 마무리: dedication (헌정 문구) + QR video upload.
// The QR upload control is revealed ONLY when the order's QR add-on was chosen (Order.qrVideoAddon).
// Dedication is prefilled (buyer manages their OWN PII) and persists; the QR upload drives the real
// src/lib/assets QR_VIDEO path. Per-item dedication / per-order QR (schema-faithful) is exercised
// by the multi-book isolation test (R12).

async function addBirthToCart(page: Page, opts: { qrOn?: boolean } = {}) {
  await page.goto("/order/birth");
  await page.getByTestId("order-name-input").fill("도윤");
  await page.getByTestId("order-gender-male").check();
  await page.getByTestId("order-extravar-input").fill("2024-01-15");
  await page.getByTestId("order-next").click(); // info -> photo
  await page.getByTestId("order-photo-skip").click(); // photo -> cover
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

async function payBirth(page: Page, opts: { qrOn?: boolean } = {}): Promise<string> {
  await addBirthToCart(page, opts);
  return payCart(page);
}

async function payTwoBirths(page: Page, opts: { qrOn?: boolean } = {}): Promise<string> {
  await addBirthToCart(page); // book 1 -> /cart
  await addBirthToCart(page, { qrOn: opts.qrOn }); // book 2; QR is order-level (last add-to-cart wins)
  return payCart(page);
}

async function lookup(page: Page, orderId: string, email = "parent@example.com") {
  await page.goto("/mypage");
  await page.getByTestId("mypage-lookup-orderid").fill(orderId);
  await page.getByTestId("mypage-lookup-email").fill(email);
  await page.getByTestId("mypage-lookup-submit").click();
  await page.waitForURL(`**/mypage/${orderId}`);
}

const MP4 = { name: "qr.mp4", mimeType: "video/mp4", buffer: Buffer.from("fake-mp4-bytes-nonempty") };

test.describe("mypage finishing (F018)", () => {
  test("dedication saves and prefills on reload (buyer-authored PII shown by design)", async ({ page }) => {
    const orderId = await payBirth(page, { qrOn: true });
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

  test("QR add-on ON -> upload control + full honesty copy; real video upload registers (R11/R15)", async ({ page }) => {
    const orderId = await payBirth(page, { qrOn: true });
    await lookup(page, orderId);

    await expect(page.getByTestId("mypage-qr-note")).toHaveText("QR 영상 옵션 · 기본 미포함 · 요금 추후 안내");
    await expect(page.getByTestId("mypage-qr-input")).toBeVisible();
    await page.getByTestId("mypage-qr-input").setInputFiles(MP4);
    await expect(page.getByTestId("mypage-qr-status")).toHaveText("영상이 등록되었습니다");

    // Persists across reload (hermetic finishing store; mirrors the photo persistence path).
    await page.reload();
    await expect(page.getByTestId("mypage-qr-status")).toHaveText("영상이 등록되었습니다");
    await expect(page.getByTestId("mypage-qr-input")).toHaveCount(0);
  });

  test("QR add-on OFF -> the QR section is absent (not just hidden)", async ({ page }) => {
    const orderId = await payBirth(page, { qrOn: false });
    await lookup(page, orderId);
    await expect(page.getByTestId("mypage-dedication-0")).toBeVisible(); // finishing page rendered
    await expect(page.getByTestId("mypage-qr-input")).toHaveCount(0);
    await expect(page.getByTestId("mypage-qr-note")).toHaveCount(0);
  });

  test("R12: per-item dedication isolation in a 2-book order (per-order QR shared)", async ({ page }) => {
    const orderId = await payTwoBirths(page, { qrOn: true });
    await lookup(page, orderId);

    // Two finishing cards, one per OrderItem.
    await expect(page.getByTestId("mypage-dedication-0")).toBeVisible();
    await expect(page.getByTestId("mypage-dedication-1")).toBeVisible();
    // Per-order QR: exactly ONE shared QR control for the whole 2-item order (not one per book).
    await expect(page.getByTestId("mypage-qr-input")).toHaveCount(1);

    await page.getByTestId("mypage-dedication-0").fill("헌정0");
    await page.getByTestId("mypage-dedication-save-0").click();
    await expect(page.getByTestId("mypage-dedication-saved-0")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("mypage-dedication-0")).toHaveValue("헌정0");
    await expect(page.getByTestId("mypage-dedication-1")).toHaveValue(""); // isolated
  });

  test("no horizontal overflow at 375px on the finishing page (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const orderId = await payBirth(page, { qrOn: true });
    await lookup(page, orderId);
    // Measure the fully-loaded finishing controls, not the SSR/loading shell.
    await expect(page.getByTestId("mypage-dedication-0")).toBeVisible();
    await expect(page.getByTestId("mypage-qr-input")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
