import { test, expect } from "@playwright/test";
import { addBirthToCart, installTossMock } from "./_helpers/tossMock";

// F067 — 청약철회·환불 정책 페이지 + 결제 전 철회제한 고지·동의 게이트.
// 법정 기준(7일 철회·3영업일 환급·지연배상금·주문제작 제한)이 사용자에게 고지되고,
// 동의 없이는 결제가 진행되지 않는다(클라이언트 즉시 + 서버 최종 게이트).
test.describe("refund policy + withdrawal consent (F067)", () => {
  test("푸터 링크로 정책 페이지에 도달하고 법정 기준이 명시된다", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "청약철회·환불 정책" })
      .click();
    await expect(page).toHaveURL(/\/refund-policy$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "청약철회·환불 정책" }),
    ).toBeVisible();
    const main = page.getByRole("main");
    await expect(main.getByText(/7일 이내/).first()).toBeVisible();
    await expect(main.getByText(/3영업일 이내/).first()).toBeVisible();
    await expect(main.getByText(/지연배상금/).first()).toBeVisible();
    await expect(main.getByText(/주문 제작 상품/).first()).toBeVisible();
  });

  test("FAQ 환불 항목이 정책 페이지로 연결된다 (준비 중 문구 교체)", async ({ page }) => {
    await page.goto("/faq");
    await page.getByText("환불이 되나요?").click();
    const answerLink = page.getByRole("main").getByRole("link", { name: "청약철회·환불 정책" });
    await expect(answerLink).toBeVisible();
    await answerLink.click();
    await expect(page).toHaveURL(/\/refund-policy$/);
  });

  test("체크아웃: 결제 버튼 위 고지가 보이고 동의 없이는 결제가 진행되지 않는다", async ({
    page,
  }) => {
    await installTossMock(page, "success");
    await addBirthToCart(page);
    await page.getByTestId("cart-checkout").click();
    await page.waitForURL("**/checkout");

    // 고지 블록: 결제 전 화면에 존재 + 기본 미체크(사전선택 금지).
    const consent = page.getByTestId("checkout-consent");
    await expect(consent).toBeVisible();
    await expect(consent.getByText(/청약철회.*제한/)).toBeVisible();
    await expect(page.getByTestId("checkout-withdrawal-consent")).not.toBeChecked();

    // 모두 채우되 동의만 빼고 결제 → 진행되지 않고 안내 에러.
    await page.getByTestId("checkout-buyer-name").fill("김부모");
    await page.getByTestId("checkout-buyer-email").fill("parent@example.com");
    await page.getByTestId("checkout-ship-name").fill("김수취");
    await page.getByTestId("checkout-ship-phone").fill("010-2222-3333");
    await page.getByTestId("checkout-ship-zip").fill("04524");
    await page.getByTestId("checkout-ship-address").fill("서울특별시 중구 세종대로 110");
    await page.getByTestId("checkout-pay").click();
    await expect(page.getByTestId("checkout-error")).toContainText("동의해 주세요");
    await expect(page).toHaveURL(/\/checkout$/); // Toss로 넘어가지 않음

    // 동의 후에는 결제가 정상 진행된다 (Toss 성공 → 주문 확인).
    await page.getByTestId("checkout-withdrawal-consent").check();
    await page.getByTestId("checkout-pay").click();
    await page.waitForURL(/\/orders\/ord_/);
    await expect(page.getByTestId("order-grand-total")).toHaveText("43,000원");
  });

  test("서버 게이트: 동의 없는 결제 생성 요청은 400으로 거부된다", async ({ request }) => {
    const res = await request.post("/api/payments/create", {
      data: {
        buyerName: "김부모",
        buyerEmail: "parent@example.com",
        shipName: "김수취",
        shipPhone: "010-2222-3333",
        shipZip: "04524",
        shipAddress: "서울특별시 중구 세종대로 110",
        withdrawalConsent: false,
        qrVideoAddon: false,
        lines: [
          {
            templateKey: "birth",
            coverType: "SOFT",
            unitPriceWon: 43000,
            personalization: {
              childName: "도윤",
              childGender: "MALE",
              extraVar: { kind: "BIRTHDATE", value: "2024-01-15" },
            },
            photo: null,
          },
        ],
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body.errors)).toContain("동의");
  });

  test("맞춤 직접작성: 동의 없이 제출하면 막히고, 서버도 400으로 거부한다", async ({
    page,
    request,
  }) => {
    await page.goto("/custom/written");
    await page.getByLabel("의뢰인 이름").fill("김부모");
    await page.getByLabel("의뢰인 연락처").fill("010-1234-5678");
    await page.getByLabel("의뢰인 이메일").fill("parent@example.com");
    await page.getByLabel("이름", { exact: true }).fill("서연");
    await page.getByRole("button", { name: /결제하고 의뢰서 제출하기/ }).click();
    await expect(page.getByText(/동의해 주세요/)).toBeVisible();
    await expect(page).toHaveURL(/\/custom\/written$/);

    const res = await request.post("/api/custom/written", {
      data: {
        contactName: "김부모",
        contactPhone: "010-1234-5678",
        contactEmail: "parent@example.com",
        answers: { protagonist: { name: "서연" } },
      },
    });
    expect(res.status()).toBe(400);
  });

  test("no horizontal overflow at 375px on /refund-policy", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/refund-policy");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
