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
  "order.close_unpaid_va", // F078 — 기한 만료 가상계좌 미입금 종료(터미널 CANCELLED; 뒤늦은 입금과 경합)
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

// F076 — approval-token verification (requireApproval + the token mint/verify helpers) lives in the
// server-only `src/lib/approval.ts` (it needs node:crypto). It is kept OUT of this module because
// `untrusted()`/`trusted()` above are imported by CLIENT components (e.g. ContactForm), and a top-level
// node:crypto import here would break the client bundle.
