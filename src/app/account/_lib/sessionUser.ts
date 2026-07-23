/**
 * F056 — cookies()-touching session helpers (split from the pure session.ts so that module
 * stays unit-testable without Next request APIs). Every caller re-verifies: HMAC + expiry
 * (verifySessionToken) AND the live `sessionEpoch` (a bumped epoch invalidates every
 * outstanding token — ADR-0023 D3).
 */
import { cookies } from "next/headers";
import { isProductionRuntime } from "../../../lib/env";
import { SESSION_COOKIE, SESSION_TTL_MS, mintSession, verifySessionToken } from "./session";
import { userRepo, type StoredUser } from "./users";

export async function getSessionUser(): Promise<StoredUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const parsed = verifySessionToken(token);
  if (!parsed) return null;
  const user = await userRepo().get(parsed.userId);
  if (!user || user.sessionEpoch !== parsed.epoch) return null; // epoch mismatch = revoked
  return user;
}

/** Mint + set the session cookie. False when fail-closed (no secret) — caller shows an error. */
export async function setSessionCookie(user: StoredUser): Promise<boolean> {
  const token = mintSession(user.id, user.sessionEpoch);
  if (!token) return false;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProductionRuntime(),
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return true;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
