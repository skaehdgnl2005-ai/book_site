/**
 * Trust-boundary + irreversible-action guardrails.
 *
 * Trust boundary (E4): content originating outside the app — buyer input,
 * admin uploads, TossPayments webhook payloads, the web — is UNTRUSTED and must
 * never be interpreted as instructions or trusted in security decisions. Wrap it
 * so call sites are explicit about provenance.
 */
export type Trust = "trusted" | "untrusted";

export interface Tagged<T> {
  trust: Trust;
  value: T;
}

export function untrusted<T>(value: T): Tagged<T> {
  return { trust: "untrusted", value };
}

export function trusted<T>(value: T): Tagged<T> {
  return { trust: "trusted", value };
}

/**
 * Irreversible / high-impact actions that REQUIRE explicit human approval (G-HITL).
 * Payment actions are TossPayments-specific (the provider); booking a consultation is
 * a real customer-facing commitment (the 맞춤 제작 phone path). Keep this list in sync
 * with `scripts/approve.mjs` (the CLI that issues the tokens).
 */
export const IRREVERSIBLE_ACTIONS = [
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
] as const;

export type IrreversibleAction = (typeof IRREVERSIBLE_ACTIONS)[number];

export function isIrreversible(action: string): action is IrreversibleAction {
  return (IRREVERSIBLE_ACTIONS as readonly string[]).includes(action);
}

/**
 * Guard an irreversible action. Default-deny: throws unless an explicit, matching
 * approval token (issued out-of-band by `pnpm approve <action>`) is supplied.
 */
export function requireApproval(
  action: IrreversibleAction,
  approvalToken: string | undefined,
): void {
  const expected = `APPROVED:${action}`;
  if (approvalToken !== expected) {
    throw new Error(
      `Blocked irreversible action "${action}" (G-HITL). ` +
        `Obtain approval via:  pnpm approve ${action}  then pass the issued token.`,
    );
  }
}
