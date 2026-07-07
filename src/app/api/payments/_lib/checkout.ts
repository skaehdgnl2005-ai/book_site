/**
 * Checkout domain logic (TRACK-CHECKOUT, F012–F016). Pure, injectable functions so the
 * webhook / confirm / price-recompute core is unit-testable without a DB, network, or env
 * (ADR-0002). The route handlers wire these to the globalThis singletons + the real
 * provider/secret/template resolver.
 *
 * Imports are RELATIVE (not the `@/` alias): vitest has no alias resolver and loads this
 * module, mirroring the `src/lib/*` convention. Cross-cutting `untrusted()` is applied at
 * the route boundary (AGENTS #6); this module treats every input as untrusted and validates.
 */
import { timingSafeEqual } from "node:crypto";
import {
  TossPaymentProvider,
  tossFromEnv,
  type PaymentProvider,
  type PaymentLookupResult,
  type TossTransport,
} from "../../../../lib/payments";
import { QR_ADDON_WON } from "../../../../lib/cart";
import type {
  OrderDraft,
  OrderItemDraft,
  OrderRepo,
  WebhookLedger,
  ExtraVarValue,
} from "./orders";

// ── webhook auth: a shared URL token, constant-time ───────────────────────────
// Toss does NOT sign PAYMENT_STATUS_CHANGED webhooks (only payout/seller events carry a
// `tosspayments-webhook-signature`). So the webhook body is an untrusted NOTIFICATION: we
// (1) gate on a shared secret token registered in the dashboard webhook URL (?token=…) as a
// cheap first-line filter and (2) RE-QUERY the authoritative payment from Toss
// (`PaymentLookup`, secret-key Basic auth) — only that status/amount can move an order to
// PAID. This replaces the earlier self-HMAC seam (`signWebhook`). See ADR-0020 (F045).
export function verifyWebhookToken(provided: string | null, secret: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return timingSafeEqual(a, b);
}

/**
 * Re-query the authoritative payment (GET /v1/payments/{paymentKey}). The webhook body is
 * untrusted; ONLY this server→Toss lookup can settle an order. Null ⇒ payment not found.
 */
export type PaymentLookup = (paymentKey: string) => Promise<PaymentLookupResult | null>;

// ── F012: server-authoritative order draft from an untrusted cart payload ──────
export type TemplateResolver = (
  key: string,
) => Promise<{ label: string; softPriceWon: number; hardPriceWon: number } | null>;

type DraftResult = { ok: true; draft: OrderDraft } | { ok: false; status: number; errors: string[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// F053 — shipping (PII, sensitive): lenient KR phone (digits+hyphens), 5-digit postal code.
const SHIP_PHONE_RE = /^[0-9-]{9,13}$/;
const SHIP_ZIP_RE = /^\d{5}$/;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseExtraVar(v: unknown): ExtraVarValue {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.kind === "string" && typeof o.value === "string") return { kind: o.kind, value: o.value };
  }
  return null;
}

function parsePhoto(v: unknown): OrderItemDraft["photo"] {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.storageKey === "string" && typeof o.contentType === "string" && typeof o.byteSize === "number") {
      return { storageKey: o.storageKey, contentType: o.contentType, byteSize: o.byteSize };
    }
  }
  return null;
}

/**
 * Validate the untrusted checkout payload and RECOMPUTE the amount from authoritative
 * Template prices (`resolve`) — the client `unitPriceWon`/total are display-only and
 * ignored. `orderName` is a PII-free product summary (never buyer/child names).
 */
