import type {
  PaymentProvider,
  CreatePaymentInput,
  Checkout,
  ConfirmInput,
  Confirmation,
  PaymentStatus,
  PaymentLookupResult,
  CancelPaymentInput,
  CancelPaymentResult,
  VirtualAccount,
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
// Re-query a payment by its paymentKey (webhook verification): GET /v1/payments/{paymentKey}.
const TOSS_PAYMENT_URL = "https://api.tosspayments.com/v1/payments/";

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
  /** Base URL for the payment-lookup re-query (defaults to the real Toss endpoint). */
  paymentUrl?: string;
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

const ORDER_ID_RE = /^[A-Za-z0-9_-]{6,64}$/; // TossPayments orderId constraint
function assertValidOrderId(orderId: string): void {
  if (!ORDER_ID_RE.test(orderId)) {
    throw new Error(
      `Invalid orderId "${orderId}": TossPayments requires 6–64 characters of [A-Za-z0-9-_].`,
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
    case "WAITING_FOR_DEPOSIT": // F070 — 가상계좌 발급됨, 입금 대기
      return "WAITING_FOR_DEPOSIT";
    case "EXPIRED": // F070 — 가상계좌 입금 기한 만료(미입금): 취소로 수렴(돈이 오가지 않음)
      return "CANCELED";
    default:
      return "FAILED";
  }
}

// F070 — Toss 은행 코드(숫자) → 표시명. 미등록 코드는 정직하게 코드 그대로 노출.
const BANK_NAMES: Record<string, string> = {
  "39": "경남은행", "34": "광주은행", "12": "단위농협", "32": "부산은행", "45": "새마을금고",
  "64": "산림조합", "88": "신한은행", "48": "신협", "27": "씨티은행", "20": "우리은행",
  "71": "우체국예금보험", "50": "저축은행중앙회", "37": "전북은행", "35": "제주은행",
  "90": "카카오뱅크", "89": "케이뱅크", "92": "토스뱅크", "81": "하나은행", "54": "홍콩상하이은행",
  "03": "IBK기업은행", "06": "KB국민은행", "31": "DGB대구은행", "02": "KDB산업은행", "11": "NH농협은행",
  "23": "SC제일은행", "07": "Sh수협은행",
};
function bankName(bankCode: unknown): string {
  const code = typeof bankCode === "string" ? bankCode : "";
  return BANK_NAMES[code] ?? (code ? `은행(${code})` : "은행");
}

/** F070 — parse Toss's virtualAccount object (present on a WAITING_FOR_DEPOSIT payment). */
function parseVirtualAccount(v: unknown): VirtualAccount | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const accountNumber = typeof o.accountNumber === "string" ? o.accountNumber : "";
  const dueDate = typeof o.dueDate === "string" ? o.dueDate : "";
  if (!accountNumber || !dueDate) return undefined;
  return {
    bank: bankName(o.bankCode),
    accountNumber,
    dueDate,
    customerName: typeof o.customerName === "string" ? o.customerName : undefined,
  };
}

export class TossPaymentProvider implements PaymentProvider {
  readonly name = "toss";
  private readonly secretKey: string;
  private readonly clientKey: string;
  private readonly transport: TossTransport;
  private readonly confirmUrl: string;
  private readonly paymentUrl: string;

  constructor(config: TossConfig) {
    assertTestKey(config.secretKey, "secret");
    assertTestKey(config.clientKey, "client");
    this.secretKey = config.secretKey;
    this.clientKey = config.clientKey;
    this.transport = config.transport ?? defaultTransport;
    this.confirmUrl = config.confirmUrl ?? TOSS_CONFIRM_URL;
    this.paymentUrl = config.paymentUrl ?? TOSS_PAYMENT_URL;
  }

  createCheckout(input: CreatePaymentInput): Checkout {
    assertValidOrderId(input.orderId);
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
    const body = (await res.json()) as { status?: string; approvedAt?: string; virtualAccount?: unknown };
    const status = mapStatus(res.ok, body.status);
    return {
      status,
      provider: this.name,
      paymentKey: input.paymentKey,
      orderId: input.orderId,
      amount: input.amount,
      approvedAt: body.approvedAt,
      // F070 — carry the issued 가상계좌 details up to the order layer on a WAITING_FOR_DEPOSIT confirm.
      virtualAccount: status === "WAITING_FOR_DEPOSIT" ? parseVirtualAccount(body.virtualAccount) : undefined,
    };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentResult> {
    // F063 — POST /v1/payments/{paymentKey}/cancel (Basic auth = confirm). FULL cancel only
    // (no cancelAmount ⇒ Toss cancels the whole payment). The Idempotency-Key makes a retried/
    // double-clicked call settle to the SAME result instead of erroring or double-executing.
    const auth = "Basic " + Buffer.from(`${this.secretKey}:`).toString("base64");
    const res = await this.transport(
      `${this.paymentUrl}${encodeURIComponent(input.paymentKey)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
          "Idempotency-Key": `refund-${input.orderId}`,
        },
        body: JSON.stringify({ cancelReason: input.cancelReason }),
      },
    );
    const body = (await res.json()) as { status?: unknown };
    const canceled = res.ok && mapStatus(true, body.status) === "CANCELED";
    return { status: canceled ? "CANCELED" : "FAILED" };
  }

  async lookupPayment(paymentKey: string): Promise<PaymentLookupResult | null> {
    // Re-query the authoritative payment (GET /v1/payments/{paymentKey}), Basic-auth with the
    // secret key — same auth as confirm(). The webhook uses this to verify a NOTIFICATION before
    // settling an order. A non-OK response (e.g. 404 / unknown key) ⇒ null (cannot verify).
    const auth = "Basic " + Buffer.from(`${this.secretKey}:`).toString("base64");
    const res = await this.transport(this.paymentUrl + encodeURIComponent(paymentKey), {
      method: "GET",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: "",
    });
    if (res.status >= 500) {
      // Transient gateway error → throw so the webhook route returns 5xx and Toss RETRIES the
      // delivery; never silently ack a re-query we couldn't complete (the safety-net must hold).
      throw new Error(`Toss payment lookup failed transiently (HTTP ${res.status}).`);
    }
    if (!res.ok) return null; // 4xx (e.g. 404 not found) → definitively cannot verify → no settlement
    const body = (await res.json()) as { status?: unknown; totalAmount?: unknown; orderId?: unknown };
    return {
      status: mapStatus(true, body.status),
      amount: typeof body.totalAmount === "number" ? body.totalAmount : NaN,
      orderId: typeof body.orderId === "string" ? body.orderId : "",
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
