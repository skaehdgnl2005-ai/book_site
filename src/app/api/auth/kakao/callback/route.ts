import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { KAKAO_STATE_COOKIE, kakaoProviderFromEnv, kakaoRedirectUri } from "@/app/account/_lib/kakao";
import { resolveKakaoLogin } from "@/app/account/_lib/kakaoLogin";
import { userRepo } from "@/app/account/_lib/users";
import { SESSION_COOKIE, SESSION_TTL_MS, mintSession } from "@/app/account/_lib/session";
import { orderRepo } from "@/app/api/payments/_lib/orders";
import { isProductionRuntime, redact } from "@/lib/env";

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
 * oracle about which step broke. The ONE thing that is not a failure: the buyer tapping 취소
 * on Kakao's consent screen, which returns them to /login with no alert.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const secure = isProductionRuntime() || url.protocol === "https:"; // HTTPS previews too (start route)
  const clearState = (res: NextResponse) => {
    res.cookies.set(KAKAO_STATE_COOKIE, "", { path: "/api/auth/kakao", maxAge: 0 });
    return res;
  };
  const fail = () => clearState(NextResponse.redirect(`${url.origin}/login?error=kakao`));
  const cancelled = () => clearState(NextResponse.redirect(`${url.origin}/login`));

  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const cookieState = (await cookies()).get(KAKAO_STATE_COOKIE)?.value ?? "";
  if (!stateMatches(state, cookieState)) return fail(); // CSRF first — before trusting any param

  // Kakao redirects here with ?error=access_denied (state echoed intact) when the buyer declines
  // consent. That is a deliberate choice, not a failure: showing them the red "다시 시도해 주세요"
  // alert tells them to retry the thing they just chose to abort. Any OTHER error code is a real
  // fault and stays uniform.
  const oauthError = url.searchParams.get("error");
  if (oauthError) return oauthError === "access_denied" ? cancelled() : fail();

  let token: string | null;
  try {
    const profile = await kakaoProviderFromEnv().exchange(code, kakaoRedirectUri(url.origin));
    if (!profile) return fail();
    const user = await resolveKakaoLogin(userRepo(), orderRepo(), profile);
    token = mintSession(user.id, user.sessionEpoch);
  } catch (e) {
    // Reached only on the real-Kakao/Prisma path: DB unreachable, a unique-constraint race on a
    // double-submitted callback, an unexpected provider throw. The uniform redirect has to hold
    // here too — a 500 would leak that the state check passed, and would skip the cookie cleanup.
    // NEVER log the token request body (it carries client_secret); the message alone is redacted.
    console.warn("kakao login failed:", redact(String(e)));
    return fail();
  }
  if (!token) return fail(); // no signing secret — fail-closed

  const res = clearState(NextResponse.redirect(`${url.origin}/account`));
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
