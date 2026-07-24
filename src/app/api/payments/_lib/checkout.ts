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
import { isProductionRuntime } from "../../../../lib/env";
import type {
  OrderDraft,
  OrderItemDraft,
  OrderRepo,
  StoredOrder,
  WebhookLedger,
  ExtraVarValue,
} from "./orders";
import { isPaidFamily } from "./status";
import { recordAuditSafe } from "../../../admin/_lib/auditLog";

/**
 * F055 — called EXACTLY ONCE per order, on the markPaid call whose atomic conditional write
 * actually moved CREATED→PAID (confirm and webhook race; only the winner notifies). Injected
 * so this module stays pure — the route/page layer supplies the after()-scheduled email.
 */
export type SettlementNotifier = (order: StoredOrder) => void;

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

  // F067 — 전자상거래법 17조 2항 6호: 주문제작 상품의 청약철회 제한은 결제 전 별도
  // 고지 + 소비자의 전자적 동의가 있어야 유효하다. 서버가 최종 게이트(클라이언트
  // 체크박스는 신뢰하지 않음)이며, 동의 시각을 주문에 증거로 남긴다.
  if (body.withdrawalConsent !== true) {
    return { ok: false, status: 400, errors: ["주문 제작 상품의 청약철회 제한 안내에 동의해 주세요."] };
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

  return {
    ok: true,
    draft: {
      amountWon,
      orderName,
      qrVideoAddon,
      buyerName,
      buyerEmail,
      shipName,
      shipPhone,
      shipZip,
      shipAddress,
      withdrawalConsentAt: new Date().toISOString(),
      items,
    },
  };
}

