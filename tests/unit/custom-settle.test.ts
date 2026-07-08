import { describe, it, expect } from "vitest";
import {
  settleWrittenPayment,
  reconcileWrittenFromOrder,
} from "../../src/app/api/custom/_lib/settle";
import {
  buildWrittenIntake,
  buildPhoneIntake,
  createInMemoryCustomBackend,
  CUSTOM_ORDER_NAME,
  CUSTOM_PRICE_WON,
  type CustomBackend,
} from "../../src/lib/customRequest";
import { createOrderRepo, type OrderRepo } from "../../src/app/api/payments/_lib/orders";
import type { ConfirmInput, PaymentProvider } from "../../src/lib/payments";

// F052 — settle a WRITTEN custom payment: confirm with the SERVER-held amount, persist the
// Order(kind=CUSTOM) payment record, link the CustomRequest, mark it SUBMITTED. All hermetic:
// fresh in-memory backends + a fake provider per test (the confirmPayment(repo, provider, …)
// injection precedent — no globalThis singletons, no network).

function fakeProvider(outcome: "PAID" | "FAILED" = "PAID") {
  const confirms: ConfirmInput[] = [];
  const provider: PaymentProvider = {
    name: "fake",
    createCheckout: (input) => ({
      provider: "fake",
      orderId: input.orderId,
      amount: input.amount,
      orderName: input.orderName,
      clientKey: "test_ck_fake",
      successUrl: input.successUrl,
      failUrl: input.failUrl,
    }),
    confirm: async (input) => {
      confirms.push(input);
      return {
        status: outcome,
        provider: "fake",
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        amount: input.amount,
      };
    },
    lookupPayment: async () => null,
    cancelPayment: async () => ({ status: "CANCELED" as const }),
  };
  return { provider, confirms };
}

const writtenDraft = () =>
  buildWrittenIntake({
    contactName: "김부모",
    contactPhone: "010-1234-5678",
    contactEmail: "parent@example.com",
    answers: { protagonist: { name: "서연" } },
  });

/** Mirror the intake route: create the request AND its CREATED Order(kind=CUSTOM, id = rec.id). */
async function setup(store: CustomBackend, repo: OrderRepo) {
  const rec = await store.create(writtenDraft());
  await repo.create({
    kind: "CUSTOM",
    id: rec.id,
    amountWon: rec.amountWon,
    orderName: CUSTOM_ORDER_NAME,
    qrVideoAddon: false,
    buyerName: rec.contactName,
    buyerEmail: rec.contactEmail,
    items: [],
  });
  return rec;
}

