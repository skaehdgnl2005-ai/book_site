import { test, expect } from "@playwright/test";

// F006 — 첫 순간들 category page. A card grid of the 3 first-moment templates
// (첫 걸음마·첫 말·형아 된 날) from the seeded catalogue; each card opens its order
// flow (/order/<key>). Renders hermetically (seed fallback when no live DB), so this
// E2E is F006's own user-facing verification + a drift guard. Also advances F035.

const FIRST_MOMENTS = [
  { label: "첫 걸음마", key: "first_steps" },
  { label: "첫 말", key: "first_word" },
  { label: "형아 된 날", key: "became_sibling" },
];

test.describe("category — 첫 순간들 (first moments)", () => {
  test("renders the 3 seeded template cards, each opening its order flow", async ({ page }) => {
    await page.goto("/first-moments");

    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /첫 순간들/ })).toBeVisible();

    const cards = page.getByTestId("template-card");
    await expect(cards).toHaveCount(FIRST_MOMENTS.length);

    await expect(page.getByTestId("template-card-title")).toHaveText(
      FIRST_MOMENTS.map((t) => t.label),
    );

    // Contract: each card links into the order flow (built by TRACK-ORDER).
    for (let i = 0; i < FIRST_MOMENTS.length; i++) {
      const card = cards.nth(i);
      await expect(card.getByTestId("template-card-media")).toBeVisible();
      await expect(card).toHaveAttribute("href", `/order/${FIRST_MOMENTS[i].key}`);
    }

    // Per-card price, role-bound (소프트→43,000 / 하드→49,000).
    await expect(page.getByTestId("template-card-price")).toHaveText(
      Array(FIRST_MOMENTS.length).fill("소프트 43,000원 · 하드 49,000원"),
    );
  });

  test("no horizontal overflow at 375px (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/first-moments");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
