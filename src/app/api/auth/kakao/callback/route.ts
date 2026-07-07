import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { KAKAO_STATE_COOKIE, kakaoProviderFromEnv } from "@/app/account/_lib/kakao";
import { resolveKakaoLogin } from "@/app/account/_lib/kakaoLogin";
import { userRepo } from "@/app/account/_lib/users";
import { SESSION_COOKIE, SESSION_TTL_MS, mintSession } from "@/app/account/_lib/session";
import { orderRepo } from "@/app/api/payments/_lib/orders";

export const dynamic = "force-dynamic";

function stateMatches(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

/**
 * F058 — Kakao OAuth callback: ① constant-time state check against the start-minted cookie
 * (CSRF; the cookie dies with this response either way), ② code→token→profile exchange
 * (sandbox outside production), ③ account resolution (kakaoLogin.ts decision table),
 * ④ session cookie + /account. EVERY failure lands on /login?error=kakao — uniform, no
 * oracle about which step broke.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const fail = () => {
    const res = NextResponse.redirect(`${url.origin}/login?error=kakao`);
    res.cookies.set(KAKAO_STATE_COOKIE, "", { path: "/api/auth/kakao", maxAge: 0 });
    return res;
  };

  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const cookieState = (await cookies()).get(KAKAO_STATE_COOKIE)?.value ?? "";
  if (!stateMatches(state, cookieState)) return fail();

  const profile = await kakaoProviderFromEnv().exchange(code, `${url.origin}/api/auth/kakao/callback`);
  if (!profile) return fail();

  const user = await resolveKakaoLogin(userRepo(), orderRepo(), profile);
  const token = mintSession(user.id, user.sessionEpoch);
  if (!token) return fail(); // no signing secret — fail-closed

  const res = NextResponse.redirect(`${url.origin}/account`);
  res.cookies.set(KAKAO_STATE_COOKIE, "", { path: "/api/auth/kakao", maxAge: 0 });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
