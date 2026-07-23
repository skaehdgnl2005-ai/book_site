/**
 * F058 (ADR-0023 D4) — Kakao OAuth, hand-rolled (no auth library; ~3 calls) with an injectable
 * transport (the TossTransport precedent) so the token/user-info exchange is hermetically
 * unit-tested. Outside production a SANDBOX provider stands in: the whole authorize→callback
 * round-trip happens locally (the code carries a deterministic profile), so Playwright can walk
 * the real routes with zero network — the customTossProvider pattern. The sandbox is impossible
 * in production (isProductionRuntime gate).
 *
 * Email trust rule: kapi's email is accepted ONLY when Kakao asserts BOTH is_email_valid and
 * is_email_verified — an unverified email must never auto-link an account (takeover vector).
 */
import { devAuthEnabled } from "../../../lib/env";

export interface KakaoProfile {
  kakaoId: string;
  /** lowercase; non-null ONLY when Kakao verified ownership (valid && verified). */
  email: string | null;
}

/** CSRF state cookie for the OAuth round-trip (start mints, callback consumes). */
export const KAKAO_STATE_COOKIE = "kakao_oauth_state";

export interface KakaoResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type KakaoTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<KakaoResponseLike>;

const defaultTransport: KakaoTransport = (url, init) => fetch(url, init) as unknown as Promise<KakaoResponseLike>;

const KAUTH_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAPI_ME_URL = "https://kapi.kakao.com/v2/user/me";
const KAUTH_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";

export interface KakaoProvider {
  readonly name: string;
  authorizeUrl(state: string, redirectUri: string): string;
  /** code → verified profile; null on ANY failure (bad code, non-2xx, malformed body). */
  exchange(code: string, redirectUri: string): Promise<KakaoProfile | null>;
}

/** kapi /v2/user/me → profile. Email only under Kakao's own valid+verified assertion. */
export function parseKakaoProfile(me: unknown): KakaoProfile | null {
  const o = (me && typeof me === "object" ? me : {}) as {
    id?: unknown;
    kakao_account?: { email?: unknown; is_email_valid?: unknown; is_email_verified?: unknown };
  };
  if (o.id == null || (typeof o.id !== "number" && typeof o.id !== "string")) return null;
  const acc = o.kakao_account && typeof o.kakao_account === "object" ? o.kakao_account : {};
  const email =
    typeof acc.email === "string" && acc.is_email_valid === true && acc.is_email_verified === true
      ? acc.email.trim().toLowerCase()
      : null;
  return { kakaoId: String(o.id), email };
}

export interface KakaoConfig {
  restApiKey: string;
  clientSecret?: string;
  transport?: KakaoTransport;
}

export function realKakaoProvider(config: KakaoConfig): KakaoProvider {
  const transport = config.transport ?? defaultTransport;
  return {
    name: "kakao",
    authorizeUrl(state, redirectUri) {
      const q = new URLSearchParams({
        client_id: config.restApiKey,
        redirect_uri: redirectUri,
        response_type: "code",
        state,
      });
      return `${KAUTH_AUTHORIZE_URL}?${q.toString()}`;
    },
    async exchange(code, redirectUri) {
      if (!code || !config.restApiKey) return null;
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.restApiKey,
        redirect_uri: redirectUri,
        code,
      });
      if (config.clientSecret) body.set("client_secret", config.clientSecret);
      const tokenRes = await transport(KAUTH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: body.toString(),
      });
      if (!tokenRes.ok) return null;
      const token = (await tokenRes.json()) as { access_token?: unknown };
      if (typeof token.access_token !== "string" || !token.access_token) return null;

      const meRes = await transport(KAPI_ME_URL, {
        method: "GET",
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!meRes.ok) return null;
      return parseKakaoProfile(await meRes.json());
    },
  };
}

// ── Sandbox (non-production ONLY): the code IS the profile ─────────────────────────
const SBX_PREFIX = "sbx_";

export function sandboxCode(profile: KakaoProfile): string {
  return SBX_PREFIX + Buffer.from(JSON.stringify(profile), "utf8").toString("base64url");
}

export function sandboxKakaoProvider(): KakaoProvider {
  return {
    name: "kakao-sandbox",
    authorizeUrl() {
      return ""; // never used — the start route short-circuits to the callback in non-prod
    },
    async exchange(code) {
      if (!code.startsWith(SBX_PREFIX)) return null;
      try {
        const parsed = JSON.parse(Buffer.from(code.slice(SBX_PREFIX.length), "base64url").toString("utf8")) as {
          kakaoId?: unknown;
          email?: unknown;
        };
        if (typeof parsed.kakaoId !== "string" || !parsed.kakaoId) return null;
        return {
          kakaoId: parsed.kakaoId,
          email: typeof parsed.email === "string" && parsed.email ? parsed.email.trim().toLowerCase() : null,
        };
      } catch {
        return null;
      }
    },
  };
}

export function kakaoProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): KakaoProvider {
  // F074 — 샌드박스(임의 sbx_email 신원 발급)는 dev-auth 옵트인(비프로덕션+ALLOW_DEV_AUTH)에서만.
  // 그 외(프로덕션, 또는 플래그 없는 비프로덕션)는 실 카카오 provider — 키/네트워크 없으면 exchange가
  // null로 fail-closed. provider를 한 곳에서 게이트하므로 start·callback 양쪽이 함께 닫힌다(직접 callback
  // 타격으로 크래프트한 sandboxCode를 넣어도 real provider가 해독하지 않음).
  if (devAuthEnabled(env)) return sandboxKakaoProvider();
  return realKakaoProvider({ restApiKey: env.KAKAO_REST_API_KEY ?? "", clientSecret: env.KAKAO_CLIENT_SECRET });
}
