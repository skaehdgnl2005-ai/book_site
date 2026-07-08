import { describe, it, expect } from "vitest";
import {
  createOrderRepo,
  createWebhookLedger,
} from "../../src/app/api/payments/_lib/orders";
import {
  verifyWebhookToken,
  buildOrderDraft,
  confirmPayment,
  processWebhook,
  type TemplateResolver,
  type PaymentLookup,
} from "../../src/app/api/payments/_lib/checkout";
import type {
  PaymentProvider,
  Checkout,
  CreatePaymentInput,
  ConfirmInput,
  Confirmation,
  PaymentStatus,
  PaymentLookupResult,
} from "../../src/lib/payments";

// ── helpers ───────────────────────────────────────────────────────────────
// Toss does NOT sign PAYMENT_STATUS_CHANGED webhooks, so the shared URL token (registered
// in the dashboard webhook URL) is the cheap first-line filter and the AUTHORITATIVE check
// is a re-query (`lookupPayment`). TOKEN stands in for TOSS_WEBHOOK_SECRET. (F045 / ADR-0020)
const TOKEN = "test_whsec_unitfake";

/** A Toss PAYMENT_STATUS_CHANGED webhook body: { eventType, createdAt, data:{ paymentKey, orderId, status } }. */
function tossBody(over: { paymentKey?: string; orderId?: string; status?: string } = {}): string {
  return JSON.stringify({
    eventType: "PAYMENT_STATUS_CHANGED",
    createdAt: "2026-06-11T00:00:00.000000",
    data: {
      paymentKey: over.paymentKey ?? "pay_unit",
      orderId: over.orderId ?? "ord_unit",
      status: over.status ?? "DONE",
    },
  });
}

/** Stub the authoritative Toss re-query; captures the paymentKey it was (or wasn't) called with. */
function lookupReturning(
  result: PaymentLookupResult | null,
  captured: { paymentKey?: string } = {},
): PaymentLookup {
  return async (paymentKey) => {
    captured.paymentKey = paymentKey;
    return result;
  };
}

/** Hermetic seed-mirror-shaped resolver (every entry template: 43,000 / 49,000원). */
const resolver: TemplateResolver = async (key) => {
  const map: Record<string, { label: string; softPriceWon: number; hardPriceWon: number }> = {
    birth: { label: "탄생", softPriceWon: 43000, hardPriceWon: 49000 },
    became_sibling: { label: "형아 된 날", softPriceWon: 43000, hardPriceWon: 49000 },
  };
  return map[key] ?? null;
};

function line(over: Partial<Record<string, unknown>> = {}) {
  return {
    templateKey: "birth",
    coverType: "SOFT",
    unitPriceWon: 1, // tampered/untrusted — server must IGNORE this
    personalization: { childName: "도윤", childGender: "MALE", extraVar: { kind: "BIRTHDATE", value: "2024-01-15" } },
    photo: null,
    ...over,
  };
}

/** Valid shipping block (F053) — a physical keepsake needs a destination. */
function shipping(over: Partial<Record<string, unknown>> = {}) {
  return {
    shipName: "김수취",
    shipPhone: "010-2222-3333",
    shipZip: "04524",
    shipAddress: "서울특별시 중구 세종대로 110",
    shipAddressDetail: "101동 1001호",
    ...over,
  };
}

function payload(over: Partial<Record<string, unknown>> = {}) {
  return {
    buyerName: "김부모",
    buyerEmail: "parent@example.com",
    ...shipping(),
    qrVideoAddon: false,
    lines: [line()],
    ...over,
  };
}

