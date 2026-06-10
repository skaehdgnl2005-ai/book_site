import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";

// F014 — the order confirmation page shows items, cover, total and status PAID.

test.describe("order confirmation (F014)", () => {
  test("shows the item (label + cover), grand total and PAID status", async ({ page }) => {
    const orderId = await completePaidOrder(page);
    await expect(page.getByTestId("order-id")).toContainText(orderId);
    await expect(page.getByTestId("order-item")).toHaveCount(1);
    await expect(page.getByTestId("order-item-title")).toHaveText("탄생");
    await expect(page.getByTestId("order-item-cover")).toHaveText("소프트커버");
    await expect(page.getByTestId("order-grand-total")).toHaveText("43,000원");
    await expect(page.getByTestId("order-status")).toHaveText("PAID");
  });

  test("a hard-cover order reflects 49,000원", async ({ page }) => {
    await completePaidOrder(page, { coverHard: true });
    await expect(page.getByTestId("order-item-cover")).toHaveText("하드커버");
    await expect(page.getByTestId("order-grand-total")).toHaveText("49,000원");
  });

  test("an unknown order id is a 404", async ({ page }) => {
    const res = await page.goto("/orders/ord_nonexistent");
    expect(res?.status()).toBe(404);
  });

  test("no horizontal overflow at 375px on the order page (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await completePaidOrder(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
