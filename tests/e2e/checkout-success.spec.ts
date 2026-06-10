import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";

// F013 — a successful Toss (test) payment confirms the order PAID and lands on the order page.
test.describe("checkout success (F013)", () => {
  test("a successful payment marks the order PAID and shows the confirmation", async ({ page }) => {
    const orderId = await completePaidOrder(page);
    expect(orderId).toMatch(/^ord_/);
    await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
    await expect(page.getByTestId("order-status")).toHaveText("PAID");
    await expect(page.getByTestId("order-grand-total")).toHaveText("43,000원");
    await expect(page.getByTestId("order-item")).toHaveCount(1);
  });

  test("the paid order persists on reload (server-side order store)", async ({ page }) => {
    const orderId = await completePaidOrder(page, { coverHard: true });
    await page.reload();
    await expect(page.getByTestId("order-status")).toHaveText("PAID");
    await expect(page.getByTestId("order-grand-total")).toHaveText("49,000원");
    expect(page.url()).toContain(orderId);
  });
});
