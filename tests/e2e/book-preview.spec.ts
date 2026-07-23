import { test, expect } from "@playwright/test";

// F077 — 동화책 미리보기 (펼침면 플립 뷰어).
// The flip unit is a whole 10:7 spread: desktop folds it at the gutter as two 5:7
// pages ("book"), a portrait phone flips it as ONE whole leaf ("leaf") — never half a
// scene. Deck = 4 placeholder story spreads + a final CTA spread (previewSpreads.ts),
// so the indicator runs 1..5.

test.describe("책 미리보기 — 데스크톱(두쪽 플립)", () => {
  test("열기 → 장 넘김 → 마지막 CTA 장으로 위저드 복귀", async ({ page }) => {
    await page.goto("/order/birth");
    await page.getByTestId("preview-open").click();

    const dialog = page.getByTestId("preview-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-mode", "book");
    await expect(page.getByTestId("preview-indicator")).toHaveText("1 / 5");
    await expect(page.getByTestId("preview-prev")).toBeDisabled();

    // Forward through every spread — each flip lands before the next starts
    // (expect() polls past the 600ms flip animation).
    for (const n of [2, 3, 4, 5]) {
      await page.getByTestId("preview-next").click();
      await expect(page.getByTestId("preview-indicator")).toHaveText(`${n} / 5`);
    }
    await expect(page.getByTestId("preview-next")).toBeDisabled();

    // Last spread is the CTA 장 — it closes the overlay back into the wizard.
    await page.getByTestId("preview-cta").click();
    await expect(page.getByTestId("preview-dialog")).toHaveCount(0);
    await expect(page.getByTestId("order-wizard")).toBeVisible();
    // Focus returns to the entry link (a11y contract).
    await expect(page.getByTestId("preview-open")).toBeFocused();
  });

  test("이전 장 · Esc 닫기", async ({ page }) => {
    await page.goto("/order/birth");
    await page.getByTestId("preview-open").click();

    await page.getByTestId("preview-next").click();
    await expect(page.getByTestId("preview-indicator")).toHaveText("2 / 5");
    await page.getByTestId("preview-prev").click();
    await expect(page.getByTestId("preview-indicator")).toHaveText("1 / 5");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("preview-dialog")).toHaveCount(0);
  });
});

// F078 — 카테고리 카드 진입. The whole card is the order-flow <Link>; the '미리 읽기'
// button inside it must open the viewer WITHOUT navigating (preventDefault +
// stopPropagation), while any other card area still goes to /order/<key>. In this
// context the viewer's CTA ('이 책 만들기') routes INTO the order page (onCta prop) —
// unlike the wizard context, where it closes back (F077 behavior, unchanged).
test.describe("책 미리보기 — 카테고리 카드 진입", () => {
  test("카드 '미리 읽기' → 뷰어 오픈(내비게이션 차단) → CTA '이 책 만들기' → /order/<key>", async ({
    page,
  }) => {
    await page.goto("/anniversary");
    const card = page.getByTestId("template-card").first(); // 탄생 → /order/birth
    await card.getByTestId("card-preview-open").click();

    const dialog = page.getByTestId("preview-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-label", "『탄생』 미리보기");
    // The nested-interactive guard held: still on the category page.
    await expect(page).toHaveURL(/\/anniversary$/);

    // Page to the last (CTA) spread — in this context it routes into the order flow.
    for (const n of [2, 3, 4, 5]) {
      await page.getByTestId("preview-next").click();
      await expect(page.getByTestId("preview-indicator")).toHaveText(`${n} / 5`);
    }
    await page.getByTestId("preview-cta").click();
    await expect(page).toHaveURL(/\/order\/birth$/);
    await expect(page.getByTestId("order-wizard")).toBeVisible();
  });

  test("닫기 → 카테고리 잔류 + 진입 버튼 포커스 복귀; 버튼 외 카드 영역은 주문 페이지로", async ({
    page,
  }) => {
    await page.goto("/first-moments");
    const card = page.getByTestId("template-card").first(); // 첫 걸음마 → /order/first_steps
    await card.getByTestId("card-preview-open").click();
    await expect(page.getByTestId("preview-dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("preview-dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/first-moments$/);
    // Focus returns to THIS card's entry button (a11y contract, wizard-parity).
    await expect(card.getByTestId("card-preview-open")).toBeFocused();

    // Nested-interaction contract: outside the button the card is still the order link.
    await card.getByTestId("template-card-title").click();
    await expect(page).toHaveURL(/\/order\/first_steps$/);
    await expect(page.getByTestId("order-wizard")).toBeVisible();
  });
});

test.describe("책 미리보기 — 모바일 세로(낱장 플립)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("스프레드 통째 낱장 모드 + 회전 힌트 + 넘김·닫기", async ({ page }) => {
    await page.goto("/order/birth");
    await page.getByTestId("preview-open").click();

    const dialog = page.getByTestId("preview-dialog");
    await expect(dialog).toBeVisible();
    // Whole-spread leaves, not half-spread pages (the 10:7 mobile decision).
    await expect(dialog).toHaveAttribute("data-mode", "leaf");
    await expect(page.getByTestId("preview-rotate-hint")).toBeVisible();

    await page.getByTestId("preview-next").click();
    await expect(page.getByTestId("preview-indicator")).toHaveText("2 / 5");

    await page.getByTestId("preview-close").click();
    await expect(page.getByTestId("preview-dialog")).toHaveCount(0);
  });
});

