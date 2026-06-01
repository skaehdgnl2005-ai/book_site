#!/usr/bin/env node
// HITL approval gate (G-HITL / E1). Issues an approval token for an irreversible
// action ONLY after an explicit, exact human confirmation. Default-deny: with no
// matching token, the guarded code path (src/lib/guardrails.requireApproval) throws.
//
// This script NEVER performs the action — it only records intent and emits a token.
//
// Usage:
//   pnpm approve <action>     # confirm interactively, then prints the token to paste
//   pnpm approve --list       # list approval-gated actions
import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, exit } from "node:process";

const IRREVERSIBLE = [
  "stripe.charge.live",
  "stripe.refund.live",
  "order.confirm",
  "fulfillment.trigger",
  "inventory.write.production",
  "pii.store",
  "pii.send",
  "email.transactional.send",
  "email.marketing.send",
  "deploy.production",
];

const arg = argv[2];

if (!arg || arg === "--help" || arg === "-h") {
  stdout.write("Usage: pnpm approve <action> | pnpm approve --list\n");
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

const rl = createInterface({ input: stdin, output: stdout });
const answer = await rl.question(
  `\n⚠ IRREVERSIBLE ACTION: "${arg}"\n` +
    `Real-world, non-undoable effects (money / PII / fulfillment / deploy).\n` +
    `Type the action name EXACTLY to approve, or anything else to abort:\n> `,
);
rl.close();

if (answer.trim() !== arg) {
  stdout.write("Aborted. No token issued.\n");
  exit(1);
}

stdout.write(
  `\n✓ APPROVED. Pass this token to the guarded call (this action only):\n\n  APPROVED:${arg}\n\n`,
);