// ── F013/F015: synchronous confirm. Amount is server-held (never the client's). ──
export async function confirmPayment(
  repo: OrderRepo,
  provider: PaymentProvider,
  input: { orderId: unknown; paymentKey: unknown },
  notify?: SettlementNotifier,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const orderId = asString(input.orderId);
  const paymentKey = asString(input.paymentKey);
  const order = await repo.get(orderId);
  if (!order) return { status: 404, body: { errors: ["주문을 찾을 수 없습니다."] } };
  // Idempotent: a settled order (PAID or any forward fulfillment state — F054) is done; do NOT
  // re-call the gateway (the real Toss /confirm rejects an already-used paymentKey → 402). Makes
  // the success-page reload and a webhook-first race safe. The stored (first) paymentKey is
  // preserved. A CANCELLED/REFUNDED order is NOT payable — refuse with its real status.
  if (isPaidFamily(order.status)) return { status: 200, body: { status: "PAID", orderId: order.id } };
  // F070 — 이미 입금 대기 중인 가상계좌 주문은 그대로(멱등): 성공 페이지 새로고침/재확인이 안전.
  if (order.status === "WAITING_FOR_DEPOSIT") return { status: 200, body: { status: "WAITING_FOR_DEPOSIT", orderId: order.id } };
  if (order.status !== "CREATED") return { status: 402, body: { status: order.status } };
  if (!paymentKey) return { status: 400, body: { errors: ["결제 정보가 없습니다."] } };

  const conf = await provider.confirm({ paymentKey, orderId: order.id, amount: order.amountWon });
  // F070 — 가상계좌: 발급됨(입금 대기). 정산이 아니므로 markAwaitingDeposit(계좌 정보 저장, WFD 전이).
  // 실제 정산은 입금 완료 웹훅(WAITING_FOR_DEPOSIT→PAID)에서 일어난다.
  if (conf.status === "WAITING_FOR_DEPOSIT") {
    if (!conf.virtualAccount) return { status: 402, body: { status: "FAILED" } }; // 계좌 정보 없이는 불가
    await repo.markAwaitingDeposit(order.id, conf.paymentKey, {
      bank: conf.virtualAccount.bank,
      account: conf.virtualAccount.accountNumber,
      dueDate: conf.virtualAccount.dueDate,
    });
    return { status: 200, body: { status: "WAITING_FOR_DEPOSIT", orderId: order.id } };
  }
  if (conf.status !== "PAID") return { status: 402, body: { status: conf.status } }; // F015: no PAID order
  const paid = await repo.markPaid(order.id, conf.paymentKey);
  if (paid.transitioned && paid.order) notify?.(paid.order); // F055: exactly-once (atomic write is truth)
  return { status: 200, body: { status: "PAID", orderId: paid.order?.id ?? order.id } };
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
  notify?: SettlementNotifier,
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

  // F063 — CANCELED convergence: a refund executed outside our admin flow (e.g. straight from
  // the Toss dashboard) still lands the order on REFUNDED. Conditional transition (settled
  // states only): a CREATED order can't be "refunded" and a replay is a no-op — the response
  // reports what ACTUALLY happened (IGNORED when nothing moved), never an optimistic REFUNDED.
  if (authoritative.status === "CANCELED") {
    const order = await repo.get(authoritative.orderId);
    if (!order) return { status: 200, body: { status: "UNKNOWN_ORDER" } };
    await ledger.record(dedupeKey);
    // F070 — a 가상계좌 that expired/was-canceled while still WAITING_FOR_DEPOSIT (never deposited):
    // close it as CANCELLED (no money moved — NOT a refund). Backs DepositNotice's auto-cancel copy.
    if (order.status === "WAITING_FOR_DEPOSIT") {
      const moved = await repo.transition(order.id, ["WAITING_FOR_DEPOSIT"], "CANCELLED");
      return { status: 200, body: { status: moved.ok ? "CANCELLED" : "IGNORED", orderId: order.id } };
    }
    const moved = await repo.transition(order.id, ["PAID", "IN_PRODUCTION"], "REFUNDED");
    return { status: 200, body: { status: moved.ok ? "REFUNDED" : "IGNORED", orderId: order.id } };
  }

  if (authoritative.status !== "PAID") return { status: 200, body: { status: "IGNORED" } };

  const order = await repo.get(authoritative.orderId); // authoritative id, never the body's
  if (!order) return { status: 200, body: { status: "UNKNOWN_ORDER" } };

  // F081 — 뒤늦은 입금 감지: 만료 종료된(터미널 CANCELLED) 가상계좌 주문에 은행 입금이 도착한 케이스.
  // CANCELLED은 markPaid 대상이 아니라(F070) 재정산은 구조적으로 0이지만, 실제 돈은 Toss에 들어와
  // 있다 — 조용히 삼키면 운영자가 모른 채 남의 돈을 쥔다. system 감사 기록 + LATE_DEPOSIT 응답으로
  // 가시화하고, 환불은 앱 밖(운영자, docs/RUNBOOK_VA.md의 Toss 대시보드 절차)에서 집행한다.
  // 금액 검증보다 먼저: 금액이 어긋나도 입금 사실 자체를 운영자가 알아야 한다(감지가 우선).
  if (order.status === "CANCELLED") {
    await ledger.record(dedupeKey); // 재전달은 dedupe — 감사 기록도 정확히 1회
    await recordAuditSafe({
      actorUserId: "system",
      action: "order.late_deposit",
      targetType: "order",
      targetId: order.id,
      before: order.status,
      after: order.status, // 상태는 움직이지 않는다 — 감지 이벤트 기록
    });
    console.warn(`late deposit after cancellation: order=${order.id} (refund via Toss dashboard — RUNBOOK_VA)`);
    return { status: 200, body: { status: "LATE_DEPOSIT", orderId: order.id } };
  }

  if (authoritative.amount !== order.amountWon) {
    return { status: 200, body: { status: "AMOUNT_MISMATCH" } }; // suspicious — never settle
  }

  // Record the acted DONE transition only AFTER authoritative confirmation, so a stale/forged
  // body can't poison a later genuine DONE. markPaid is itself idempotent (CREATED→PAID only,
  // never downgrades), so the success-callback confirm and this webhook converge on one order.
  await ledger.record(dedupeKey);
  const paid = await repo.markPaid(order.id, paymentKey);
  if (paid.transitioned && paid.order) notify?.(paid.order); // F055: only if the confirm didn't win first

  // F081 — 경합 창 재확인: 위의 order 읽기는 WFD였지만 markPaid 전에 관리자 종료(WFD→CANCELLED)가
  // 커밋되면 markPaid는 no-op이고, 사전 read의 CANCELLED 분기는 이미 지나쳤다. 여기서 재확인하지
  // 않으면 이 밀리초 창의 뒤늦은 입금은 영구 미감지(200 응답 — Toss 재시도 없음)가 된다.
  if (!paid.transitioned && paid.order?.status === "CANCELLED") {
    await recordAuditSafe({
      actorUserId: "system",
      action: "order.late_deposit",
      targetType: "order",
      targetId: order.id,
      before: "CANCELLED",
      after: "CANCELLED",
    });
    console.warn(`late deposit after cancellation: order=${order.id} (refund via Toss dashboard — RUNBOOK_VA)`);
    return { status: 200, body: { status: "LATE_DEPOSIT", orderId: order.id } };
  }

  return { status: 200, body: { status: "PAID", orderId: order.id } };
}

