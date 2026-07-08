import { describe, it, expect } from "vitest";
import { createOrderRepo, createWebhookLedger, type OrderDraft, type StoredOrder } from "../../src/app/api/payments/_lib/orders";
import { confirmPayment, processWebhook, type PaymentLookup } from "../../src/app/api/payments/_lib/checkout";
import { settleWrittenPayment } from "../../src/app/api/custom/_lib/settle";
import { buildWrittenIntake, createInMemoryCustomBackend, CUSTOM_ORDER_NAME } from "../../src/lib/customRequest";
import type { ConfirmInput, PaymentProvider } from "../../src/lib/payments";

// F055 — the order-confirmation notifier fires EXACTLY ONCE per order: markPaid's atomic
// conditional write is the truth source, so whichever of confirm/webhook actually transitions
// CREATED→PAID notifies, and every replay/loser is silent. Hermetic: injected notify counter
// (the after()-scheduled email lives in the route-layer notifier, exercised via the mock
// adapter transitively — e2e_via F013).

const TOKEN = "test_whsec_unitfake";

function draft(): OrderDraft {
  return {
    amountWon: 43000,
    orderName: "탄생",
    qrVideoAddon: false,
    buyerName: "김부모",
    buyerEmail: "parent@example.com",
    items: [],
  };
}

function provider(outcome: "PAID" | "FAILED" = "PAID"): PaymentProvider {
  return {
    name: "fake",
    createCheckout: (i) => ({
      provider: "fake", orderId: i.orderId, amount: i.amount, orderName: i.orderName,
      clientKey: "ck", successUrl: i.successUrl, failUrl: i.failUrl,
    }),
    confirm: async (i: ConfirmInput) => ({
      status: outcome, provider: "fake", paymentKey: i.paymentKey, orderId: i.orderId, amount: i.amount,
    }),
    lookupPayment: async () => null,
    cancelPayment: async () => ({ status: "CANCELED" as const }),
  };
}

function tossBody(paymentKey: string): string {
  return JSON.stringify({
    eventType: "PAYMENT_STATUS_CHANGED",
    createdAt: "2026-07-07T00:00:00.000000",
    data: { paymentKey, orderId: "ignored", status: "DONE" },
  });
}

function notifier() {
  const notified: StoredOrder[] = [];
  return { notified, notify: (o: StoredOrder) => void notified.push(o) };
}

describe("settlement notification — exactly once (F055)", () => {
  it("confirm first, webhook second: ONE notification (the webhook replay is silent)", async () => {
    const repo = createOrderRepo();
    const ledger = createWebhookLedger();
    const order = await repo.create(draft());
    const { notified, notify } = notifier();

    const res = await confirmPayment(repo, provider(), { orderId: order.id, paymentKey: "pk_1" }, notify);
    expect(res.status).toBe(200);

    const lookup: PaymentLookup = async () => ({ status: "PAID", amount: 43000, orderId: order.id });
    await processWebhook(tossBody("pk_1"), TOKEN, TOKEN, repo, ledger, lookup, notify);

    expect(notified).toHaveLength(1);
    expect(notified[0].id).toBe(order.id);
    expect(notified[0].buyerEmail).toBe("parent@example.com");
  });

  it("webhook first, confirm second: still ONE notification (the confirm short-circuit is silent)", async () => {
    const repo = createOrderRepo();
    const ledger = createWebhookLedger();
    const order = await repo.create(draft());
    const { notified, notify } = notifier();

    const lookup: PaymentLookup = async () => ({ status: "PAID", amount: 43000, orderId: order.id });
    await processWebhook(tossBody("pk_wh"), TOKEN, TOKEN, repo, ledger, lookup, notify);
    await confirmPayment(repo, provider(), { orderId: order.id, paymentKey: "pk_replay" }, notify);

    expect(notified).toHaveLength(1);
  });

  it("a FAILED confirmation notifies nothing", async () => {
    const repo = createOrderRepo();
    const order = await repo.create(draft());
    const { notified, notify } = notifier();
    await confirmPayment(repo, provider("FAILED"), { orderId: order.id, paymentKey: "pk_x" }, notify);
    expect(notified).toHaveLength(0);
  });

  it("a reloaded success page (confirm replay) notifies nothing new", async () => {
    const repo = createOrderRepo();
    const order = await repo.create(draft());
    const { notified, notify } = notifier();
    await confirmPayment(repo, provider(), { orderId: order.id, paymentKey: "pk_1" }, notify);
    await confirmPayment(repo, provider(), { orderId: order.id, paymentKey: "pk_1" }, notify);
    expect(notified).toHaveLength(1);
  });

  it("CUSTOM settle notifies once with the CUSTOM order (settle replay silent)", async () => {
    const store = createInMemoryCustomBackend();
    const repo = createOrderRepo();
    const { notified, notify } = notifier();
    const rec = await store.create(
      buildWrittenIntake({
        contactName: "김부모",
        contactPhone: "010",
        contactEmail: "parent@example.com",
        answers: { protagonist: { name: "서연" } },
      }),
    );
    await repo.create({
      kind: "CUSTOM", id: rec.id, amountWon: rec.amountWon, orderName: CUSTOM_ORDER_NAME,
      qrVideoAddon: false, buyerName: rec.contactName, buyerEmail: rec.contactEmail, items: [],
    });

    await settleWrittenPayment(store, repo, provider(), { id: rec.id, paymentKey: "pk_c" }, notify);
    await settleWrittenPayment(store, repo, provider(), { id: rec.id, paymentKey: "pk_c" }, notify);

    expect(notified).toHaveLength(1);
    expect(notified[0].kind).toBe("CUSTOM");
    expect(notified[0].orderName).toBe(CUSTOM_ORDER_NAME);
  });
});
