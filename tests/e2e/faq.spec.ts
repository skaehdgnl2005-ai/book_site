import { test, expect } from "@playwright/test";

// F027 — FAQ. Native <details> accordions covering the brief's 5 topics
// (제작 기간·커스텀 범위·배송·사진/영상 업로드·환불). Answer is hidden until its summary
// is clicked. 환불 has no brief policy → honest flagged answer (no invented terms).
test.describe("faq (자주 묻는 질문)", () => {
  test("renders grouped Q&A; a summary expands its answer; 환불 present", async ({ page }) => {
    await page.goto("/faq");
    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /자주 묻는 질문|FAQ/ })).toBeVisible();

    const answer = page.getByText(/주문 후 일주일 이내/); // unique to the 제작 기간 answer
    await expect(answer).toBeHidden(); // collapsed by default
    await page.getByText("제작 기간은 얼마나 걸리나요?").click();
    await expect(answer).toBeVisible(); // revealed on click

    await expect(page.getByText("환불이 되나요?")).toBeVisible(); // refund topic present
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/faq");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
