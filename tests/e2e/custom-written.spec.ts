import { test, expect } from "@playwright/test";

// F021 — WRITTEN path: fill the 6-group 의뢰서 → pay (Toss test) → request stored SUBMITTED.
test.describe("custom WRITTEN path (F021)", () => {
  test("6-group form → test pay → confirmation shows SUBMITTED", async ({ page }) => {
    await page.goto("/custom/written");
    await expect(page.getByRole("heading", { level: 1, name: /의뢰서/ })).toBeVisible();

    await page.getByLabel("의뢰인 이름").fill("김부모");
    await page.getByLabel("의뢰인 연락처").fill("010-1234-5678");
    await page.getByLabel("이름", { exact: true }).fill("서연");
    await page.getByLabel(/어떤 순간/).fill("다섯 번째 생일"); // exercise an optional group field

    await page.getByRole("button", { name: /결제하고 의뢰서 제출하기/ }).click();

    const pay = page.getByTestId("pay-step");
    await expect(pay).toBeVisible();
    await expect(pay.getByText(/119,000/)).toBeVisible();
    await page.getByRole("button", { name: /결제하기 \(테스트\)/ }).click();

    await expect(page).toHaveURL(/\/custom\/complete\/cr_/);
    await expect(page.getByTestId("status")).toHaveText("SUBMITTED");
    await expect(page.getByTestId("request-id")).toContainText("cr_");
  });

  test("empty submit is blocked with an inline error (no fake success)", async ({ page }) => {
    await page.goto("/custom/written");
    await page.getByRole("button", { name: /결제하고 의뢰서 제출하기/ }).click();
    await expect(page.getByText(/필수입니다/)).toBeVisible(); // inline error (not Next's route announcer)
    await expect(page).toHaveURL(/\/custom\/written$/); // stayed on the form
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/custom/written");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