export async function buildOrderDraft(value: unknown, resolve: TemplateResolver): Promise<DraftResult> {
  const body = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;

  const buyerName = asString(body.buyerName).trim();
  if (!buyerName || buyerName.length > 120) {
    return { ok: false, status: 400, errors: ["보호자 이름을 입력해 주세요."] };
  }
  const buyerEmail = asString(body.buyerEmail).trim();
  if (!EMAIL_RE.test(buyerEmail) || buyerEmail.length > 254) {
    return { ok: false, status: 400, errors: ["올바른 이메일을 입력해 주세요."] };
  }

  // F053 — shipping is REQUIRED on an ENTRY order (physical keepsake: magnetic case + card).
  const shipName = asString(body.shipName).trim();
  if (!shipName || shipName.length > 120) {
    return { ok: false, status: 400, errors: ["받는 분 이름을 입력해 주세요."] };
  }
  const shipPhone = asString(body.shipPhone).trim();
  if (!SHIP_PHONE_RE.test(shipPhone)) {
    return { ok: false, status: 400, errors: ["받는 분 연락처를 확인해 주세요. (숫자와 - 만, 9~13자)"] };
  }
  const shipZip = asString(body.shipZip).trim();
  if (!SHIP_ZIP_RE.test(shipZip)) {
    return { ok: false, status: 400, errors: ["우편번호 5자리를 입력해 주세요."] };
  }
  const shipBase = asString(body.shipAddress).trim();
  if (!shipBase || shipBase.length > 400) {
    return { ok: false, status: 400, errors: ["배송지 주소를 입력해 주세요."] };
  }
  const shipDetail = asString(body.shipAddressDetail).trim();
  if (shipDetail.length > 200) {
    return { ok: false, status: 400, errors: ["상세주소는 200자 이내로 입력해 주세요."] };
  }
  const shipAddress = shipDetail ? `${shipBase}, ${shipDetail}` : shipBase;

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (rawLines.length === 0) return { ok: false, status: 400, errors: ["장바구니가 비어 있습니다."] };

  const items: OrderItemDraft[] = [];
  for (const raw of rawLines) {
    const l = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const coverType = l.coverType;
    if (coverType !== "SOFT" && coverType !== "HARD") {
      return { ok: false, status: 400, errors: ["커버 종류가 올바르지 않습니다."] };
    }
    const templateKey = asString(l.templateKey);
    const tpl = await resolve(templateKey);
    if (!tpl) return { ok: false, status: 400, errors: ["알 수 없는 상품입니다."] };
    const unitPriceWon = coverType === "HARD" ? tpl.hardPriceWon : tpl.softPriceWon; // authoritative

    const p = (l.personalization && typeof l.personalization === "object" ? l.personalization : {}) as Record<string, unknown>;
    items.push({
      templateKey,
      templateLabel: tpl.label,
      coverType,
      unitPriceWon,
      personalization: {
        childName: asString(p.childName),
        childGender: p.childGender === "FEMALE" ? "FEMALE" : "MALE",
        extraVar: parseExtraVar(p.extraVar),
      },
      photo: parsePhoto(l.photo),
    });
  }

  const qrVideoAddon = body.qrVideoAddon === true;
  const amountWon = items.reduce((s, it) => s + it.unitPriceWon, 0) + (qrVideoAddon ? QR_ADDON_WON : 0);
  const firstLabel = items[0].templateLabel;
  const orderName = items.length === 1 ? firstLabel : `${firstLabel} 외 ${items.length - 1}건`;

  return {
    ok: true,
    draft: { amountWon, orderName, qrVideoAddon, buyerName, buyerEmail, shipName, shipPhone, shipZip, shipAddress, items },
  };
}

// ── F013/F015: synchronous confirm. Amount is server-held (never the client's). ──
export async function confirmPayment(
  repo: OrderRepo,
  provider: PaymentProvider,
  input: { orderId: unknown; paymentKey: unknown },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const orderId = asString(input.orderId);
  const paymentKey = asString(input.paymentKey);
  const order = await repo.get(orderId);
  if (!order) return { status: 404, body: { errors: ["주문을 찾을 수 없습니다."] } };
  // Idempotent: an already-PAID order is settled — do NOT re-call the gateway (the real Toss
  // /confirm rejects an already-used paymentKey → 402). Makes the success-page reload and a
  // webhook-first race safe. The stored (first) paymentKey is preserved.
  if (order.status === "PAID") return { status: 200, body: { status: "PAID", orderId: order.id } };
  if (!paymentKey) return { status: 400, body: { errors: ["결제 정보가 없습니다."] } };

  const conf = await provider.confirm({ paymentKey, orderId: order.id, amount: order.amountWon });
  if (conf.status !== "PAID") return { status: 402, body: { status: conf.status } }; // F015: no PAID order
  const paid = await repo.markPaid(order.id, conf.paymentKey);
  return { status: 200, body: { status: "PAID", orderId: paid?.id ?? order.id } };
}

