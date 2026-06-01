import { test, expect } from "@playwright/test";

// F005 — 기념일 category page. A card grid of the 5 anniversary templates
// (탄생·백일·돌·생일·입학) sourced from the seeded catalogue. The page renders
// hermetically: with no live DB (CI/E2E) it falls back to the canonical seed
// source-of-truth, so this E2E doubles as the drift guard on label/key/price
// (DoD #3: F005's own user-facing E2E). Also advances F035 (375px no-overflow).

// Display order = seed sortOrder. label = serif 책 제목; key = /order/<key> link target.
const ANNIVERSARY = [
  { label: "탄생", key: "birth" },
  { label: "백일", key: "hundred_days" },
  { label: "돌", key: "first_birthday" },
  { label: "생일", key: "birthday" },
  { label: "입학", key: "admission" },
];

test.describe("category — 기념일 (anniversary)", () => {
  test("renders the 5 seeded template cards: label, media, both cover prices, order link", async ({
    page,
  }) => {
    await page.goto("/anniversary");

    // Shared nav + category heading.
    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /기념일/ })).toBeVisible();

    // Exactly the 5 anniversary templates, in seed order.
    const cards = page.getByTestId("template-card");
    await expect(cards).toHaveCount(ANNIVERSARY.length);

    // Titles are exact (toHaveText is exact-trimmed) — guards drift vs the seeded
    // catalogue and avoids substring bleed (a blurb may contain another label).
    await expect(page.getByTestId("template-card-title")).toHaveText(
      ANNIVERSARY.map((t) => t.label),
    );

    // Each card: a visible media slot + an order-flow link to /order/<key>.
    for (let i = 0; i < ANNIVERSARY.length; i++) {
      const card = cards.nth(i);
      await expect(card.getByTestId("template-card-media")).toBeVisible();
      await expect(card).toHaveAttribute("href", `/order/${ANNIVERSARY[i].key}`);
    }

    // Per-card price, role-bound (소프트→43,000 / 하드→49,000) — a single mispriced or
    // role-swapped card fails this, unlike a page-wide presence check.
    await expect(page.getByTestId("template-card-price")).toHaveText(
      Array(ANNIVERSARY.length).fill("소프트 43,000원 · 하드 49,000원"),
    );
  });

  test("no horizontal overflow at 375px (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/anniversary");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
