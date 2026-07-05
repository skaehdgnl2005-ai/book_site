import { test, expect, type Page } from "@playwright/test";

// F049 — nav cart entry point (BAG N text link) + mobile hamburger drawer.
// Before this, adding to cart left no UI way back to /cart, and the nav links
// wrapped to two lines on narrow viewports (DESIGN.md Nav spec: hamburger drawer).

// One valid cart line in the shape src/lib/cart.ts#isValidLine accepts
// (key gpms.cart.v1 — same store the cart page reads).
const SEED_LINE = {
  id: "ln_e2e_nav_1",
  templateKey: "birth",
  templateLabel: "탄생",
  coverType: "SOFT",
  unitPriceWon: 43000,
  personalization: { childName: "도윤", childGender: "MALE", extraVar: null },
  photo: null,
};

async function seedCart(page: Page) {
  await page.addInitScript((line) => {
    window.localStorage.setItem(
      "gpms.cart.v1",
      JSON.stringify({ lines: [line], qrVideoAddon: false }),
    );
  }, SEED_LINE);
}

test.describe("nav (F049) — BAG entry point", () => {
  test("BAG is visible in the nav and navigates to /cart", async ({ page }) => {
    await page.goto("/");
    const bag = page.getByTestId("nav-bag");
    await expect(bag).toBeVisible();
    await expect(bag).toHaveText("BAG"); // empty cart → no count
    await bag.click();
    await expect(page).toHaveURL(/\/cart$/);
  });

  test("with a line in the cart the link reads BAG 1", async ({ page }) => {
    await seedCart(page);
    await page.goto("/faq"); // non-overlay page: the count must render everywhere
    await expect(page.getByTestId("nav-bag")).toHaveText(/BAG\s+1/);
  });
});

test.describe("nav (F049) — mobile drawer", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("hamburger opens the drawer and its links navigate", async ({ page }) => {
    await page.goto("/");

    const menuButton = page.getByTestId("nav-menu-button");
    const drawer = page.getByTestId("nav-drawer");

    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(drawer).not.toBeVisible();

    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(drawer).toBeVisible();

    // Categories, 주문 조회, BAG and the content pages are all reachable from it.
    await expect(drawer.getByRole("link", { name: "주문 조회" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: /BAG/ })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "브랜드 스토리" })).toBeVisible();

    await drawer.getByRole("link", { name: "기념일" }).click();
    await expect(page).toHaveURL(/\/anniversary$/);
  });

  test("Escape closes the drawer and aria-expanded toggles back", async ({ page }) => {
    await page.goto("/");

    const menuButton = page.getByTestId("nav-menu-button");
    const drawer = page.getByTestId("nav-drawer");

    await menuButton.click();
    await expect(drawer).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    // Explicit close button works too (and the drawer announces itself as a dialog).
    await menuButton.click();
    await expect(drawer).toBeVisible();
    await drawer.getByTestId("nav-drawer-close").click();
    await expect(drawer).not.toBeVisible();
  });

  test("the bar does not wrap: no horizontal overflow at 390px", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
