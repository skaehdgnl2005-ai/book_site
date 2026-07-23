/**
 * F076 — HITL approval tokens, TARGET- and TIME-bound (server-only: node:crypto).
 *
 * Split out of `guardrails.ts` because that module also exports the pure `untrusted()`/`trusted()`
 * tags used by CLIENT components (e.g. ContactForm) — a top-level `node:crypto` import there would
 * break the client bundle. Approval verification is strictly server-side, so it lives here.
 *
 * The old `APPROVED:<action>` literal was source-visible and forgeable, so a stolen admin session
 * could refund every refundable order. The real token is now `${exp}.${hmac}` where
 * hmac = HMAC-SHA256(MYPAGE_ACCESS_SECRET, approvalMessage) — valid for ONE action, ONE target
 * (order/request id), for ~10 minutes, unforgeable without the server secret. Issued by
 * `pnpm approve <action> <targetId>` (scripts/approve.mjs mirrors mintApprovalToken). Hermetic E2E
 * uses a deterministic dev token gated by the F074 dev-auth opt-in — fail-closed in production.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { devAuthEnabled } from "./env";
import type { IrreversibleAction } from "./guardrails";

export const APPROVAL_TTL_MS = 10 * 60 * 1000;

function approvalSecret(env: Record<string, string | undefined> = process.env): string | undefined {
  // Prod boot requires MYPAGE_ACCESS_SECRET (env.ts). No dev fallback here: the dev PATH below uses the
  // deterministic devApprovalToken instead, so a flagless non-prod box has NO working approval token.
  return env.MYPAGE_ACCESS_SECRET;
}

/**
 * The signed message. DOMAIN-TAGGED ("approval.v1") + "|"-separated (a pipe cannot appear in an action
 * enum, a server-generated order/request id — ord_/cr_/cuid/uuid, all [a-z0-9_-] — or a numeric exp), so
 * an approval token can NEVER collide with the mypage capability cookie / account session / OTP HMAC that
 * share MYPAGE_ACCESS_SECRET: collision-proof by construction, not by the accident that ids are dotless
 * (F076 adversarial review). `scripts/approve.mjs` MUST mirror this exact string — parity is pinned by
 * approval-token.test.ts. Bump the vN tag on any format change.
 * Replay note: a token is reusable for its full TTL; that is safe ONLY because every gated call site is
 * idempotent/terminal (refund → REFUNDED terminal + Idempotency-Key; consultation → conditional
 * REQUESTED→CONFIRMED write). A future non-idempotent gated action would need a one-shot jti ledger.
 */
function approvalMessage(action: IrreversibleAction, targetId: string, exp: number): string {
  return `approval.v1|${action}|${targetId}|${exp}`;
}

/** Deterministic dev/E2E token — accepted ONLY under the F074 dev-auth opt-in (devAuthEnabled). */
export function devApprovalToken(action: IrreversibleAction, targetId: string): string {
  return `DEV:${action}:${targetId}`;
}

/** Mint a target+TTL-bound token `${exp}.${hmac}`; null when no secret. `scripts/approve.mjs` mirrors this. */
export function mintApprovalToken(
  action: IrreversibleAction,
  targetId: string,
  now: number = Date.now(),
  env: Record<string, string | undefined> = process.env,
): string | null {
  const secret = approvalSecret(env);
  if (!secret) return null;
  const exp = now + APPROVAL_TTL_MS;
  const hmac = createHmac("sha256", secret).update(approvalMessage(action, targetId, exp)).digest("hex");
  return `${exp}.${hmac}`;
}

function verifyApprovalToken(
  action: IrreversibleAction,
  targetId: string,
  token: string | undefined,
  env: Record<string, string | undefined>,
  now: number,
): boolean {
  const secret = approvalSecret(env);
  if (!secret || !token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  const got = token.slice(dot + 1);
  if (!Number.isFinite(exp) || now >= exp) return false; // expired / malformed
  const expected = createHmac("sha256", secret).update(approvalMessage(action, targetId, exp)).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(got, "utf8");
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return timingSafeEqual(a, b);
}

/**
 * Guard an irreversible action against a SPECIFIC TARGET. Default-deny: throws unless a valid,
 * unexpired, target-bound approval token (from `pnpm approve <action> <targetId>`) is supplied — or,
 * ONLY under the F074 dev-auth opt-in, the deterministic dev token. `env`/`now` are injection seams.
 */
export function requireApproval(
  action: IrreversibleAction,
  targetId: string,
  approvalToken: string | undefined,
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now(),
): void {
  if (devAuthEnabled(env) && approvalToken === devApprovalToken(action, targetId)) return;
  if (verifyApprovalToken(action, targetId, approvalToken, env, now)) return;
  throw new Error(
    `Blocked irreversible action "${action}" on "${targetId}" (G-HITL). ` +
      `Obtain approval via:  pnpm approve ${action} ${targetId}  then pass the issued token (target-bound, ~10min TTL).`,
  );
}
