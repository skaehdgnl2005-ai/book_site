import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, CSP_REPORT_PATH } from "./lib/csp";

/**
 * F087 (트랙 S) — app-wide Content-Security-Policy with a per-request nonce.
 *
 * ROLLOUT SWITCH: keep REPORT_ONLY = true until the REAL TossPayments allowlist has been validated
 * against a live TEST/sandbox checkout in a real browser (결제위젯 CheckoutView + 맞춤 written 결제창 +
 * ≥1 간편결제). The Playwright suite mocks the SDK and ABORTS js.tosspayments.com (tests/e2e/_helpers/
 * tossMock.ts) and CDP init scripts bypass CSP, so it can NEVER prove the Toss hosts are complete — only
 * a real browser against sandbox can. When flipping to false (enforce), ALSO remove the static
 * `Content-Security-Policy: frame-ancestors 'none'` entry from next.config.ts (this policy already carries
 * frame-ancestors 'none') so the browser doesn't receive two enforcing CSP headers. See docs/DEPLOY.md.
 */
const REPORT_ONLY = true;

export function middleware(request: NextRequest): NextResponse {
  const isDev = process.env.NODE_ENV !== "production";

  // Per-request nonce. Web Crypto + btoa are available in the Edge middleware runtime (no Node Buffer).
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const csp = buildCsp(nonce, isDev);

  // Forward the nonce + CSP on the REQUEST headers so Next auto-nonces its own inline hydration scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(
    REPORT_ONLY ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
    csp,
  );
  // Modern reporting group (report-to). report-uri (in the CSP) is the legacy fallback.
  response.headers.set("Reporting-Endpoints", `csp="${CSP_REPORT_PATH}"`);
  return response;
}

export const config = {
  // Every document (page) response gets a fresh nonce. Skip /api (JSON, no scripts), static assets and
  // the image optimizer (execute no scripts), and RSC prefetches (perf) — those need no CSP document header.
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf|css|js|map)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