// ── provider + secret wiring (sandbox outside production; impossible to stub in prod) ──
// Prod gate = isProductionRuntime (APP_ENV OR VERCEL_ENV), NOT APP_ENV alone: on Vercel the runtime
// auto-injects VERCEL_ENV=production, so an operator who forgets APP_ENV=production must still get the
// REAL provider (fail-closed if keys are absent), never the sandbox that settles /confirm for 0원 (F084).
export function checkoutProvider(env: Record<string, string | undefined> = process.env): PaymentProvider {
  if (isProductionRuntime(env)) return tossFromEnv(env);
  const sandboxTransport: TossTransport = async (url, init) => ({
    ok: true,
    status: 200,
    // GET = lookupPayment re-query. The sandbox can't know an order's real amount/id, so it
    // returns a benign payment that settles nothing (orderId:"" → UNKNOWN_ORDER). The webhook
    // safety-net is verified hermetically by webhook.test.ts; dev/E2E use the confirm path.
    // POST …/cancel = refund (F063): approves as CANCELED so the hermetic refund flow completes.
    // POST confirm — F070: a 가상계좌 paymentKey (test marker "_va_") returns WAITING_FOR_DEPOSIT +
    // an issued account so the deposit flow is exercisable hermetically; else immediate DONE.
    json: async () => {
      if (url.includes("/cancel")) return { status: "CANCELED" };
      if (init.method === "GET") return { status: "DONE", totalAmount: 0, orderId: "" };
      if (init.body.includes("_va_")) {
        return {
          status: "WAITING_FOR_DEPOSIT",
          virtualAccount: {
            bankCode: "20", // 우리은행
            accountNumber: "56001234567890",
            // F081 — "_va_expired_" 마커는 이미 지난 기한을 발급(비프로덕션 sandbox 전용): 만료 종료
            // 플로우를 hermetic E2E로 재현하기 위한 시험 seam이다. 실 Toss는 미래 기한만 발급한다.
            dueDate: init.body.includes("_va_expired_")
              ? new Date(Date.now() - 60 * 60 * 1000).toISOString()
              : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          },
        };
      }
      return { status: "DONE", approvedAt: new Date().toISOString() };
    },
  });
  return new TossPaymentProvider({
    secretKey: env.TOSS_SECRET_KEY ?? "test_sk_checkoutsandbox",
    clientKey: env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "test_ck_checkoutsandbox",
    transport: sandboxTransport,
  });
}

/** Webhook secret: env in prod (required → caller 401s if absent); test fallback otherwise. The prod
 * marker is isProductionRuntime (APP_ENV OR VERCEL_ENV) so the shared public constant test_whsec_sandbox
 * can NEVER authenticate webhooks on a Vercel prod box that only set VERCEL_ENV (F084). */
export function webhookSecret(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.TOSS_WEBHOOK_SECRET ?? (isProductionRuntime(env) ? undefined : "test_whsec_sandbox");
}

/**
 * F069 — the publishable 결제위젯 연동 키(gck) the browser payment widget renders with. This is a
 * DISTINCT key type from createCheckout's API-individual key(ck): the SDK enforces mutual exclusion
 * (toss.widgets() rejects a ck key, toss.payment() rejects a gck key), so the 결제위젯(entry) and the
 * 결제창(맞춤 written flow) must use different keys — hence NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY.
 *
 * Non-prod → Toss's public widget test key (test_gck_docs_…) so dev/E2E render without extra env.
 * Prod → the real gck key ONLY, with NO test-key fallback: a prod deploy that forgot it renders no
 * widget (honest load error) rather than a functioning TEST widget to real customers — the same
 * fail-fast-on-prod-misconfig discipline as tossFromEnv / the live-key refusal (worker≠checker F069).
 */
const TOSS_WIDGET_TEST_KEY = "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm"; // Toss 공개 위젯 테스트 키
export function checkoutClientKey(env: Record<string, string | undefined> = process.env): string {
  if (isProductionRuntime(env)) return env.NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY ?? ""; // F084: no test-key fallback in prod
  return env.NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY ?? TOSS_WIDGET_TEST_KEY;
}
