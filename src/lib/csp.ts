/**
 * F087 (트랙 S) — the app-wide Content-Security-Policy value. Pure (no Next runtime) so it is
 * unit-testable; src/middleware.ts wires it with a per-request nonce.
 *
 * Two branches:
 *  - dev (`next dev`): HMR + React Refresh need `unsafe-inline`/`unsafe-eval` and the ws:// HMR socket.
 *    NEVER shipped to production.
 *  - prod (`next start`): `nonce-<n>` + `strict-dynamic` is the real script-injection protection — no
 *    `unsafe-inline` for scripts, ever. Next auto-nonces its own inline hydration scripts (it reads the
 *    nonce from the request CSP header the middleware sets), and `strict-dynamic` then authorizes
 *    everything those trusted scripts load — chunks from /_next AND the dynamically-imported Toss SDK
 *    (js.tosspayments.com, tossClient.ts). `https://js.tosspayments.com` is the CSP-Level-2 fallback for
 *    browsers that ignore `strict-dynamic`.
 *
 * Non-script directives are traced to real runtime needs: fonts (googleapis/gstatic/jsdelivr) and the
 * TossPayments browser surface (*.tosspayments.com for connect/frame/img). `form-action` is DELIBERATELY
 * OMITTED — Toss's card-auth step sends the top-level browser to card-issuer/bank/PG domains we cannot
 * enumerate, and form-action does NOT fall back to default-src, so omitting it keeps checkout alive.
 *
 * Rolled out as Content-Security-Policy-Report-Only first (see middleware): the hermetic E2E suite stubs
 * the Toss SDK and aborts js.tosspayments.com, so it can never prove the real Toss allowlist — only a live
 * TEST/sandbox browser run can. Report-Only closes the defense-in-depth gap with zero blast radius.
 */
export const CSP_REPORT_PATH = "/api/csp-report";

export function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.tosspayments.com`;

  const connectSrc = isDev
    ? "connect-src 'self' https://*.tosspayments.com ws://localhost:* http://localhost:*"
    : "connect-src 'self' https://*.tosspayments.com";

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    scriptSrc,
    // App Router inlines critical CSS as <style> tags; nonce-ing styles is unreliable, so unsafe-inline
    // for styles (far lower risk than scripts) + the two font-stylesheet hosts (<link> in layout.tsx).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    // gstatic = Google Fonts woff2; jsdelivr = Pretendard woff2.
    "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
    // self = /images, /previews, /_next/image; blob: = child-photo upload thumbnail (createObjectURL);
    // data: defensive; *.tosspayments.com = 결제위젯 method/brand icons.
    "img-src 'self' data: blob: https://*.tosspayments.com",
    connectSrc,
    // Toss renders the pay step as an iframe overlay in our document.
    "frame-src https://*.tosspayments.com",
    // preserve the anti-clickjacking guarantee (also carried statically in next.config.ts).
    "frame-ancestors 'none'",
    "media-src 'none'",
    // self+blob so a Toss runtime Web Worker (fraud/fingerprint) isn't blocked, while off-origin workers are.
    "worker-src 'self' blob:",
    `report-uri ${CSP_REPORT_PATH}`,
    "report-to csp",
  ];

  // prod only: upgrade stray http subresources. MUST NOT run in dev or it upgrades the ws:// HMR socket.
  if (!isDev) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}