// Toss PAYMENT_STATUS_CHANGED payload: { eventType, createdAt, data:{ paymentKey, orderId, status } }.
type TossWebhookData = { paymentKey?: unknown; orderId?: unknown; status?: unknown };
type TossWebhookEvent = { eventType?: unknown; data?: TossWebhookData };

// ── F045: async webhook. Token-gate → parse → dedupe → RE-QUERY (authoritative) → markPaid. ──
export async function processWebhook(
  rawBody: string,
  token: string | null,
  secret: string,
  repo: OrderRepo,
  ledger: WebhookLedger,
  lookup: PaymentLookup,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!verifyWebhookToken(token, secret)) {
    return { status: 401, body: { errors: ["웹훅 인증에 실패했습니다."] } };
  }
  let event: TossWebhookEvent;
  try {
    event = JSON.parse(rawBody) as TossWebhookEvent;
  } catch {
    return { status: 400, body: { errors: ["잘못된 요청입니다."] } };
  }
  const data = (event.data && typeof event.data === "object" ? event.data : {}) as TossWebhookData;
  const paymentKey = asString(data.paymentKey);
  const bodyStatus = asString(data.status);
  if (!paymentKey) return { status: 400, body: { errors: ["paymentKey 가 없습니다."] } };

  // Idempotency key: Toss payment webhooks carry NO event id, so we key on paymentKey:status
  // — stable per state transition (READY→…→DONE each distinct), so a redelivery of the SAME
  // transition is a strict no-op while a later genuine DONE still lands. Dedupe runs before
  // the re-query so an identical redelivery costs no API call.
  const dedupeKey = `${paymentKey}:${bodyStatus}`;
  if (await ledger.seen(dedupeKey)) return { status: 200, body: { duplicate: true } };

  // RE-QUERY: the body is untrusted. Fetch the authoritative payment from Toss; only its
  // status/amount can settle the order. A forged "DONE" body re-queries to the real status.
  const authoritative = await lookup(paymentKey);
  if (!authoritative) return { status: 200, body: { status: "LOOKUP_FAILED" } }; // not found → ack, no retry storm
  if (authoritative.status !== "PAID") return { status: 200, body: { status: "IGNORED" } };

  const order = await repo.get(authoritative.orderId); // authoritative id, never the body's
  if (!order) return { status: 200, body: { status: "UNKNOWN_ORDER" } };
  if (authoritative.amount !== order.amountWon) {
    return { status: 200, body: { status: "AMOUNT_MISMATCH" } }; // suspicious — never settle
  }

  // Record the acted DONE transition only AFTER authoritative confirmation, so a stale/forged
  // body can't poison a later genuine DONE. markPaid is itself idempotent (CREATED→PAID only,
  // never downgrades), so the success-callback confirm and this webhook converge on one order.
  await ledger.record(dedupeKey);
  await repo.markPaid(order.id, paymentKey);
  return { status: 200, body: { status: "PAID", orderId: order.id } };
}

// ── provider + secret wiring (sandbox outside production; impossible to stub in prod) ──
export function checkoutProvider(env: Record<string, string | undefined> = process.env): PaymentProvider {
  if (env.APP_ENV === "production") return tossFromEnv(env);
  const sandboxTransport: TossTransport = async (_url, init) => ({
    ok: true,
    status: 200,
    // GET = lookupPayment re-query. The sandbox can't know an order's real amount/id, so it
    // returns a benign payment that settles nothing (orderId:"" → UNKNOWN_ORDER). The webhook
    // safety-net is verified hermetically by webhook.test.ts; dev/E2E use the confirm path.
    json: async () =>
      init.method === "GET"
        ? { status: "DONE", totalAmount: 0, orderId: "" }
        : { status: "DONE", approvedAt: new Date().toISOString() },
  });
  return new TossPaymentProvider({
    secretKey: env.TOSS_SECRET_KEY ?? "test_sk_checkoutsandbox",
    clientKey: env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "test_ck_checkoutsandbox",
    transport: sandboxTransport,
  });
}

/** Webhook secret: env in prod (required → caller 401s if absent); test fallback otherwise. */
export function webhookSecret(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.TOSS_WEBHOOK_SECRET ?? (env.APP_ENV !== "production" ? "test_whsec_sandbox" : undefined);
}
