import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { devAuthEnabled, isProductionRuntime } from "@/lib/env";
import {
  KAKAO_STATE_COOKIE,
  kakaoProviderFromEnv,
  kakaoRedirectUri,
  sandboxCode,
} from "@/app/account/_lib/kakao";

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
  const redirectUri = kakaoRedirectUri(url.origin); // pinned to BASE_URL when set — KOE006 (kakao.ts)
  const state = randomBytes(16).toString("hex");

  let target: string;
  if (devAuthEnabled(process.env)) {
    // F074 — Hermetic sandbox round-trip (dev / Playwright / pnpm check), non-prod + ALLOW_DEV_AUTH
    // ONLY. Without the opt-in this branch is unreachable, so an arbitrary sbx_email can't mint a
    // session on a public preview/staging box (the callback's provider is also real then — kakao.ts).
    const kakaoId = url.searchParams.get("sbx_id") ?? "kakao_sandbox_user";
    const sbxEmail = url.searchParams.get("sbx_email");
    const code = sandboxCode({ kakaoId, email: sbxEmail ? sbxEmail.trim().toLowerCase() : null });
    target = `${url.origin}/api/auth/kakao/callback?code=${encodeURIComponent(code)}&state=${state}`;
  } else {
    // Real Kakao (production, or a non-prod deploy without dev-auth). No key ⇒ fail-closed to /login.
    if (!process.env.KAKAO_REST_API_KEY) {
      // A MISCONFIGURATION, not an auth outcome — so unlike the callback's uniform failures this one
      // gets a server-side breadcrumb. Without it the only way to discover Kakao login is dead in
      // production is to click the button yourself (`pnpm check` stays green, F058 stays passes:true).
      // No value interpolated: env var NAMES aren't secrets (docs/DEPLOY.md publishes the table),
      // so there is nothing for redact() to mask. /login also hides the button entirely in this
      // state (kakaoLoginAvailable) — this log is for the operator, not the buyer.
      console.warn("kakao login unavailable: KAKAO_REST_API_KEY is not set — see docs/DEPLOY.md");
      return NextResponse.redirect(`${url.origin}/login?error=kakao`); // fail-closed, not a 500
    }
    if (!process.env.KAKAO_CLIENT_SECRET) {
      // Kakao enables Client Secret by DEFAULT on new apps; with it on, a token exchange that omits
      // the parameter fails KOE010 *after* the buyer already granted consent. Warn rather than gate:
      // an app with the secret switched off in console is a legitimate configuration.
      console.warn(
        "kakao login: KAKAO_CLIENT_SECRET is not set — the token exchange fails (KOE010) if the " +
          "Kakao app has Client Secret enabled (default). See docs/DEPLOY.md",
      );
    }
    target = kakaoProviderFromEnv().authorizeUrl(state, redirectUri);
  }

  const res = NextResponse.redirect(target);
  res.cookies.set(KAKAO_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    // HTTPS previews are production-grade transports even though isProductionRuntime() is false
    // there; OR-ing the scheme adds Secure on those without ever removing it where it applied.
    secure: isProductionRuntime() || url.protocol === "https:",
    path: "/api/auth/kakao",
    maxAge: 600, // 10분 — an OAuth round-trip, not a session
  });
  return res;
}
