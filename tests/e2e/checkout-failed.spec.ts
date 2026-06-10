import { test, expect } from "@playwright/test";
import { payAndFail } from "./_helpers/tossMock";

// F015 — a Toss failure shows a clear message and leaves NO PAID order.
test.describe("checkout failure (F015)", () => {
  test("a failed payment shows a clear message and no PAID order is created", async ({ page }) => {
    const orderId = await payAndFail(page);
    await expect(page).toHaveURL(/\/checkout\/failed/);
    await expect(page.getByTestId("checkout-failed")).toBeVisible();
    // The order must NOT be PAID (F015: "No PAID order exists").
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByTestId("order-status")).toHaveText("CREATED");
  });

  test("the failure page offers a way back to the cart", async ({ page }) => {
    await payAndFail(page);
    await page.getByTestId("checkout-failed-back").click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
  });
});
