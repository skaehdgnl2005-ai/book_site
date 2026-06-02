import { test, expect, type Page } from "@playwright/test";

// F009 — optional photo upload; skip NEVER blocks payment; upload yields an access-controlled
// descriptor (no PII in DOM/URL). Transitively exercises F029.
async function fillInfo(page: Page) {
  await page.goto("/order/birth");
  await page.getByTestId("order-name-input").fill("도윤");
  await page.getByTestId("order-gender-male").check();
  await page.getByTestId("order-extravar-input").fill("2024-01-15");
  await page.getByTestId("order-next").click();
  await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "photo");
}

// 1x1 PNG: non-empty + allowlisted type so storeAsset accepts it.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pdmAAAAAElFTkSuQmCC",
  "base64",
);

test.describe("order photo — optional, skippable (F009)", () => {
  test("skipping proceeds to the cover step (never blocks)", async ({ page }) => {
    await fillInfo(page);
    await page.getByTestId("order-photo-skip").click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "cover");
  });

  test("uploading a valid image shows 첨부됨 without leaking the filename", async ({ page }) => {
    await fillInfo(page);
    await page.getByTestId("order-photo-input").setInputFiles({
      name: "도윤이-돌사진.png", mimeType: "image/png", buffer: PNG,
    });
    await expect(page.getByTestId("order-photo-status")).toHaveText("사진 첨부됨");
    const html = await page.content();
    expect(html).not.toContain("도윤이-돌사진"); // filename (PII) must not reach the DOM
    expect(page.url()).not.toContain("도윤");
    await page.getByTestId("order-next").click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "cover");
  });

  test("an unsupported file shows a friendly error and skip still works", async ({ page }) => {
    await fillInfo(page);
    await page.getByTestId("order-photo-input").setInputFiles({
      name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello"),
    });
    await expect(page.getByTestId("order-photo-error")).toBeVisible();
    await page.getByTestId("order-photo-skip").click();
    await expect(page.getByTestId("order-wizard")).toHaveAttribute("data-step", "cover");
  });
});
