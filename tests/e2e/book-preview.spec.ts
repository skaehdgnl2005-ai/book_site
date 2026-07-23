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
