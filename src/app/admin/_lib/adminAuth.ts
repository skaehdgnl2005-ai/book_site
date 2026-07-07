/**
 * F059 (ADR-0024 D1) — admin gate: NO separate auth system. The global account session
 * (ADR-0023) is the identity; `ADMIN_EMAILS` (comma-separated, lowercase) is the role.
 * Failure mode is `notFound()` — /admin's existence is not advertised to non-admins (404,
 * never 403). Production without ADMIN_EMAILS denies everything (fail-closed); non-prod
 * falls back to a deterministic allowlist so hermetic E2E can drive /admin with zero config
 * (the accessSecret dev-fallback precedent).
 */
import { notFound } from "next/navigation";
import { isProductionRuntime } from "../../../lib/env";
import { getSessionUser } from "../../account/_lib/sessionUser";
import type { StoredUser } from "../../account/_lib/users";

export const DEV_ADMIN_EMAIL = "admin@example.com";
// Non-prod fallback family: admin@example.com + admin+<tag>@example.com. The plus-address tags
// let parallel E2E specs each hold a DISTINCT admin identity (the login OTP is single-use and
// send-capped PER EMAIL — a shared admin account would race/exhaust across fullyParallel specs).
const DEV_ADMIN_RE = /^admin(?:\+[\w.-]+)?@example\.com$/;

export function adminEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(
  email: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!email) return false;
  const norm = email.trim().toLowerCase();
  if (adminEmails(env).includes(norm)) return true;
  // Deterministic non-prod fallback — ONLY when no explicit list is configured (an explicit
  // list replaces it, so tests can also exercise strictness). Production: env list or nothing.
  if (env.ADMIN_EMAILS == null && !isProductionRuntime(env)) return DEV_ADMIN_RE.test(norm);
  return false;
}

/** The signed-in admin, or null. (A kakao-only account without an email can never be admin.) */
export async function getAdminUser(): Promise<StoredUser | null> {
  const user = await getSessionUser();
  return user && isAdminEmail(user.email) ? user : null;
}

/** Layout/action gate — 404 (existence-hiding), never 403. Re-invoked per server action. */
export async function requireAdmin(): Promise<StoredUser> {
  const admin = await getAdminUser();
  if (!admin) notFound();
  return admin;
}
