import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mypage capability access (F017/F018). This harness has NO buyer auth and order ids are
 * sequential/guessable, so /mypage proves ownership by matching the buyer's email against
 * `order.buyerEmail`, then mints an HMAC-signed, expiring, httpOnly capability cookie scoped
 * per order. Production replaces this stand-in with real buyer-session auth (documented seam,
 * ADR-0014).
 *
 * The signing key comes from env — never a source literal in production: `MYPAGE_ACCESS_SECRET`,
 * with a deterministic non-prod dev fallback so the hermetic verify/E2E flow works, and
 * FAIL-CLOSED in production when unset (mint + verify both refuse). Mirrors checkout's
 * `webhookSecret()`. The key itself is never logged (R2 spirit).
 *
 * Server-only (node:crypto). The `now`/`env` params are injection seams; the signed `exp` makes
 * a leaked cookie die on its own. Token format: `${exp}.${hmac}`, hmac = HMAC-SHA256 over
 * `${orderId}.${exp}` — so a cookie is bound to ONE order and an attacker without the key cannot
 * forge one for a guessed id.
 */
export const ACCESS_TTL_MS = 2 * 60 * 60 * 1000; // 2h — enough to finish; re-lookup is cheap.

export function accessSecret(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return env.MYPAGE_ACCESS_SECRET ?? (env.APP_ENV !== "production" ? "test_mypage_access_dev" : undefined);
}

export function cookieName(orderId: string): string {
  return `mypage_${orderId}`;
}

/** `${exp}.${hmac}`; null when no secret (fail-closed — e.g. production without MYPAGE_ACCESS_SECRET). */
export function mintAccess(
  orderId: string,
  now: number = Date.now(),
  env: Record<string, string | undefined> = process.env,
): string | null {
  const secret = accessSecret(env);
  if (!secret) return null;
  const exp = now + ACCESS_TTL_MS;
  const hmac = createHmac("sha256", secret).update(`${orderId}.${exp}`).digest("hex");
  return `${exp}.${hmac}`;
}

/** false on: no secret / no token / malformed / expired (now>=exp) / constant-time HMAC mismatch. */
export function verifyAccess(
  orderId: string,
  token: string | null | undefined,
  now: number = Date.now(),
  env: Record<string, string | undefined> = process.env,
): boolean {
  const secret = accessSecret(env);
  if (!secret || !token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  const got = token.slice(dot + 1);
  if (!Number.isFinite(exp) || now >= exp) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}.${exp}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(got, "utf8");
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return timingSafeEqual(a, b);
}
