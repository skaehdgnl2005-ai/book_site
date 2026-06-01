import { test, expect } from "@playwright/test";

// F020 — 맞춤 제작 landing: two paths side-by-side, each routing to its flow.
test.describe("custom landing (맞춤 제작)", () => {
  test("shows the two path routes + 119,000원, each link pointing at its flow", async ({ page }) => {
    await page.goto("/custom");

    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /맞춤 제작/ })).toBeVisible();
    await expect(page.getByText(/119,000/)).toBeVisible();

    // The two paths (scoped so nav links don't interfere).
    const paths = page.getByTestId("custom-paths");
    await expect(paths).toBeVisible();
    const phone = paths.getByRole("link", { name: /전화로 상담 예약하기/ });
    const written = paths.getByRole("link", { name: /직접 작성하기/ });
    await expect(phone).toBeVisible();
    await expect(written).toBeVisible();
    // "Each routes to its flow" — verified by the href target.
    await expect(phone).toHaveAttribute("href", "/custom/phone");
    await expect(written).toHaveAttribute("href", "/custom/written");
  });

  test("clicking 직접 작성하기 navigates into the written flow", async ({ page }) => {
    await page.goto("/custom");
    await page.getByTestId("custom-paths").getByRole("link", { name: /직접 작성하기/ }).click();
    await expect(page).toHaveURL(/\/custom\/written$/);
  });

  test("clicking 전화로 상담 예약하기 navigates into the phone flow", async ({ page }) => {
    await page.goto("/custom");
    await page.getByTestId("custom-paths").getByRole("link", { name: /전화로 상담 예약하기/ }).click();
    await expect(page).toHaveURL(/\/custom\/phone$/);
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/custom");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
