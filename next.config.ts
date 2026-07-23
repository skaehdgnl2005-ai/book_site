import type { NextConfig } from "next";

// F072 (ADR-0024 하드닝) — 앱 전역 보안 헤더. 프레임 차단(X-Frame-Options + CSP frame-ancestors)으로
// /admin이 iframe에 실려 UI-리드레스되는 클릭재킹을 봉쇄하고, HSTS·nosniff·Referrer-Policy·Permissions-Policy로
// 다운그레이드·MIME 스니핑·정보 유출을 줄인다. 전체 CSP(script-src/style-src 등)는 인라인 스타일·하이드레이션과
// 부딪혀 앱을 깨뜨릴 수 있어 후속(트랙 S)에서 nonce와 함께 도입 — 여기서는 앱을 깨지 않는 frame-ancestors만 싣는다.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // F077 — hermetic E2E runs against `pnpm dev`; the floating dev-tools badge sits at the
  // viewport's bottom-left and intercepts clicks on controls there (e.g. the preview
  // viewer's 이전 장 button). Hidden only under the Playwright webServer env flag —
  // normal dev sessions keep the indicator.
  devIndicators: process.env.NEXT_E2E === "1" ? false : undefined,
  experimental: {
    // Child-photo uploads flow through server actions; the default 1MB cap rejects real photos.
    // QR video is collected backstage (option B), not uploaded — so this need only fit photos.
    serverActions: { bodySizeLimit: "25mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
