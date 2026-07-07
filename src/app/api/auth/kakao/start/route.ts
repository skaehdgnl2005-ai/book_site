import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isProductionRuntime } from "@/lib/env";
import { KAKAO_STATE_COOKIE, kakaoProviderFromEnv, sandboxCode } from "@/app/account/_lib/kakao";

export const dynamic = "force-dynamic";

/**
 * F058 — Kakao OAuth entry. Mints a random `state` nonce into an httpOnly cookie (CSRF bind:
 * the callback constant-time-compares it) and redirects to kauth's authorize page. Outside
 * production the round-trip is LOCAL: we redirect straight to our own callback with a sandbox
 * code carrying a deterministic profile (`sbx_id`/`sbx_email` query — E2E's steering wheel;
 * unreachable in production where the real kauth redirect is issued instead). Prod without
 * KAKAO_REST_API_KEY fails closed back to /login.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const redirectUri = `${url.origin}/api/auth/kakao/callback`;
  const state = randomBytes(16).toString("hex");

  let target: string;
  if (isProductionRuntime(process.env)) {
    if (!process.env.KAKAO_REST_API_KEY) {
      return NextResponse.redirect(`${url.origin}/login?error=kakao`); // fail-closed, not a 500
    }
    target = kakaoProviderFromEnv().authorizeUrl(state, redirectUri);
  } else {
    // Hermetic sandbox round-trip (dev / Playwright / pnpm check) — no network.
    const kakaoId = url.searchParams.get("sbx_id") ?? "kakao_sandbox_user";
    const sbxEmail = url.searchParams.get("sbx_email");
    const code = sandboxCode({ kakaoId, email: sbxEmail ? sbxEmail.trim().toLowerCase() : null });
    target = `${url.origin}/api/auth/kakao/callback?code=${encodeURIComponent(code)}&state=${state}`;
  }

  const res = NextResponse.redirect(target);
  res.cookies.set(KAKAO_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_ENV === "production",
    path: "/api/auth/kakao",
    maxAge: 600, // 10분 — an OAuth round-trip, not a session
  });
  return res;
}