/** A stub provider whose confirm() outcome + captured input are controllable. */
function stubProvider(outcome: PaymentStatus, captured: { input?: ConfirmInput } = {}): PaymentProvider {
  return {
    name: "stub",
    createCheckout(input: CreatePaymentInput): Checkout {
      return {
        provider: "stub",
        orderId: input.orderId,
        amount: input.amount,
        orderName: input.orderName,
        clientKey: "test_ck_stub",
        successUrl: input.successUrl,
        failUrl: input.failUrl,
      };
    },
    async confirm(input: ConfirmInput): Promise<Confirmation> {
      captured.input = input;
      return { status: outcome, provider: "stub", paymentKey: input.paymentKey, orderId: input.orderId, amount: input.amount };
    },
    async lookupPayment(_paymentKey: string): Promise<PaymentLookupResult | null> {
      return { status: outcome, amount: 0, orderId: "" }; // confirm tests don't exercise the re-query
    },
    async cancelPayment() {
      return { status: "CANCELED" as const }; // confirm tests don't exercise the refund path
    },
  };
}

async function paidOrder() {
  const repo = createOrderRepo();
  const built = await buildOrderDraft(payload(), resolver);
  if (!built.ok) throw new Error("fixture draft should be ok");
  return { repo, order: await repo.create(built.draft) };
}

// ── F045: webhook auth = shared URL token, constant-time (Toss does not sign payment webhooks) ──
describe("verifyWebhookToken", () => {
  it("accepts the exact shared token", () => {
    expect(verifyWebhookToken(TOKEN, TOKEN)).toBe(true);
  });

  it("rejects a same-length token with a single byte different (constant-time compare)", () => {
    const wrong = TOKEN.slice(0, -1) + "X";
    expect(verifyWebhookToken(wrong, TOKEN)).toBe(false);
  });

  it("rejects a token of a different length without throwing", () => {
    expect(verifyWebhookToken("short", TOKEN)).toBe(false);
  });

  it("rejects a null / missing token without throwing", () => {
    expect(verifyWebhookToken(null, TOKEN)).toBe(false);
  });

  it("rejects an empty token", () => {
    expect(verifyWebhookToken("", TOKEN)).toBe(false);
  });
});

// ── F012: server-side order draft (authoritative price recompute) ──────────────
describe("buildOrderDraft (server price recompute)", () => {
  it("recomputes a soft line to 43,000원, ignoring the client unitPriceWon", async () => {
    const r = await buildOrderDraft(payload(), resolver);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.amountWon).toBe(43000);
    expect(r.draft.items[0].unitPriceWon).toBe(43000); // not the tampered 1
    expect(r.draft.items[0].templateLabel).toBe("탄생"); // authoritative label
    expect(r.draft.orderName).toBe("탄생");
  });

  it("prices a hard cover at 49,000원", async () => {
    const r = await buildOrderDraft(payload({ lines: [line({ coverType: "HARD" })] }), resolver);
    expect(r.ok && r.draft.amountWon).toBe(49000);
  });

  it("sums multiple lines and names the order '<label> 외 N건'", async () => {
    const r = await buildOrderDraft(
      payload({ lines: [line(), line({ templateKey: "became_sibling", coverType: "HARD" })] }),
      resolver,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.amountWon).toBe(43000 + 49000);
    expect(r.draft.orderName).toBe("탄생 외 1건");
    expect(r.draft.items).toHaveLength(2);
  });

  it("adds +0원 for the QR add-on (priced via QR_ADDON_WON)", async () => {
    const r = await buildOrderDraft(payload({ qrVideoAddon: true }), resolver);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.amountWon).toBe(43000);
    expect(r.draft.qrVideoAddon).toBe(true);
  });

  it("rejects an unknown templateKey (400)", async () => {
    const r = await buildOrderDraft(payload({ lines: [line({ templateKey: "ghost" })] }), resolver);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
  });

  it("rejects an empty cart (400)", async () => {
    const r = await buildOrderDraft(payload({ lines: [] }), resolver);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
  });

  it("rejects a blank buyer name (400)", async () => {
    const r = await buildOrderDraft(payload({ buyerName: "   " }), resolver);
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid buyer email (400)", async () => {
    for (const bad of ["notanemail", "a@@b.com", "a@b.com@", "a@b", "a b@c.com"]) {
      const r = await buildOrderDraft(payload({ buyerEmail: bad }), resolver);
      expect(r.ok, `expected "${bad}" to be rejected`).toBe(false);
    }
  });

  it("rejects an invalid coverType (400)", async () => {
    const r = await buildOrderDraft(payload({ lines: [line({ coverType: "GOLD" })] }), resolver);
    expect(r.ok).toBe(false);
  });

  it("does not surface buyer PII on the order name", async () => {
    const r = await buildOrderDraft(payload({ buyerName: "비밀이름" }), resolver);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.orderName).not.toContain("비밀이름");
    expect(r.draft.orderName).not.toContain("도윤"); // childName must not leak into orderName
  });
});

