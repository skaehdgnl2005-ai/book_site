import { test, expect } from "@playwright/test";

// F022 — PHONE path: booking calendar → Consultation stored REQUESTED, no upfront payment.
test.describe("custom PHONE path (F022)", () => {
  test("pick a slot + contact → confirmation shows REQUESTED, pay after the call", async ({ page }) => {
    await page.goto("/custom/phone");
    await expect(page.getByRole("heading", { level: 1, name: /전화 상담 예약/ })).toBeVisible();

    await page.getByTestId("slot").first().check();
    await page.getByLabel("이름").fill("김부모");
    await page.getByLabel("연락처").fill("010-1234-5678");
    await page.getByLabel(/메모/).fill("낮 시간이 좋아요");

    await page.getByRole("button", { name: /이 시간으로 상담 예약하기/ }).click();

    await expect(page).toHaveURL(/\/custom\/complete\/cr_/);
    await expect(page.getByTestId("status")).toHaveText("REQUESTED");
    await expect(page.getByText(/상담 후 결제/)).toBeVisible(); // no upfront payment
  });

  test("empty submit is blocked with an inline error", async ({ page }) => {
    await page.goto("/custom/phone");
    await page.getByRole("button", { name: /이 시간으로 상담 예약하기/ }).click();
    await expect(page.getByText(/입력해 주세요/)).toBeVisible();
    await expect(page).toHaveURL(/\/custom\/phone$/);
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/custom/phone");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
