import { test, expect } from "@playwright/test";

// F008 — pre-pay minimal form: 아동 이름·성별 + template var (0~1), validated; errors block 다음.
test.describe("order form — validation (F008)", () => {
  test("empty required fields block progress with clear errors", async ({ page }) => {
    await page.goto("/order/birth");
    await page.getByTestId("order-next").click();
    await expect(page.getByTestId("order-error-childName")).toBeVisible();
    await expect(page.getByTestId("order-error-childGender")).toBeVisible();
    await expect(page.getByTestId("order-error-extraVar")).toBeVisible();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "info");
  });

  test("valid input advances to the photo step", async ({ page }) => {
    await page.goto("/order/birth");
    await page.getByTestId("order-name-input").fill("도윤");
    await page.getByTestId("order-gender-male").check();
    await page.getByTestId("order-extravar-input").fill("2024-01-15");
    await page.getByTestId("order-next").click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "photo");
  });

  test("a no-extra-var template (백일) validates with just 이름·성별", async ({ page }) => {
    await page.goto("/order/hundred_days");
    await page.getByTestId("order-name-input").fill("서아");
    await page.getByTestId("order-gender-female").check();
    await page.getByTestId("order-next").click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "photo");
  });

  test("became_sibling shows two distinct gender labels", async ({ page }) => {
    await page.goto("/order/became_sibling");
    await expect(page.getByText("우리 아이(형·누나가 될 아이) 성별")).toBeVisible();
    await expect(page.getByText("새로 태어난 동생의 성별")).toBeVisible();
  });
});