// ── F053: shipping address — a physical keepsake needs a destination ────────────
describe("buildOrderDraft (shipping — F053)", () => {
  it("carries the shipping block onto the draft, merging the optional detail line", async () => {
    const r = await buildOrderDraft(payload(), resolver);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.shipName).toBe("김수취");
    expect(r.draft.shipPhone).toBe("010-2222-3333");
    expect(r.draft.shipZip).toBe("04524");
    expect(r.draft.shipAddress).toBe("서울특별시 중구 세종대로 110, 101동 1001호");
  });

  it("keeps the base address as-is when no detail line is given", async () => {
    const r = await buildOrderDraft(payload(shipping({ shipAddressDetail: "" })), resolver);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.shipAddress).toBe("서울특별시 중구 세종대로 110");
  });

  it("rejects a blank recipient name (400)", async () => {
    const r = await buildOrderDraft(payload({ shipName: "  " }), resolver);
    expect(r.ok).toBe(false);
  });

  it("rejects a malformed recipient phone (digits+hyphens, 9–13 chars)", async () => {
    for (const bad of ["", "12", "phone-num", "010 1234 5678", "010-1234-5678-9999"]) {
      const r = await buildOrderDraft(payload({ shipPhone: bad }), resolver);
      expect(r.ok, `expected "${bad}" to be rejected`).toBe(false);
    }
  });

  it("rejects a non-5-digit postal code", async () => {
    for (const bad of ["", "1234", "123456", "abcde"]) {
      const r = await buildOrderDraft(payload({ shipZip: bad }), resolver);
      expect(r.ok, `expected "${bad}" to be rejected`).toBe(false);
    }
  });

  it("rejects a blank base address (400)", async () => {
    const r = await buildOrderDraft(payload({ shipAddress: "   " }), resolver);
    expect(r.ok).toBe(false);
  });
});

// ── orders repo: idempotent markPaid contract ─────────────────────────────────
describe("orderRepo.markPaid", () => {
  it("creates orders CREATED with no payment key", async () => {
    const { order } = await paidOrder();
    expect(order.status).toBe("CREATED");
    expect(order.tossPaymentKey).toBeNull();
    expect(order.id).toMatch(/^ord_/);
  });

  it("marks a CREATED order PAID and stores the payment key (transitioned: the exactly-once signal, F055)", async () => {
    const { repo, order } = await paidOrder();
    const paid = await repo.markPaid(order.id, "pk_1");
    expect(paid.transitioned).toBe(true);
    expect(paid.order?.status).toBe("PAID");
    expect(paid.order?.tossPaymentKey).toBe("pk_1");
  });

  it("is idempotent: a second markPaid keeps the FIRST key and reports transitioned:false", async () => {
    const { repo, order } = await paidOrder();
    await repo.markPaid(order.id, "pk_1");
    const again = await repo.markPaid(order.id, "pk_2");
    expect(again.transitioned).toBe(false); // the replay must NOT re-fire settlement effects
    expect(again.order?.status).toBe("PAID");
    expect(again.order?.tossPaymentKey).toBe("pk_1"); // defensive against replay
  });

  it("returns no order (and no transition) for an unknown order id", async () => {
    const { repo } = await paidOrder();
    const res = await repo.markPaid("ord_nope", "pk");
    expect(res.order).toBeUndefined();
    expect(res.transitioned).toBe(false);
  });
});

