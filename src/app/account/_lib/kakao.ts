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

/**
 * F058 — OAuth redirect_uri, PINNED. Kakao matches this string EXACTLY against the console-
 * registered value (mismatch ⇒ KOE006 on kauth's own error page, before control ever returns to
 * us — our fail-closed redirect never gets a say) and requires the authorize and token calls to
 * agree. Deriving it from the inbound host would vary per hostname: Vercel serves one deployment
 * under the custom domain, <project>.vercel.app AND a per-deploy alias, so a buyer arriving on the
 * "wrong" one would break. Pin to BASE_URL when the operator set one; fall back to the request
 * origin (local dev / previews, where no fixed URL exists to register).
 *
 * Reads RAW process.env on purpose: parseEnv() defaults BASE_URL to http://localhost:3000, and
 * that default flowing in here would pin production's redirect_uri to localhost.
 */
export function kakaoRedirectUri(
  origin: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const base = env.BASE_URL?.trim();
  const root = base && /^https?:\/\/\S+$/.test(base) ? base.replace(/\/+$/, "") : origin;
  return `${root}/api/auth/kakao/callback`;
}

/**
 * F058 — can Kakao login actually complete on THIS server? /login hides the button when it can't:
 * a button that is guaranteed to bounce the buyer back to an error is worse than no button, and
 * the generic failure page gives them nothing to act on. Mirrors the start route's fail-closed
 * gate so the two can't disagree.
 */
export function kakaoLoginAvailable(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return devAuthEnabled(env) || Boolean(env.KAKAO_REST_API_KEY);
}

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
  // Kakao types `id` as a Long. JSON.parse yields a JS number, which silently ROUNDS above 2^53 —
  // two distinct Kakao users could then collapse onto one kakaoId (account takeover) or a returning
  // user could miss their own row. Today's ids are ~10 digits, so this only ever fires if Kakao
  // widens them; fail closed rather than mint a session for the wrong identity.
  if (typeof o.id === "number" && !Number.isSafeInteger(o.id)) return null;
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
      // The whole exchange is wrapped: the contract above promises "null on ANY failure", but
      // fetch REJECTS on DNS/TLS/timeout and .json() THROWS on a non-JSON body (kauth serves HTML
      // on 5xx/maintenance). Un-caught, those surface as a 500 from the callback — which is itself
      // an oracle (a 500 tells an attacker the state check passed) and skips the cookie cleanup.
      try {
        const tokenRes = await transport(KAUTH_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
          body: body.toString(),
        });
        if (!tokenRes.ok) {
          // STATUS ONLY — the request body carries client_secret and must never reach a log.
          // 401 here is almost always KOE010 (Client Secret enabled in console but not configured).
          console.warn("kakao token exchange rejected:", tokenRes.status);
          return null;
        }
        const token = (await tokenRes.json()) as { access_token?: unknown };
        if (typeof token.access_token !== "string" || !token.access_token) return null;

        const meRes = await transport(KAPI_ME_URL, {
          method: "GET",
          headers: { Authorization: `Bearer ${token.access_token}` },
        });
        if (!meRes.ok) {
          console.warn("kakao profile fetch rejected:", meRes.status); // status only — bearer token in headers
          return null;
        }
        return parseKakaoProfile(await meRes.json());
      } catch {
        return null; // network reject / malformed body — honor the documented contract
      }
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