describe("settleWrittenPayment (F052)", () => {
  it("happy path: confirms with the server-held amount, marks the Order PAID + the request SUBMITTED, links them", async () => {
    const store = createInMemoryCustomBackend();
    const repo = createOrderRepo();
    const { provider, confirms } = fakeProvider();
    const rec = await setup(store, repo);

    const res = await settleWrittenPayment(store, repo, provider, { id: rec.id, paymentKey: "pk_live_flow" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUBMITTED");

    expect(confirms).toEqual([{ paymentKey: "pk_live_flow", orderId: rec.id, amount: CUSTOM_PRICE_WON }]);
    const order = await repo.get(rec.id);
    expect(order?.status).toBe("PAID");
    expect(order?.kind).toBe("CUSTOM");
    expect(order?.tossPaymentKey).toBe("pk_live_flow");
    const updated = await store.get(rec.id);
    expect(updated?.status).toBe("SUBMITTED");
    expect(updated?.orderId).toBe(rec.id);
  });

  it("replay is idempotent: a second settle re-confirms nothing and keeps the first paymentKey", async () => {
    const store = createInMemoryCustomBackend();
    const repo = createOrderRepo();
    const { provider, confirms } = fakeProvider();
    const rec = await setup(store, repo);

    await settleWrittenPayment(store, repo, provider, { id: rec.id, paymentKey: "pk_first" });
    const res = await settleWrittenPayment(store, repo, provider, { id: rec.id, paymentKey: "pk_second" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUBMITTED");
    expect(confirms).toHaveLength(1); // gateway called exactly once
    expect((await repo.get(rec.id))?.tossPaymentKey).toBe("pk_first");
  });

  it("a non-PAID confirmation settles NOTHING (no phantom submission)", async () => {
    const store = createInMemoryCustomBackend();
    const repo = createOrderRepo();
    const { provider } = fakeProvider("FAILED");
    const rec = await setup(store, repo);

    const res = await settleWrittenPayment(store, repo, provider, { id: rec.id, paymentKey: "pk_bad" });
    expect(res.status).toBe(402);
    expect((await store.get(rec.id))?.status).toBe("PENDING_PAYMENT");
    expect((await repo.get(rec.id))?.status).toBe("CREATED");
    expect((await store.get(rec.id))?.orderId).toBeUndefined();
  });

  it("unknown id → 404; missing paymentKey → 400; PHONE path → 400", async () => {
    const store = createInMemoryCustomBackend();
    const repo = createOrderRepo();
    const { provider } = fakeProvider();

    expect((await settleWrittenPayment(store, repo, provider, { id: "cr_nope", paymentKey: "pk" })).status).toBe(404);

    const rec = await setup(store, repo);
    expect((await settleWrittenPayment(store, repo, provider, { id: rec.id, paymentKey: "" })).status).toBe(400);

    const phone = await store.create(buildPhoneIntake({ slot: "2026-06-08T10:00", name: "n", phone: "p", memo: "" }));
    expect((await settleWrittenPayment(store, repo, provider, { id: phone.id, paymentKey: "pk" })).status).toBe(400);
  });

  it("legacy request without an intake-time Order: settle creates the Order(kind=CUSTOM) itself", async () => {
    const store = createInMemoryCustomBackend();
    const repo = createOrderRepo();
    const { provider } = fakeProvider();
    const rec = await store.create(writtenDraft()); // NO intake-time order (pre-F052 row)

    const res = await settleWrittenPayment(store, repo, provider, { id: rec.id, paymentKey: "pk_legacy" });
    expect(res.status).toBe(200);
    const order = await repo.get(rec.id);
    expect(order?.kind).toBe("CUSTOM");
    expect(order?.status).toBe("PAID");
    expect(order?.buyerEmail).toBe("parent@example.com");
    expect(order?.amountWon).toBe(CUSTOM_PRICE_WON);
  });

  it("webhook-first: an already-PAID Order skips the gateway and still submits the request", async () => {
    const store = createInMemoryCustomBackend();
    const repo = createOrderRepo();
    const { provider, confirms } = fakeProvider();
    const rec = await setup(store, repo);
    await repo.markPaid(rec.id, "pk_webhook"); // the async webhook settled the payment first

    const res = await settleWrittenPayment(store, repo, provider, { id: rec.id, paymentKey: "pk_redirect" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUBMITTED");
    expect(confirms).toHaveLength(0); // never re-confirm a settled payment (real Toss would 402)
    expect((await repo.get(rec.id))?.tossPaymentKey).toBe("pk_webhook"); // first key preserved
  });
});

describe("reconcileWrittenFromOrder (F052 — buyer closed the window; webhook already PAID)", () => {
  it("submits + links a PENDING_PAYMENT request whose Order is already PAID", async () => {
    const store = createInMemoryCustomBackend();
    const repo = createOrderRepo();
    const rec = await setup(store, repo);
    await repo.markPaid(rec.id, "pk_webhook");

    const updated = await reconcileWrittenFromOrder(store, repo, rec.id);
    expect(updated?.status).toBe("SUBMITTED");
    expect(updated?.orderId).toBe(rec.id);
  });

  it("changes nothing while the Order is still CREATED (unpaid stays honestly unpaid)", async () => {
    const store = createInMemoryCustomBackend();
    const repo = createOrderRepo();
    const rec = await setup(store, repo);

    const updated = await reconcileWrittenFromOrder(store, repo, rec.id);
    expect(updated?.status).toBe("PENDING_PAYMENT");
    expect((await store.get(rec.id))?.orderId).toBeUndefined();
  });
});
