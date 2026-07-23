#!/usr/bin/env node
// HITL approval gate (G-HITL / E1). Issues an approval token for an irreversible
// action ON A SPECIFIC TARGET, ONLY after an explicit, exact human confirmation. Default-deny:
// with no matching token, the guarded code path (src/lib/guardrails.requireApproval) throws.
//
// F076 — the token is TARGET- and TIME-bound (not a static literal): `${exp}.${hmac}` where
// hmac = HMAC-SHA256(MYPAGE_ACCESS_SECRET, `${action}.${targetId}.${exp}`), ~10min TTL. Mirror of
// src/lib/guardrails.mintApprovalToken (a .mjs CLI can't import the .ts). Non-prod dev (ALLOW_DEV_AUTH)
// emits the deterministic dev token instead. This script NEVER performs the action.
//
// Usage:
//   pnpm approve <action> <targetId>   # confirm interactively, then prints the token to paste
//   pnpm approve --list                # list approval-gated actions
import { createHmac } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, exit, env } from "node:process";

const APPROVAL_TTL_MS = 10 * 60 * 1000; // keep in sync with src/lib/guardrails.ts

// Keep in sync with IRREVERSIBLE_ACTIONS in src/lib/guardrails.ts (a .mjs CLI can't
// import the .ts module). Payment actions are TossPayments-specific (F003).
const IRREVERSIBLE = [
  "toss.charge.live",
  "toss.refund.live",
  "order.confirm",
  "consultation.book",
  "fulfillment.trigger",
  "inventory.write.production",
  "pii.store",
  "pii.send",
  "email.transactional.send",
  "email.marketing.send",
  "deploy.production",
];

const arg = argv[2];
const targetId = argv[3];

if (!arg || arg === "--help" || arg === "-h") {
  stdout.write("Usage: pnpm approve <action> <targetId> | pnpm approve --list\n");
  exit(arg ? 0 : 2);
}

if (arg === "--list") {
  stdout.write("Approval-gated (irreversible) actions:\n" + IRREVERSIBLE.map((a) => `  - ${a}`).join("\n") + "\n");
  exit(0);
}

if (!IRREVERSIBLE.includes(arg)) {
  stdout.write(
    `Unknown / non-gated action: ${arg}\nGated actions:\n` +
      IRREVERSIBLE.map((a) => `  - ${a}`).join("\n") +
      "\n",
  );
  exit(2);
}

if (!targetId) {
  stdout.write(
    `Missing <targetId>. Approval is bound to ONE target (the order id / request id).\n` +
      `Usage: pnpm approve ${arg} <targetId>\n`,
  );
  exit(2);
}

const rl = createInterface({ input: stdin, output: stdout });
const answer = await rl.question(
  `\n⚠ IRREVERSIBLE ACTION: "${arg}" on target "${targetId}"\n` +
    `Real-world, non-undoable effects (money / PII / fulfillment / deploy).\n` +
    `Type the action name EXACTLY to approve, or anything else to abort:\n> `,
);
rl.close();

if (answer.trim() !== arg) {
  stdout.write("Aborted. No token issued.\n");
  exit(1);
}

const secret = env.MYPAGE_ACCESS_SECRET;
const isProd = env.APP_ENV === "production" || env.VERCEL_ENV === "production";
const devAuth = !isProd && (env.ALLOW_DEV_AUTH === "true" || env.ALLOW_DEV_AUTH === "1");

if (secret) {
  const exp = Date.now() + APPROVAL_TTL_MS;
  // MUST match src/lib/approval.ts approvalMessage() EXACTLY (parity pinned by approval-token.test.ts).
  const hmac = createHmac("sha256", secret).update(`approval.v1|${arg}|${targetId}|${exp}`).digest("hex");
  stdout.write(
    `\n✓ APPROVED (bound to "${targetId}", ~10min). Paste into the guarded call:\n\n  ${exp}.${hmac}\n\n`,
  );
} else if (devAuth) {
  stdout.write(
    `\n✓ APPROVED (dev-auth). Paste into the guarded call:\n\n  DEV:${arg}:${targetId}\n\n`,
  );
} else {
  stdout.write(
    `\n✗ Cannot issue a token: set MYPAGE_ACCESS_SECRET (production) or ALLOW_DEV_AUTH=true (non-prod dev).\n`,
  );
  exit(1);
}
