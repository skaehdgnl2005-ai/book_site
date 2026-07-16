import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAs } from "./_helpers/account";

// F061 — 관리자 맞춤 의뢰 관리: 목록/상세(6묶음 렌더), 상태 전이, 상담 확정(requireApproval).
// 의뢰는 API로 조성(설정된 사용자 대면 인테이크 그대로): WRITTEN은 confirm 라우트(sandbox
// confirm)로 SUBMITTED까지, PHONE은 무결제 REQUESTED 상담.

async function createSubmittedWritten(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/custom/written", {
    data: {
      contactName: "김의뢰",
      contactPhone: "010-1234-5678",
      contactEmail: "custom-admin@example.com",
      withdrawalConsent: true, // F067 — 결제 전 동의(서버 게이트)
      answers: { protagonist: { name: "서연" }, motivation: { occasion: "다섯 번째 생일" } },
    },
  });
  expect(res.ok()).toBeTruthy();
  const { id } = (await res.json()) as { id: string };
  const confirm = await request.post("/api/custom/written/confirm", {
    data: { id, paymentKey: `test_pk_${id}` },
  });
  expect(confirm.ok()).toBeTruthy();
  return id;
}

test.describe("admin custom requests (F061)", () => {
  test("WRITTEN 의뢰: 목록 → 상세(6묶음·연락처·결제 주문 링크) → 검토중 → 제작중 → 완료", async ({ page, request }) => {
    const id = await createSubmittedWritten(request);

    await loginAs(page, "admin+f061flow@example.com");
    await page.goto("/admin/custom");
    const row = page.getByTestId("admin-custom-row").filter({ hasText: id });
    await expect(row).toBeVisible();
    await row.getByTestId("admin-custom-link").click();
    await page.waitForURL(`**/admin/custom/${id}`);

    await expect(page.getByTestId("admin-custom-status")).toHaveText("접수됨");
    await expect(page.getByTestId("admin-custom-contact")).toContainText("김의뢰");
    await expect(page.getByTestId("admin-custom-form")).toContainText("서연");
    await expect(page.getByTestId("admin-custom-form")).toContainText("다섯 번째 생일");
    await expect(page.getByTestId("admin-custom-order-link")).toHaveText(id); // Order.id === CustomRequest.id (F052)

    await page.getByTestId("custom-move-IN_REVIEW").click();
    await expect(page.getByTestId("admin-custom-status")).toHaveText("검토중");
    await page.getByTestId("custom-move-IN_PRODUCTION").click();
    await expect(page.getByTestId("admin-custom-status")).toHaveText("제작중");
    await page.getByTestId("custom-move-COMPLETED").click();
    await expect(page.getByTestId("admin-custom-status")).toHaveText("완료");
    await expect(page.getByTestId("custom-move-IN_REVIEW")).toHaveCount(0); // terminal — no moves
    await expect(page.getByTestId("custom-move-CANCELLED")).toHaveCount(0);
  });

  test("상담 확정은 승인 토큰 없이는 거부되고, 발급 토큰으로만 CONFIRMED가 된다", async ({ page, request }) => {
    const res = await request.post("/api/custom/phone", {
      data: { slot: "2026-07-14T10:00", name: "박부모", phone: "010-9999-0000", memo: "오전 선호" },
    });
    expect(res.ok()).toBeTruthy();
    const { id } = (await res.json()) as { id: string };

    await loginAs(page, "admin+f061consult@example.com");
    await page.goto(`/admin/custom/${id}`);
    await expect(page.getByTestId("admin-custom-consultation")).toContainText("요청됨");

    await page.getByTestId("custom-confirm-consultation").click(); // 토큰 비움 → default-deny
    await expect(page.getByTestId("custom-confirm-error")).toBeVisible();
    await expect(page.getByTestId("admin-custom-consultation")).toContainText("요청됨");

    // `pnpm approve consultation.book`이 발급하는 1회성 의도 토큰(고정 계약: APPROVED:<action>)
    await page.getByTestId("custom-approval-token").fill("APPROVED:consultation.book");
    await page.getByTestId("custom-confirm-consultation").click();
    await expect(page.getByTestId("admin-custom-consultation")).toContainText("확정");
    await expect(page.getByTestId("custom-confirm-consultation")).toHaveCount(0); // no re-confirm
  });

  test("경로·상태 필터가 목록을 좁힌다", async ({ page, request }) => {
    const writtenId = await createSubmittedWritten(request);

    await loginAs(page, "admin+f061filter@example.com");
    await page.goto("/admin/custom?path=PHONE");
    await expect(page.getByTestId("admin-custom-row").filter({ hasText: writtenId })).toHaveCount(0);
    await page.goto("/admin/custom?status=SUBMITTED&path=WRITTEN");
    await expect(page.getByTestId("admin-custom-row").filter({ hasText: writtenId })).toBeVisible();
  });
});
