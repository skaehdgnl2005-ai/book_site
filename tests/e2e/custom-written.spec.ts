import { test, expect } from "@playwright/test";
import { installTossMock } from "./_helpers/tossMock";

// F021/F052 — WRITTEN path: fill the 6-group 의뢰서 → REAL Toss SDK window (hermetic mock,
// F044 parity — no hardcoded paymentKey) → success redirect settles server-side → SUBMITTED.
test.describe("custom WRITTEN path (F021 + F052 settle)", () => {
  test("6-group form → Toss SDK pay → settle → confirmation shows SUBMITTED (PRG: no paymentKey in URL)", async ({ page }) => {
    await installTossMock(page, "success"); // BEFORE first navigation
    await page.goto("/custom/written");
    await expect(page.getByRole("heading", { level: 1, name: /의뢰서/ })).toBeVisible();

    await page.getByLabel("의뢰인 이름").fill("김부모");
    await page.getByLabel("의뢰인 연락처").fill("010-1234-5678");
    await page.getByLabel("의뢰인 이메일").fill("parent@example.com");
    await page.getByLabel("이름", { exact: true }).fill("서연");
    await page.getByLabel(/어떤 순간/).fill("다섯 번째 생일"); // exercise an optional group field
    await page.getByTestId("written-withdrawal-consent").check(); // F067 — 철회 제한 동의

    await page.getByRole("button", { name: /결제하고 의뢰서 제출하기/ }).click();

    const pay = page.getByTestId("pay-step");
    await expect(pay).toBeVisible();
    await expect(pay.getByText(/119,000/)).toBeVisible();
    await page.getByRole("button", { name: /결제하기 \(테스트\)/ }).click();

    // Toss success redirect → server settle → PRG redirect to the param-less confirmation.
    await expect(page).toHaveURL(/\/custom\/complete\/cr_[^?]*$/);
    expect(page.url()).not.toContain("paymentKey"); // never lingers in the address bar
    await expect(page.getByTestId("status")).toHaveText("SUBMITTED");
    await expect(page.getByTestId("request-id")).toContainText("cr_");
    await expect(page.getByTestId("payment")).toContainText("결제 완료");

    // Reload replays nothing (settle is idempotent) — the state is persisted, not transient.
    await page.reload();
    await expect(page.getByTestId("status")).toHaveText("SUBMITTED");
  });

  test("empty submit is blocked with an inline error (no fake success)", async ({ page }) => {
    await page.goto("/custom/written");
    await page.getByRole("button", { name: /결제하고 의뢰서 제출하기/ }).click();
    await expect(page.getByText(/필수입니다/)).toBeVisible(); // inline error (not Next's route announcer)
    await expect(page).toHaveURL(/\/custom\/written$/); // stayed on the form
  });

  test("an unpaid request's confirmation is honest — no phantom 결제 완료", async ({ page, request }) => {
    // Create the request (step 1) WITHOUT paying → stored PENDING_PAYMENT.
    const res = await request.post("/api/custom/written", {
      data: {
        contactName: "김부모",
        contactPhone: "010-1234-5678",
        contactEmail: "parent@example.com",
        withdrawalConsent: true, // F067 — 결제 전 동의(서버 게이트)
        answers: { protagonist: { name: "서연" } },
      },
    });
    expect(res.ok()).toBeTruthy();
    const { id } = await res.json();

    await page.goto(`/custom/complete/${id}`);
    await expect(page.getByTestId("status")).toHaveText("PENDING_PAYMENT");
    await expect(page.getByText("테스트 결제 완료")).toHaveCount(0); // never claims payment done
    await expect(page.getByTestId("payment")).toContainText("아직 결제가 완료되지 않았습니다");
  });

  test("step-1 API rejects a missing/malformed contact email (F052 — Order needs buyerEmail)", async ({ request }) => {
    const base = {
      contactName: "김부모",
      contactPhone: "010-1234-5678",
      answers: { protagonist: { name: "서연" } },
    };
    const missing = await request.post("/api/custom/written", { data: base });
    expect(missing.status()).toBe(400);
    const malformed = await request.post("/api/custom/written", {
      data: { ...base, contactEmail: "not-an-email" },
    });
    expect(malformed.status()).toBe(400);
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
