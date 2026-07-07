/**
 * F056 (ADR-0023 D3) — the global account session: a stateless HMAC cookie, the direct
 * generalization of the per-order capability token (access.ts). No Session table — the token
 * carries `${userId}.${epoch}.${exp}.${hmac}` and `User.sessionEpoch` is the revocation lever
 * ("모든 기기에서 로그아웃" = epoch+1 → every outstanding token's epoch mismatches). The signing
 * key is the existing MYPAGE_ACCESS_SECRET (ADR-0021 D3 "no new secret" precedent; prod boot
 * already requires it) — fail-closed when absent: mint and verify both refuse.
 *
 * Pure (node:crypto only) — the cookies()-touching helpers live in sessionUser.ts so this
 * module stays hermetically unit-testable.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { accessSecret } from "../../mypage/_lib/access";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일 — passwordless 재로그인은 저마찰(OTP 한 번)
export const SESSION_COOKIE = "account_session";

/** `${userId}.${epoch}.${exp}.${hmac}`; null when no secret (fail-closed). Re-mint on login = rotation. */
export function mintSession(
  userId: string,
  epoch: number,
  now: number = Date.now(),
  env: Record<string, string | undefined> = process.env,
): string | null {
  const secret = accessSecret(env);
  if (!secret || !userId || userId.includes(".")) return null; // cuid/usr_ ids never contain "."
  const exp = now + SESSION_TTL_MS;
  const hmac = createHmac("sha256", secret).update(`${userId}.${epoch}.${exp}`).digest("hex");
  return `${userId}.${epoch}.${exp}.${hmac}`;
}

/** Parse + verify: null on no secret / malformed / expired / constant-time HMAC mismatch. */
export function verifySessionToken(
  token: string | null | undefined,
  now: number = Date.now(),
  env: Record<string, string | undefined> = process.env,
): { userId: string; epoch: number } | null {
  const secret = accessSecret(env);
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, epochStr, expStr, got] = parts;
  const epoch = Number(epochStr);
  const exp = Number(expStr);
  if (!userId || !Number.isInteger(epoch) || !Number.isFinite(exp) || now >= exp) return null;
  const expected = createHmac("sha256", secret).update(`${userId}.${epoch}.${exp}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(got, "utf8");
  if (a.length !== b.length) return null; // timingSafeEqual throws on length mismatch
  return timingSafeEqual(a, b) ? { userId, epoch } : null;
}
