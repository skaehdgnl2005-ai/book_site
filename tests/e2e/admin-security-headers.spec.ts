import { test, expect } from "@playwright/test";
import { loginAs } from "./_helpers/account";

// F072 (ADR-0024 하드닝, 트랙 S #1) — 앱 전역 보안 헤더. /admin이 iframe에 실려 UI-리드레스로
// 승인 없는 전이(advanceOrder)를 당하는 경로를 프레임 차단 헤더로 봉쇄하고, 전송/콘텐츠 보안
// 헤더로 다운그레이드·MIME 스니핑을 줄인다. 헤더는 next.config가 전역(source "/:path*")으로 싣는다.

function expectSecurityHeaders(headers: Record<string, string>): void {
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"] ?? "").toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["strict-transport-security"] ?? "").toContain("max-age=");
  expect(headers["referrer-policy"]).toBeTruthy();
  expect(headers["permissions-policy"]).toBeTruthy();
}

test.describe("security headers (F072)", () => {
  test("구매자 페이지 응답에 클릭재킹·전송 보안 헤더가 실린다", async ({ page }) => {
    const res = await page.goto("/");
    expect(res, "홈 응답이 존재해야 함").not.toBeNull();
    expectSecurityHeaders(res!.headers());
  });

  test("관리자 페이지 응답에도 같은 보안 헤더가 실린다", async ({ page }) => {
    // 스펙별 고유 관리자(plus-address 폴백 패밀리) — 병렬 스펙 간 OTP 단일사용/발송캡 경합 방지
    await loginAs(page, "admin+f072headers@example.com");
    const res = await page.goto("/admin/orders");
    expect(res?.status()).toBe(200);
    expectSecurityHeaders(res!.headers());
  });

  test("비로그인 /admin 404(존재 은닉) 응답도 프레임 차단 헤더를 싣는다", async ({ page }) => {
    // 클릭재킹 방어는 상태코드와 무관해야 한다 — 404 존재 은닉 페이지도 iframe에 실리면 안 됨.
    const res = await page.goto("/admin/orders");
    expect(res?.status()).toBe(404);
    const headers = res!.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"] ?? "").toContain("frame-ancestors 'none'");
  });
});
