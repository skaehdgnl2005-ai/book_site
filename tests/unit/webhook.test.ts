import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  createOrderRepo,
  createWebhookLedger,
} from "../../src/app/api/payments/_lib/orders";
import {
  verifyWebhookSignature,
  buildOrderDraft,
  confirmPayment,
  processWebhook,
  type TemplateResolver,
} from "../../src/app/api/payments/_lib/checkout";
import type {
  PaymentProvider,
  Checkout,
  CreatePaymentInput,
  ConfirmInput,
  Confirmation,
  PaymentStatus,
} from "../../src/lib/payments";

// ── helpers ───────────────────────────────────────────────────────────────
const SECRET = "test_whsec_unitfake";

/** Independent HMAC (NOT the impl) so the test pins the documented contract, not itself. */
function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
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

function payload(over: Partial<Record<string, unknown>> = {}) {
  return {
    buyerName: "김부모",
    buyerEmail: "parent@example.com",
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
  };
}

async function paidOrder() {
  const repo = createOrderRepo();
  const built = await buildOrderDraft(payload(), resolver);
  if (!built.ok) throw new Error("fixture draft should be ok");
  return { repo, order: await repo.create(built.draft) };
}

// ── F013: webhook signature verification (raw body, HMAC-SHA256, constant-time) ──
describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ eventId: "evt_1", orderId: "ord_1", status: "DONE" });

  it("accepts a signature computed over the exact raw body", () => {
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects when a single byte of the body is mutated", () => {
    const goodSig = sign(body);
    const tampered = body.replace('"DONE"', '"DONE "'); // 1 byte added
    expect(verifyWebhookSignature(tampered, goodSig, SECRET)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(verifyWebhookSignature(body, sign(body, "wrong_secret"), SECRET)).toBe(false);
  });

  it("rejects a null / missing signature without throwing", () => {
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
  });

  it("rejects a malformed (wrong-length) signature without throwing", () => {
    expect(verifyWebhookSignature(body, "deadbeef", SECRET)).toBe(false);
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

// ── orders repo: idempotent markPaid contract ─────────────────────────────────
describe("orderRepo.markPaid", () => {
  it("creates orders CREATED with no payment key", async () => {
    const { order } = await paidOrder();
    expect(order.status).toBe("CREATED");
    expect(order.tossPaymentKey).toBeNull();
    expect(order.id).toMatch(/^ord_/);
  });

  it("marks a CREATED order PAID and stores the payment key", async () => {
    const { repo, order } = await paidOrder();
    const paid = await repo.markPaid(order.id, "pk_1");
    expect(paid?.status).toBe("PAID");
    expect(paid?.tossPaymentKey).toBe("pk_1");
  });

  it("is idempotent: a second markPaid keeps the FIRST key (no overwrite)", async () => {
    const { repo, order } = await paidOrder();
    await repo.markPaid(order.id, "pk_1");
    const again = await repo.markPaid(order.id, "pk_2");
    expect(again?.status).toBe("PAID");
    expect(again?.tossPaymentKey).toBe("pk_1"); // defensive against replay
  });

  it("returns undefined for an unknown order id", async () => {
    const { repo } = await paidOrder();
    expect(await repo.markPaid("ord_nope", "pk")).toBeUndefined();
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

// ── F013: webhook → PAID, signature-verified, idempotent via the ledger ────────
describe("processWebhook", () => {
  it("marks the order PAID on a valid signature + DONE event", async () => {
    const { repo, order } = await paidOrder();
    const ledger = createWebhookLedger();
    const body = JSON.stringify({ eventId: "evt_a", orderId: order.id, status: "DONE" });
    const res = await processWebhook(body, sign(body), SECRET, repo, ledger);
    expect(res.status).toBe(200);
    expect((await repo.get(order.id))?.status).toBe("PAID");
  });

  it("rejects an invalid signature (401) and leaves the order CREATED", async () => {
    const { repo, order } = await paidOrder();
    const ledger = createWebhookLedger();
    const body = JSON.stringify({ eventId: "evt_b", orderId: order.id, status: "DONE" });
    const res = await processWebhook(body, sign(body, "attacker"), SECRET, repo, ledger);
    expect(res.status).toBe(401);
    expect((await repo.get(order.id))?.status).toBe("CREATED");
  });

  it("is a no-op on redelivery of the same eventId (cannot be flipped by a forged later event)", async () => {
    const { repo, order } = await paidOrder();
    const ledger = createWebhookLedger();
    const first = JSON.stringify({ eventId: "evt_c", orderId: order.id, status: "DONE" });
    await processWebhook(first, sign(first), SECRET, repo, ledger);
    expect((await repo.get(order.id))?.status).toBe("PAID");

    // Same eventId, but a forged CANCELED payload + valid signature.
    const replay = JSON.stringify({ eventId: "evt_c", orderId: order.id, status: "CANCELED" });
    const res = await processWebhook(replay, sign(replay), SECRET, repo, ledger);
    expect(res.status).toBe(200);
    expect((await repo.get(order.id))?.status).toBe("PAID"); // dedupe short-circuits before any state change
  });

  it("acknowledges a non-DONE event without marking PAID", async () => {
    const { repo, order } = await paidOrder();
    const ledger = createWebhookLedger();
    const body = JSON.stringify({ eventId: "evt_d", orderId: order.id, status: "CANCELED" });
    const res = await processWebhook(body, sign(body), SECRET, repo, ledger);
    expect(res.status).toBe(200);
    expect((await repo.get(order.id))?.status).toBe("CREATED");
  });

  it("acknowledges (no crash) an event for an unknown order", async () => {
    const { repo } = await paidOrder();
    const ledger = createWebhookLedger();
    const body = JSON.stringify({ eventId: "evt_e", orderId: "ord_missing", status: "DONE" });
    const res = await processWebhook(body, sign(body), SECRET, repo, ledger);
    expect(res.status).toBe(200);
  });
});