// ── F013: synchronous confirm settles to PAID; failure leaves CREATED ──────────
describe("confirmPayment", () => {
  it("confirms with the SERVER-authoritative amount, not a client value", async () => {
    const { repo, order } = await paidOrder();
    const captured: { input?: ConfirmInput } = {};
    const res = await confirmPayment(repo, stubProvider("PAID", captured), { orderId: order.id, paymentKey: "pk_abc" });
    expect(res.status).toBe(200);
    expect(captured.input?.amount).toBe(order.amountWon); // authoritative
    expect((await repo.get(order.id))?.status).toBe("PAID");
  });

  it("leaves the order CREATED and returns 402 when the gateway does not approve", async () => {
    const { repo, order } = await paidOrder();
    const res = await confirmPayment(repo, stubProvider("FAILED"), { orderId: order.id, paymentKey: "pk_x" });
    expect(res.status).toBe(402);
    expect((await repo.get(order.id))?.status).toBe("CREATED"); // F015: no PAID order
  });

  it("returns 404 for an unknown order id", async () => {
    const { repo } = await paidOrder();
    const res = await confirmPayment(repo, stubProvider("PAID"), { orderId: "ord_ghost", paymentKey: "pk" });
    expect(res.status).toBe(404);
  });

  it("short-circuits an already-PAID order without re-calling the gateway (reload / webhook-first safe)", async () => {
    const { repo, order } = await paidOrder();
    await repo.markPaid(order.id, "pk_first"); // already PAID (e.g. the webhook beat the redirect)
    const captured: { input?: ConfirmInput } = {};
    const res = await confirmPayment(repo, stubProvider("FAILED", captured), {
      orderId: order.id,
      paymentKey: "pk_second",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PAID");
    expect(captured.input).toBeUndefined(); // gateway NOT re-called (real Toss would reject the used key)
    expect((await repo.get(order.id))?.tossPaymentKey).toBe("pk_first"); // first key preserved
  });
});

// ── F045: webhook → re-query verification → idempotent PAID (Toss real scheme) ──
// The body is an untrusted NOTIFICATION; the AUTHORITATIVE status/amount come from `lookup`
// (GET /v1/payments/{paymentKey}). Dedupe keys on paymentKey:status (Toss payment webhooks
// carry no event id). markPaid stays idempotent so the success-callback confirm and this
// webhook converge on the same order.
describe("processWebhook (Toss re-query scheme)", () => {
  it("marks the order PAID when the token is valid and the re-query is authoritative PAID with a matching amount", async () => {
    const { repo, order } = await paidOrder();
    const ledger = createWebhookLedger();
    const lookup = lookupReturning({ status: "PAID", amount: order.amountWon, orderId: order.id });
    const res = await processWebhook(tossBody({ orderId: order.id }), TOKEN, TOKEN, repo, ledger, lookup);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PAID");
    expect((await repo.get(order.id))?.status).toBe("PAID");
  });

  it("rejects an invalid token (401), does NOT re-query, and leaves the order CREATED", async () => {
    const { repo, order } = await paidOrder();
    const ledger = createWebhookLedger();
    const captured: { paymentKey?: string } = {};
    const lookup = lookupReturning({ status: "PAID", amount: order.amountWon, orderId: order.id }, captured);
    const res = await processWebhook(tossBody({ orderId: order.id }), "wrong-token", TOKEN, repo, ledger, lookup);
    expect(res.status).toBe(401);
    expect(captured.paymentKey).toBeUndefined(); // never re-queried — auth fails first
    expect((await repo.get(order.id))?.status).toBe("CREATED");
  });

  it("does NOT mark PAID when the body claims DONE but the authoritative re-query is not PAID (forged/optimistic body)", async () => {
    const { repo, order } = await paidOrder();
    const ledger = createWebhookLedger();
    const lookup = lookupReturning({ status: "CANCELED", amount: order.amountWon, orderId: order.id });
    const res = await processWebhook(tossBody({ orderId: order.id, status: "DONE" }), TOKEN, TOKEN, repo, ledger, lookup);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("IGNORED");
    expect((await repo.get(order.id))?.status).toBe("CREATED"); // re-query is the source of truth
  });

  it("does NOT mark PAID when the authoritative amount does not match the order (tamper guard)", async () => {
    const { repo, order } = await paidOrder();
    const ledger = createWebhookLedger();
    const lookup = lookupReturning({ status: "PAID", amount: order.amountWon + 1, orderId: order.id });
    const res = await processWebhook(tossBody({ orderId: order.id }), TOKEN, TOKEN, repo, ledger, lookup);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("AMOUNT_MISMATCH");
    expect((await repo.get(order.id))?.status).toBe("CREATED");
  });

  it("does NOT mark PAID when the re-query returns nothing (lookup failed / payment not found)", async () => {
    const { repo, order } = await paidOrder();
    const ledger = createWebhookLedger();
    const res = await processWebhook(tossBody({ orderId: order.id }), TOKEN, TOKEN, repo, ledger, lookupReturning(null));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("LOOKUP_FAILED");
    expect((await repo.get(order.id))?.status).toBe("CREATED");
  });

  it("is a strict no-op on redelivery of the same paymentKey:status (deduped BEFORE re-querying again)", async () => {
    const { repo, order } = await paidOrder();
    const ledger = createWebhookLedger();
    const body = tossBody({ paymentKey: "pay_dup", orderId: order.id });
    await processWebhook(body, TOKEN, TOKEN, repo, ledger, lookupReturning({ status: "PAID", amount: order.amountWon, orderId: order.id }));
    expect((await repo.get(order.id))?.status).toBe("PAID");

    const captured: { paymentKey?: string } = {};
    const res = await processWebhook(body, TOKEN, TOKEN, repo, ledger, lookupReturning({ status: "PAID", amount: order.amountWon, orderId: order.id }, captured));
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(captured.paymentKey).toBeUndefined(); // dedupe short-circuits before re-query
  });

  it("cannot be flipped by a forged CANCELED body while the AUTHORITATIVE payment is still PAID", async () => {
    const { repo, order } = await paidOrder();
    const ledger = createWebhookLedger();
    await processWebhook(
      tossBody({ paymentKey: "pay_x", orderId: order.id, status: "DONE" }),
      TOKEN, TOKEN, repo, ledger,
      lookupReturning({ status: "PAID", amount: order.amountWon, orderId: order.id }),
    );
    expect((await repo.get(order.id))?.status).toBe("PAID");

    // Forged later CANCELED BODY (valid token, distinct paymentKey:status → not deduped). The
    // re-query is authoritative and still says PAID — a body alone can never move an order.
    // (A GENUINELY cancelled payment — authoritative CANCELED — converges to REFUNDED by design
    // since F063; see the "authoritative CANCELED re-query converges" test above.)
    const res = await processWebhook(
      tossBody({ paymentKey: "pay_x", orderId: order.id, status: "CANCELED" }),
      TOKEN, TOKEN, repo, ledger,
      lookupReturning({ status: "PAID", amount: order.amountWon, orderId: order.id }),
    );
    expect(res.status).toBe(200);
    expect((await repo.get(order.id))?.status).toBe("PAID"); // the forged body moved nothing
  });

  it("acknowledges (200) a not-yet-settled payment without marking PAID", async () => {
    const { repo, order } = await paidOrder();
    const ledger = createWebhookLedger();
    const lookup = lookupReturning({ status: "FAILED", amount: order.amountWon, orderId: order.id });
    const res = await processWebhook(tossBody({ orderId: order.id, status: "IN_PROGRESS" }), TOKEN, TOKEN, repo, ledger, lookup);
    expect(res.status).toBe(200);
    expect((await repo.get(order.id))?.status).toBe("CREATED");
  });

  it("acknowledges (200) an event whose authoritative order is unknown", async () => {
    const { repo } = await paidOrder();
    const ledger = createWebhookLedger();
    const lookup = lookupReturning({ status: "PAID", amount: 43000, orderId: "ord_missing" });
    const res = await processWebhook(tossBody({ orderId: "ord_missing" }), TOKEN, TOKEN, repo, ledger, lookup);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("UNKNOWN_ORDER");
  });

  it("resolves the order from the AUTHORITATIVE orderId, ignoring a mismatched body orderId", async () => {
    const { repo, order } = await paidOrder();
    const ledger = createWebhookLedger();
    // The body lies about the orderId; the re-query returns the real one — we trust the re-query.
    const lookup = lookupReturning({ status: "PAID", amount: order.amountWon, orderId: order.id });
    const res = await processWebhook(tossBody({ orderId: "ord_lie" }), TOKEN, TOKEN, repo, ledger, lookup);
    expect(res.status).toBe(200);
    expect((await repo.get(order.id))?.status).toBe("PAID");
  });

  it("rejects a malformed JSON body (400) once the token passes", async () => {
    const { repo } = await paidOrder();
    const ledger = createWebhookLedger();
    const res = await processWebhook("{not json", TOKEN, TOKEN, repo, ledger, lookupReturning(null));
    expect(res.status).toBe(400);
  });

  it("rejects a payload with no paymentKey (400)", async () => {
    const { repo } = await paidOrder();
    const ledger = createWebhookLedger();
    const body = JSON.stringify({ eventType: "PAYMENT_STATUS_CHANGED", data: { orderId: "ord_x", status: "DONE" } });
    const res = await processWebhook(body, TOKEN, TOKEN, repo, ledger, lookupReturning(null));
    expect(res.status).toBe(400);
  });

  it("F063: an authoritative CANCELED re-query converges the order to REFUNDED (dashboard refunds land too)", async () => {
    const { repo, order } = await paidOrder();
    await repo.markPaid(order.id, "pk_1");
    const ledger = createWebhookLedger();
    const lookup = lookupReturning({ status: "CANCELED", amount: order.amountWon, orderId: order.id });

    const res = await processWebhook(tossBody({ status: "CANCELED" }), TOKEN, TOKEN, repo, ledger, lookup);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REFUNDED");
    expect((await repo.get(order.id))?.status).toBe("REFUNDED");

    // redelivery of the same paymentKey:status is deduped BEFORE any state change
    const again = await processWebhook(tossBody({ status: "CANCELED" }), TOKEN, TOKEN, repo, ledger, lookup);
    expect(again.body.duplicate).toBe(true);
    expect((await repo.get(order.id))?.status).toBe("REFUNDED");
  });

  it("F063: a CANCELED re-query for a CREATED (never-paid) order changes nothing (conditional transition)", async () => {
    const { repo, order } = await paidOrder(); // CREATED — markPaid NOT called
    const ledger = createWebhookLedger();
    const lookup = lookupReturning({ status: "CANCELED", amount: order.amountWon, orderId: order.id });

    await processWebhook(tossBody({ status: "CANCELED" }), TOKEN, TOKEN, repo, ledger, lookup);
    expect((await repo.get(order.id))?.status).toBe("CREATED"); // a never-paid order can't be "refunded"
  });

  it("converges with the success-callback confirm: a webhook on an already-PAID order is a no-op keeping the first key", async () => {
    const { repo, order } = await paidOrder();
    await repo.markPaid(order.id, "pk_confirm"); // the sync confirm settled it first
    const ledger = createWebhookLedger();
    const lookup = lookupReturning({ status: "PAID", amount: order.amountWon, orderId: order.id });
    const res = await processWebhook(tossBody({ paymentKey: "pay_webhook", orderId: order.id }), TOKEN, TOKEN, repo, ledger, lookup);
    expect(res.status).toBe(200);
    expect((await repo.get(order.id))?.status).toBe("PAID");
    expect((await repo.get(order.id))?.tossPaymentKey).toBe("pk_confirm"); // first key preserved
  });
});
