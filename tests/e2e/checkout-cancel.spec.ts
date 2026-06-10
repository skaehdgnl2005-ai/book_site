import { test, expect } from "@playwright/test";
import { payAndCancel } from "./_helpers/tossMock";

// F016 — cancelling at Toss (code=PAY_PROCESS_CANCELED) returns to the cart with items preserved.
test.describe("checkout cancel (F016)", () => {
  test("cancelling returns to the cart with the item still present", async ({ page }) => {
    await payAndCancel(page);
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("cart-grand-total")).toHaveText("43,000원");
  });
});
