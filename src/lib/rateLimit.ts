/**
 * F085 (보안 감사 #2) — best-effort per-IP rate limiter for public POST surfaces.
 *
 * Serverless caveat: this is an in-process fixed-window counter cached on globalThis, so on Vercel it
 * limits PER INSTANCE, not globally. Real distributed rate limiting is layered by Vercel WAF/Edge
 * (docs/DEPLOY.md checklist). This app layer still blunts single-instance burst abuse and is
 * defense-in-depth. Mirrors the two-tier posture of the OTP store (in-memory hermetic + real backstop).
 *
 * Enforcement is production-only: enforceRateLimit() BYPASSES under the non-production dev-auth opt-in
 * (devAuthEnabled) so the hermetic fullyParallel E2E — every request from one localhost IP — cannot trip
 * a false 429. In production (devAuthEnabled is forced false) it always enforces (fail-closed).
 */
import { devAuthEnabled } from "./env";

export interface RateLimitOptions {
  /** Max hits allowed per window, per key. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** ms until the current window resets (0 when allowed). */
  retryAfterMs: number;
}

type Bucket = { windowStart: number; count: number };

// globalThis singleton (survives HMR / module reload; per-instance on serverless). The orders/otp pattern.
const g = globalThis as unknown as { __rateLimitStore?: Map<string, Bucket> };
function store(): Map<string, Bucket> {
  return (g.__rateLimitStore ??= new Map<string, Bucket>());
}

/**
 * Pure fixed-window limiter: counts one hit against `key` and reports whether it is allowed. `now` is an
 * injection seam for tests. A fresh key (or an elapsed window) starts a new window; at/over the limit it
 * denies with the remaining window time.
 */
export function rateLimit(
  key: string,
  opts: RateLimitOptions,
  now: number = Date.now(),
): RateLimitResult {
  const m = store();
  const b = m.get(key);
  if (!b || now - b.windowStart >= opts.windowMs) {
    m.set(key, { windowStart: now, count: 1 });
    return { ok: true, remaining: opts.limit - 1, retryAfterMs: 0 };
  }
  if (b.count >= opts.limit) {
    return { ok: false, remaining: 0, retryAfterMs: b.windowStart + opts.windowMs - now };
  }
  b.count += 1;
  return { ok: true, remaining: opts.limit - b.count, retryAfterMs: 0 };
}

/**
 * Production-only enforcement. Bypasses (never counts) under the non-production dev-auth opt-in so the
 * hermetic E2E's single-IP burst can't self-throttle; enforces rateLimit everywhere else — crucially,
 * production forces devAuthEnabled false, so a prod box with a stray ALLOW_DEV_AUTH still enforces.
 */
export function enforceRateLimit(
  key: string,
  opts: RateLimitOptions,
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now(),
): RateLimitResult {
  if (devAuthEnabled(env)) return { ok: true, remaining: opts.limit, retryAfterMs: 0 };
  return rateLimit(key, opts, now);
}

/**
 * Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). Spoofable without a trusted
 * proxy — which is exactly why production also relies on Vercel WAF; this only keys the app-layer limiter.
 * Falls back to a constant so a header-less request still shares one bucket rather than escaping the limit.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  return "unknown";
}

// ── Named per-IP limits ─────────────────────────────────────────────────────────
/** Public intake POSTs (custom/phone, custom/written, payments/create) — low-frequency human actions. */
export const RL_INTAKE: RateLimitOptions = { limit: 20, windowMs: 60_000 };
/** Login-OTP send (requestLoginCode) — bounds the distinct-address mail-bomb; complements per-email cap. */
export const RL_LOGIN_SEND: RateLimitOptions = { limit: 15, windowMs: 60 * 60_000 };
/** Child-photo uploads — bounds unauthenticated large-body flooding of the upload path. */
export const RL_UPLOAD: RateLimitOptions = { limit: 30, windowMs: 60_000 };
/**
 * F092 전환 지표 비컨 — RL_INTAKE(20/분)와 달리 정상 탐색이 분당 수십 이벤트를 낸다(페이지뷰
 * + 스크롤 임계 4 + CTA; 빠른 퍼널 완주 ≈ 30+/분, NAT 뒤 다중 사용자는 배수). 20이면 하단
 * 퍼널 이벤트가 조용히 유실돼 지표 자체가 계통 왜곡된다(적대적 검수 확정 #2). 120/분은 실사용
 * 버스트를 수용하면서 남용은 계속 유한하게 막는다.
 */
export const RL_EVENTS: RateLimitOptions = { limit: 120, windowMs: 60_000 };
