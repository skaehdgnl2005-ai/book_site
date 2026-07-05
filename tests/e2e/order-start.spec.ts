import { test, expect } from "@playwright/test";

// F007 — template select starts the flow; the correct extra-var field (0~1) is resolved
// per template. Hermetic: /order/<key> resolves via the seed mirror (no DB in E2E).
test.describe("order start — extra-var resolved per template (F007)", () => {
  test("birth (탄생) requests 생년월일 on the info step", async ({ page }) => {
    await page.goto("/order/birth");
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "info");
    await expect(page.getByTestId("order-extravar-label")).toHaveText("생년월일");
  });

  test("hundred_days (백일) requests NO extra-var field", async ({ page }) => {
    await page.goto("/order/hundred_days");
    await expect(page.getByTestId("order-wizard")).toBeVisible();
    await expect(page.getByTestId("order-extravar-label")).toHaveCount(0);
  });

  test("became_sibling requests the sibling gender with a distinct label", async ({ page }) => {
    await page.goto("/order/became_sibling");
    await expect(page.getByTestId("order-extravar-label")).toHaveText("새로 태어난 동생의 성별");
  });

  test("an unknown template key is a 404", async ({ page }) => {
    const res = await page.goto("/order/not-a-real-key");
    expect(res?.status()).toBe(404);
  });

  // F048 — funnel context: the wizard header carries the template's story blurb plus
  // what's-in-the-box + lead time, and the photo step explains why the photo is asked.
  test("wizard carries product context: blurb, 기본 구성, 제작 기간, photo purpose (F048)", async ({
    page,
  }) => {
    await page.goto("/order/birth");
    await expect(page.getByText("세상에 처음 온 그날의 설렘을 한 권에 담아.")).toBeVisible();
    const included = page.getByTestId("order-included");
    await expect(included).toContainText("자석 외함");
    await expect(included).toContainText("축하 카드");
    await expect(included).toContainText("일주일");

    // Walk to the photo step and check the purpose hint.
    await page.getByTestId("order-name-input").fill("도윤");
    await page.getByTestId("order-gender-male").check();
    await page.getByTestId("order-extravar-input").fill("2024-01-15");
    await page.getByTestId("order-next").click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "photo");
    await expect(page.getByTestId("order-photo-hint")).toContainText("주인공의 모습");
  });

  test("no horizontal overflow at 375px (F035)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/order/birth");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
