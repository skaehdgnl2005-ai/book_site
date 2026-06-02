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
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  TossPaymentProvider,
  tossFromEnv,
  type PaymentProvider,
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

// ── webhook signature: HMAC-SHA256 over the RAW body, constant-time ───────────
// Provider-agnostic seam: the production Toss adapter maps Toss's real scheme onto this.
// CRITICAL: callers MUST verify over the raw request bytes (`await req.text()`) BEFORE any
// JSON.parse — `req.json()` consumes the stream, so parsing first would hash the wrong bytes.
export function signWebhook(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signWebhook(secret, rawBody), "utf8");
  const got = Buffer.from(signature, "utf8");
  if (expected.length !== got.length) return false; // timingSafeEqual throws on length mismatch
  return timingSafeEqual(expected, got);
}

// ── F012: server-authoritative order draft from an untrusted cart payload ──────
export type TemplateResolver = (
  key: string,
) => Promise<{ label: string; softPriceWon: number; hardPriceWon: number } | null>;

type DraftResult = { ok: true; draft: OrderDraft } | { ok: false; status: number; errors: string[] };

const EMAIL_RE = /^\S+@\S+\.\S+$/;

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

  return { ok: true, draft: { amountWon, orderName, qrVideoAddon, buyerName, buyerEmail, items } };
}

// ── F013/F015: synchronous confirm. Amount is server-held (never the client's). ──
export async function confirmPayment(
  repo: OrderRepo,
  provider: PaymentProvider,
  input: { orderId: unknown; paymentKey: unknown },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const orderId = asString(input.orderId);
  const paymentKey = asString(input.paymentKey);
  const order = repo.get(orderId);
  if (!order) return { status: 404, body: { errors: ["주문을 찾을 수 없습니다."] } };
  if (!paymentKey) return { status: 400, body: { errors: ["결제 정보가 없습니다."] } };

  const conf = await provider.confirm({ paymentKey, orderId: order.id, amount: order.amountWon });
  if (conf.status !== "PAID") return { status: 402, body: { status: conf.status } }; // F015: no PAID order
  const paid = repo.markPaid(order.id, conf.paymentKey);
  return { status: 200, body: { status: "PAID", orderId: paid?.id ?? order.id } };
}

// ── F013: async webhook. Verify (raw body) → parse → dedupe → markPaid (idempotent). ──
export async function processWebhook(
  rawBody: string,
  signature: string | null,
  secret: string,
  repo: OrderRepo,
  ledger: WebhookLedger,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return { status: 401, body: { errors: ["서명 검증에 실패했습니다."] } };
  }
  let event: { eventId?: unknown; orderId?: unknown; status?: unknown };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return { status: 400, body: { errors: ["잘못된 요청입니다."] } };
  }
  const eventId = asString(event.eventId);
  const orderId = asString(event.orderId);
  if (!eventId) return { status: 400, body: { errors: ["이벤트 식별자가 없습니다."] } };

  // Dedupe BEFORE any state change so a redelivery (even a forged later payload) is a
  // strict no-op. Hermetic store is single-process; the prod Prisma seam uses the
  // ProcessedWebhook @id unique constraint as the atomic gate (insert-first).
  if (ledger.seen(eventId)) return { status: 200, body: { duplicate: true } };
  ledger.record(eventId);

  if (event.status !== "DONE") return { status: 200, body: { status: "IGNORED" } };
  const order = repo.get(orderId);
  if (!order) return { status: 200, body: { status: "UNKNOWN_ORDER" } };
  repo.markPaid(order.id, `webhook:${eventId}`);
  return { status: 200, body: { status: "PAID", orderId: order.id } };
}

// ── provider + secret wiring (sandbox outside production; impossible to stub in prod) ──
export function checkoutProvider(env: Record<string, string | undefined> = process.env): PaymentProvider {
  if (env.APP_ENV === "production") return tossFromEnv(env);
  const sandboxTransport: TossTransport = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: "DONE", approvedAt: new Date().toISOString() }),
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
