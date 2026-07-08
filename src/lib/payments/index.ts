/**
 * Provider-agnostic payment contract (F003).
 *
 * The app talks to *this* interface, never to a concrete gateway. TossPayments is
 * the first adapter (`./toss`); swapping or adding a provider means writing another
 * adapter, not touching the order/checkout code. Money is **KRW won** — an integer
 * with no minor unit (NOT cents).
 *
 * Irreversible, real-money operations (a live charge/refund) are out of this
 * interface on purpose: they run only via the approval gate
 * (`pnpm approve toss.charge.live` + `requireApproval()`, see `../guardrails`).
 */

/** KRW won: a non-negative integer. Won has no minor unit, so fractional amounts are invalid. */
export type Won = number;

export type PaymentStatus = "PAID" | "FAILED" | "CANCELED";

/** What the order layer hands the provider to begin a checkout. */
export interface CreatePaymentInput {
  /** Our order id — the idempotency anchor across create → confirm → webhook. */
  orderId: string;
  /** Total to charge, in KRW won (integer). */
  amount: Won;
  /** Human-readable order name shown in the payment UI (e.g. "탄생 그림책 (하드커버)"). */
  orderName: string;
  successUrl: string;
  failUrl: string;
  customerName?: string;
}

/**
 * Everything the buyer's browser needs to open the provider's payment window.
 * Only public, non-secret fields — never the secret key.
 */
export interface Checkout {
  provider: string;
  orderId: string;
  amount: Won;
  orderName: string;
  /** Publishable client key (safe to send to the browser). */
  clientKey: string;
  successUrl: string;
  failUrl: string;
}

/** What the server submits to settle a payment after the buyer returns from the gateway. */
export interface ConfirmInput {
  paymentKey: string;
  orderId: string;
  /** Must equal the amount the checkout was created with (server-side guard against tampering). */
  amount: Won;
}

export interface Confirmation {
  status: PaymentStatus;
  provider: string;
  paymentKey: string;
  orderId: string;
  amount: Won;
  approvedAt?: string;
}

/** F063 — cancel (refund) a settled payment. FULL-amount only (부분취소 스코프 아웃). */
export interface CancelPaymentInput {
  paymentKey: string;
  /** Shown on the buyer's payment record; typically the buyer's cancel reason. */
  cancelReason: string;
  /** Our order id — anchors the Idempotency-Key (`refund-<orderId>`) against double execution. */
  orderId: string;
}
export interface CancelPaymentResult {
  status: "CANCELED" | "FAILED";
}

/** Authoritative payment re-queried from the gateway (server→gateway, for webhook verification). */
export interface PaymentLookupResult {
  /** Provider-agnostic settled status (Toss DONE → PAID). */
  status: PaymentStatus;
  /** Amount the gateway holds, in KRW won — compared against the server-held order total. */
  amount: Won;
  /** Order id the gateway associates with this payment (authoritative; the webhook body is not trusted). */
  orderId: string;
}

export interface PaymentProvider {
  readonly name: string;
  /** Prepare a checkout for the buyer's browser. Pure/synchronous — no network. */
  createCheckout(input: CreatePaymentInput): Checkout;
  /** Settle a payment with the gateway; maps the gateway result to our status. */
  confirm(input: ConfirmInput): Promise<Confirmation>;
  /**
   * Re-query the authoritative payment (secret-key auth). Used to verify a webhook
   * NOTIFICATION before settling an order — Toss does not sign payment webhooks, so only
   * this server→gateway lookup can move an order to PAID. Null when the payment isn't found.
   */
  lookupPayment(paymentKey: string): Promise<PaymentLookupResult | null>;
  /**
   * F063 — cancel (refund) a settled payment, full amount. Real money moves: callers MUST hold
   * the `requireApproval("toss.refund.live")` gate first; the Idempotency-Key defends the
   * gateway call itself against double execution.
   */
  cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentResult>;
}

// First (and currently only) adapter. Re-exported here so consumers import from
// `@/lib/payments`. `./toss` imports the types above with `import type`, so this
// barrel has no runtime import cycle.
export {
  TossPaymentProvider,
  tossFromEnv,
  type TossConfig,
  type TossTransport,
  type TossResponseLike,
} from "./toss";
