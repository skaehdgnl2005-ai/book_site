import { test, expect } from "@playwright/test";

// F087 (트랙 S #2) — the app-wide CSP ships as Content-Security-Policy-Report-Only (middleware) during
// rollout, alongside the still-enforcing frame-ancestors 'none' (next.config). Report-Only never blocks,
// so this spec only asserts the header shape + no double enforcing header. The prod nonce/strict-dynamic
// policy and the real Toss allowlist are validated separately in a live sandbox browser (see DEPLOY.md) —
// the hermetic suite runs `next dev` (permissive dev branch) and cannot exercise them.

test.describe("CSP report-only rollout (F087)", () => {
  test("페이지 응답에 Content-Security-Policy-Report-Only + Reporting-Endpoints가 실린다", async ({ page }) => {
    const res = await page.goto("/");
    expect(res).not.toBeNull();
    const headers = res!.headers();

    const reportOnly = headers["content-security-policy-report-only"] ?? "";
    expect(reportOnly, "report-only CSP 헤더가 있어야 함").not.toBe("");
    expect(reportOnly).toContain("default-src 'self'");
    expect(reportOnly).toContain("script-src");
    expect(reportOnly).toContain("frame-ancestors 'none'");
    expect(reportOnly).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(reportOnly).toContain("report-uri /api/csp-report");

    // 모던 리포팅 그룹 헤더
    expect(headers["reporting-endpoints"] ?? "").toContain("/api/csp-report");
  });

  test("enforcing frame-ancestors는 그대로 유지되고 이중 CSP가 아니다(클릭재킹 방어 무회귀)", async ({ page }) => {
    const res = await page.goto("/");
    const headers = res!.headers();
    // next.config가 싣는 enforcing CSP는 여전히 frame-ancestors 'none'만 (report-only와 헤더명이 달라 무충돌).
    expect(headers["content-security-policy"] ?? "").toBe("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
  });

  test("/api/csp-report는 위반 리포트를 204로 받는다", async ({ request }) => {
    const res = await request.post("/api/csp-report", {
      headers: { "content-type": "application/csp-report" },
      data: JSON.stringify({ "csp-report": { "violated-directive": "script-src", "blocked-uri": "inline" } }),
    });
    expect(res.status()).toBe(204);
  });
});
