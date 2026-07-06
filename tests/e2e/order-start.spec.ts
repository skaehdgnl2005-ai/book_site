import { test, expect } from "@playwright/test";

// F007 — template select starts the flow; the correct extra-var field (0~1) is resolved
// per template. Hermetic: /order/<key> resolves via the seed mirror (no DB in E2E).
test.describe("order start — extra-var resolved per template (F007)", () => {
  test("birth (탄생) requests 생년월일 on the info step", async ({ page }) => {
    await page.goto("/order/birth");
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "info");
    await expect(page.getByTestId("order-extravar-label")).toHaveText("생년월일");
  });

  test("hundred_days (백일) requests NO extra-var field", async ({ page }) => {
    await page.goto("/order/hundred_days");
    await expect(page.getByTestId("order-wizard")).toBeVisible();
    await expect(page.getByTestId("order-extravar-label")).toHaveCount(0);
  });

  test("became_sibling requests the sibling gender with a distinct label", async ({ page }) => {
    await page.goto("/order/became_sibling");
    await expect(page.getByTestId("order-extravar-label")).toHaveText("새로 태어난 동생의 성별");
  });

  test("an unknown template key is a 404", async ({ page }) => {
    const res = await page.goto("/order/not-a-real-key");
    expect(res?.status()).toBe(404);
  });

  // F048 — funnel context: the wizard header carries the template's story blurb plus
  // what's-in-the-box + lead time, and the photo step explains why the photo is asked.
  test("wizard carries product context: blurb, 기본 구성, 제작 기간, photo purpose (F048)", async ({
    page,
  }) => {
    await page.goto("/order/birth");
    await expect(page.getByText("세상에 처음 온 그날의 설렘을 한 권에 담아.")).toBeVisible();
    const included = page.getByTestId("order-included");
    await expect(included).toContainText("자석 외함");
    await expect(included).toContainText("축하 카드");
    await expect(included).toContainText("일주일");

    // Walk to the photo step and check the purpose hint.
    await page.getByTestId("order-name-input").fill("도윤");
    await page.getByTestId("order-gender-male").check();
    await page.getByTestId("order-extravar-input").fill("2024-01-15");
    await page.getByTestId("order-next").click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "photo");
    await expect(page.getByTestId("order-photo-hint")).toContainText("주인공의 모습");
  });

  test("no horizontal overflow at 375px (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/order/birth");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});

// F050 — wizard recomposition: 4-step indicator (aria-current follows the reducer),
// desktop 7/5 sticky summary rail, mobile fixed bottom bar with 금액 + step CTA.
test.describe("order wizard recomposition (F050)", () => {
  test("step indicator renders 4 steps and aria-current moves with progress", async ({ page }) => {
    await page.goto("/order/birth");
    const indicator = page.getByTestId("order-step-indicator");
    await expect(indicator).toBeVisible();
    await expect(indicator.locator("li")).toHaveCount(4);
    await expect(indicator.locator('[aria-current="step"]')).toHaveCount(1);
    await expect(indicator.locator('[aria-current="step"]')).toContainText("아이 정보");

    // info → photo
    await page.getByTestId("order-name-input").fill("도윤");
    await page.getByTestId("order-gender-male").check();
    await page.getByTestId("order-extravar-input").fill("2024-01-15");
    await page.getByTestId("order-next").click();
    await expect(indicator.locator('[aria-current="step"]')).toContainText("사진");

    // photo → cover, and 뒤로 moves it back
    await page.getByTestId("order-photo-skip").click();
    await expect(indicator.locator('[aria-current="step"]')).toContainText("커버");
    await page.getByTestId("order-back").click();
    await expect(indicator.locator('[aria-current="step"]')).toContainText("사진");
  });

  test("desktop (≥1024px) shows the summary rail; its rows fill in as steps complete", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/order/birth");
    const rail = page.getByTestId("order-summary-rail");
    await expect(rail).toBeVisible();
    // Honest pre-cover price: the soft base price as a floor, not a chosen amount.
    await expect(rail).toContainText("43,000원부터");

    await page.getByTestId("order-name-input").fill("도윤");
    await page.getByTestId("order-gender-male").check();
    await page.getByTestId("order-extravar-input").fill("2024-01-15");
    await page.getByTestId("order-next").click();
    await expect(rail).toContainText("도윤 · 남아");

    await page.getByTestId("order-photo-skip").click();
    await page.getByTestId("order-cover-hard").check();
    await expect(rail).toContainText("하드커버");
    await expect(rail).toContainText("49,000원");
  });

  test("mobile (390px): from the cover step the fixed bottom bar shows 금액 + the step CTA", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/order/birth");
    await expect(page.getByTestId("order-summary-rail")).toBeHidden(); // rail is desktop-only

    await page.getByTestId("order-name-input").fill("도윤");
    await page.getByTestId("order-gender-male").check();
    await page.getByTestId("order-extravar-input").fill("2024-01-15");
    await page.getByTestId("order-next").click();
    await page.getByTestId("order-photo-skip").click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "cover");

    const price = page.getByTestId("order-line-price");
    const cta = page.getByTestId("order-next");
    await expect(price).toBeVisible();
    await expect(price).toHaveText("43,000원");
    await expect(cta).toBeVisible();
    // Both sit inside the viewport-fixed bar (visible without scrolling).
    const [priceBox, ctaBox, viewport] = [
      await price.boundingBox(),
      await cta.boundingBox(),
      page.viewportSize(),
    ];
    expect(priceBox!.y + priceBox!.height).toBeLessThanOrEqual(viewport!.height);
    expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(viewport!.height);

    // The whole flow (incl. 장바구니 담기) still works with the bar in place.
    await cta.click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "review");
    await page.getByTestId("order-add-to-cart").click();
    await page.waitForURL("**/cart");
  });

  test("mobile (390px): the sticky action bar releases at the end so the footer content links stay reachable + clickable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/order/birth");

    // The last footer row is the F048 content links; scrolled to the very bottom it must
    // clear the action bar (the sticky pin releases at the end of the funnel) — a real
    // click has to land on the link and navigate, proving nothing covers it.
    const footerContact = page.locator("footer.site-footer").getByRole("link", { name: "문의" });
    await footerContact.scrollIntoViewIfNeeded();
    await expect(footerContact).toBeInViewport();
    await footerContact.click();
    await page.waitForURL("**/contact");
  });
});