// F080 — 실제 내지 이미지. birth carries real spread assets (public/previews/birth/),
// so its deck renders kind:"image" spreads: leaf shows the whole 10:7 file, book mode
// CLIPS the same file into left/right halves (the file itself is never split — the
// F077 .half/.halfInner 200% structure does the slicing). Asset-less templates keep
// the typographic placeholder deck — the fallback path this describe pins down.
test.describe("책 미리보기 — 실제 내지 이미지", () => {
  test("birth: 이미지 스프레드 데크(1장 즉시 로드·10:7 원본·양쪽 클리핑) + 마지막 CTA 장", async ({
    page,
  }) => {
    await page.goto("/order/birth");
    await page.getByTestId("preview-open").click();
    const dialog = page.getByTestId("preview-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-mode", "book");

    // First spread is a real image, loaded eagerly, with the reader-facing alt.
    const firstImg = dialog.locator('img[alt="『탄생』 미리보기 1번째 펼침면"]');
    await expect(firstImg).toBeVisible();
    await expect
      .poll(async () => firstImg.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    // The 10:7 original travels whole — slicing is CSS clipping, never a cut file.
    const dims = await firstImg.evaluate((el) => {
      const i = el as HTMLImageElement;
      return { w: i.naturalWidth, h: i.naturalHeight };
    });
    expect(dims.w * 7).toBe(dims.h * 10);
    // Book mode: the SAME file appears twice (left half + right half copy).
    await expect(dialog.locator('img[src="/previews/birth/spread-01.webp"]')).toHaveCount(2);

    // The deck stays 4 images + the CTA spread — image assets never displace the CTA.
    for (const n of [2, 3, 4, 5]) {
      await page.getByTestId("preview-next").click();
      await expect(page.getByTestId("preview-indicator")).toHaveText(`${n} / 5`);
    }
    await expect(page.getByTestId("preview-cta")).toBeVisible();
  });

  test("에셋 없는 템플릿(백일)은 타이포 플레이스홀더 데크 유지", async ({ page }) => {
    await page.goto("/order/hundred_days");
    await page.getByTestId("preview-open").click();
    const dialog = page.getByTestId("preview-dialog");
    await expect(dialog).toBeVisible();
    // No image spreads — the bespoke story lines still render (fallback preserved).
    await expect(dialog.locator("img[data-spread-no]")).toHaveCount(0);
    await expect(dialog.getByText(/백 번의 아침/).first()).toBeVisible();
    await expect(page.getByTestId("preview-indicator")).toHaveText("1 / 5");
  });
});

// F079 — 모바일 낱장(leaf) 줌. ① the a11y/E2E-stable path is the explicit '크게 보기'
// toggle (aria-pressed); ② double-tap is gesture sugar over the same state. Zoomed:
// the flip is LOCKED (nav disabled + a pan capture layer physically blocks pointers
// to the StPageFlip mount) and dragging pans instead; unzooming restores everything.
// The zoom transform lives on .zoomPane — OUTSIDE the engine-owned .bookMount, which
// StPageFlip styles inline (F077 함정 — never fight it there).
test.describe("책 미리보기 — 모바일 줌(leaf)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  /** Computed scaleX / translateX of the zoom pane ("none" ⇒ identity). */
  const paneMatrix = (sel: string) => async (page: import("@playwright/test").Page) =>
    page.getByTestId(sel).evaluate((el) => {
      const t = getComputedStyle(el).transform;
      const m = t === "none" ? null : new DOMMatrixReadOnly(t);
      return { scale: m ? m.m11 : 1, tx: m ? m.m41 : 0 };
    });
  const zoomPane = paneMatrix("preview-zoom-pane");

  test("'크게 보기' 토글 — fit-height 확대·플립 잠금·원복 후 넘김 재개", async ({ page }) => {
    await page.goto("/order/birth");
    await page.getByTestId("preview-open").click();

    const dialog = page.getByTestId("preview-dialog");
    await expect(dialog).toHaveAttribute("data-mode", "leaf");
    await expect(dialog).toHaveAttribute("data-zoomed", "false");

    const zoom = page.getByTestId("preview-zoom");
    await expect(zoom).toHaveAttribute("aria-pressed", "false");

    await zoom.click();
    await expect(zoom).toHaveAttribute("aria-pressed", "true");
    await expect(dialog).toHaveAttribute("data-zoomed", "true");
    // Actually enlarged (fit-height ⇒ well past 1 on a 390×844 portrait stage).
    await expect.poll(async () => (await zoomPane(page)).scale).toBeGreaterThan(1.1);
    // Flip locked while zoomed.
    await expect(page.getByTestId("preview-next")).toBeDisabled();
    await expect(page.getByTestId("preview-prev")).toBeDisabled();

    // Toggle back: identity transform, nav re-enabled, flipping works again.
    await zoom.click();
    await expect(zoom).toHaveAttribute("aria-pressed", "false");
    await expect(dialog).toHaveAttribute("data-zoomed", "false");
    await expect.poll(async () => (await zoomPane(page)).scale).toBeLessThan(1.05);
    await page.getByTestId("preview-next").click();
    await expect(page.getByTestId("preview-indicator")).toHaveText("2 / 5");
  });

  test("더블탭 확대 → 드래그=팬(플립 아님) → 더블탭 원복", async ({ page }) => {
    await page.goto("/order/birth");
    await page.getByTestId("preview-open").click();
    const dialog = page.getByTestId("preview-dialog");
    await expect(dialog).toHaveAttribute("data-mode", "leaf");

    const stageBox = await page.getByTestId("preview-stage").boundingBox();
    if (!stageBox) throw new Error("preview-stage has no bounding box");
    const cx = stageBox.x + stageBox.width / 2;
    const cy = stageBox.y + stageBox.height / 2;

    // Double-tap the spread — gesture sugar for the same zoom state.
    await page.touchscreen.tap(cx, cy);
    await page.touchscreen.tap(cx, cy);
    await expect(dialog).toHaveAttribute("data-zoomed", "true");

    // Dragging now PANS (translate moves) and never flips (indicator unchanged).
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 120, cy, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await zoomPane(page)).tx).toBeLessThan(-40);
    await expect(page.getByTestId("preview-indicator")).toHaveText("1 / 5");

    // Double-tap (on the pan layer) restores.
    await page.touchscreen.tap(cx, cy);
    await page.touchscreen.tap(cx, cy);
    await expect(dialog).toHaveAttribute("data-zoomed", "false");
  });

  test.describe("데스크톱(book) — 줌 비목표", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("book 모드 하단 바에는 줌 토글이 렌더되지 않는다", async ({ page }) => {
      await page.goto("/order/birth");
      await page.getByTestId("preview-open").click();
      await expect(page.getByTestId("preview-dialog")).toHaveAttribute("data-mode", "book");
      await expect(page.getByTestId("preview-zoom")).toHaveCount(0);
    });
  });
});
