import type {
  PaymentProvider,
  CreatePaymentInput,
  Checkout,
  ConfirmInput,
  Confirmation,
  PaymentStatus,
} from "./index";

/**
 * TossPayments adapter — TEST / sandbox only (ADR-0004, ADR-0009).
 *
 * Live keys are refused both at boot (`parseEnv`, `../env`) and here (constructor),
 * so a real charge can never run without the approval gate
 * (`pnpm approve toss.charge.live`). The HTTP transport is injectable so unit tests
 * stay hermetic — `pnpm check` needs no network (parallels the DB rule, ADR-0002).
 */

const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

/** Minimal `Response`-shaped result the adapter needs (real `fetch` satisfies it). */
export interface TossResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type TossTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<TossResponseLike>;

export interface TossConfig {
  /** test_sk_… */
  secretKey: string;
  /** test_ck_… (publishable; safe for the browser) */
  clientKey: string;
  transport?: TossTransport;
  confirmUrl?: string;
}

const defaultTransport: TossTransport = (url, init) =>
  fetch(url, init) as unknown as Promise<TossResponseLike>;

function assertTestKey(key: string, kind: "secret" | "client"): void {
  const livePrefix = kind === "secret" ? "live_sk_" : "live_ck_";
  if (key.startsWith(livePrefix)) {
    throw new Error(
      `TossPayments ${kind} key is a LIVE key — this adapter is test/sandbox only. ` +
        `Live charges require the approval gate (pnpm approve toss.charge.live).`,
    );
  }
}

function assertWon(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(
      `Invalid KRW amount ${amount}: must be a positive integer (won has no minor unit).`,
    );
  }
}

/** Map a TossPayments payment status to our provider-agnostic status. */
function mapStatus(ok: boolean, tossStatus: unknown): PaymentStatus {
  if (!ok) return "FAILED";
  switch (tossStatus) {
    case "DONE":
      return "PAID";
    case "CANCELED":
    case "PARTIAL_CANCELED":
      return "CANCELED";
    default:
      return "FAILED";
  }
}

export class TossPaymentProvider implements PaymentProvider {
  readonly name = "toss";
  private readonly secretKey: string;
  private readonly clientKey: string;
  private readonly transport: TossTransport;
  private readonly confirmUrl: string;

  constructor(config: TossConfig) {
    assertTestKey(config.secretKey, "secret");
    assertTestKey(config.clientKey, "client");
    this.secretKey = config.secretKey;
    this.clientKey = config.clientKey;
    this.transport = config.transport ?? defaultTransport;
    this.confirmUrl = config.confirmUrl ?? TOSS_CONFIRM_URL;
  }

  createCheckout(input: CreatePaymentInput): Checkout {
    assertWon(input.amount);
    return {
      provider: this.name,
      orderId: input.orderId,
      amount: input.amount,
      orderName: input.orderName,
      clientKey: this.clientKey,
      successUrl: input.successUrl,
      failUrl: input.failUrl,
    };
  }

  async confirm(input: ConfirmInput): Promise<Confirmation> {
    assertWon(input.amount);
    // Toss authenticates the confirm call with HTTP Basic: base64("<secretKey>:").
    const auth = "Basic " + Buffer.from(`${this.secretKey}:`).toString("base64");
    const res = await this.transport(this.confirmUrl, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        amount: input.amount,
      }),
    });
    const body = (await res.json()) as { status?: string; approvedAt?: string };
    return {
      status: mapStatus(res.ok, body.status),
      provider: this.name,
      paymentKey: input.paymentKey,
      orderId: input.orderId,
      amount: input.amount,
      approvedAt: body.approvedAt,
    };
  }
}

/** Build the configured Toss provider from environment keys (server-side). */
export function tossFromEnv(env: {
  TOSS_SECRET_KEY?: string;
  NEXT_PUBLIC_TOSS_CLIENT_KEY?: string;
}): TossPaymentProvider {
  const secretKey = env.TOSS_SECRET_KEY;
  const clientKey = env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  if (!secretKey || !clientKey) {
    throw new Error(
      "TossPayments is not configured: set TOSS_SECRET_KEY and NEXT_PUBLIC_TOSS_CLIENT_KEY.",
    );
  }
  return new TossPaymentProvider({ secretKey, clientKey });
}
