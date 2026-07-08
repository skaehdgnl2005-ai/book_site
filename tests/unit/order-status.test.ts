import { describe, it, expect } from "vitest";
import {
  ORDER_STATUSES,
  PAID_FAMILY,
  isPaidFamily,
  canTransition,
  toOrderStatus,
  ORDER_STATUS_LABEL,
} from "../../src/app/api/payments/_lib/status";
import { createOrderRepo, type OrderDraft, type OrderStatus } from "../../src/app/api/payments/_lib/orders";
import { confirmPayment } from "../../src/app/api/payments/_lib/checkout";
import type { ConfirmInput, PaymentProvider } from "../../src/lib/payments";

// F054 — the order status machine: 7 app-layer states (the DB enum reserved them at F004),
// an explicit transition table, and a conditional-write repo transition. CREATED→PAID is NOT
// in the table on purpose: payment settlement goes through markPaid (gateway-confirmed), never
// an admin hand-flip.

const ALL: readonly OrderStatus[] = ["CREATED", "PAID", "IN_PRODUCTION", "SHIPPED", "COMPLETED", "CANCELLED", "REFUNDED"];

const ALLOWED: ReadonlyArray<[OrderStatus, OrderStatus]> = [
  ["CREATED", "CANCELLED"],
  ["PAID", "IN_PRODUCTION"],
  ["PAID", "REFUNDED"],
  ["IN_PRODUCTION", "SHIPPED"],
  ["IN_PRODUCTION", "REFUNDED"],
  ["SHIPPED", "COMPLETED"],
];

describe("status vocabulary (F054)", () => {
  it("exposes exactly the 7 reserved statuses, each with a Korean label", () => {
    expect([...ORDER_STATUSES].sort()).toEqual([...ALL].sort());
    for (const s of ALL) expect(ORDER_STATUS_LABEL[s]?.length).toBeGreaterThan(0);
  });

  it("paid family = PAID and its forward fulfillment states (not CANCELLED/REFUNDED/CREATED)", () => {
    expect([...PAID_FAMILY].sort()).toEqual(["COMPLETED", "IN_PRODUCTION", "PAID", "SHIPPED"]);
    expect(isPaidFamily("PAID")).toBe(true);
    expect(isPaidFamily("SHIPPED")).toBe(true);
    expect(isPaidFamily("CREATED")).toBe(false);
    expect(isPaidFamily("REFUNDED")).toBe(false);
  });

  it("canTransition matches the table EXHAUSTIVELY over all 49 pairs", () => {
    const allowed = new Set(ALLOWED.map(([f, t]) => `${f}>${t}`));
    for (const from of ALL) {
      for (const to of ALL) {
        expect(canTransition(from, to), `${from} → ${to}`).toBe(allowed.has(`${from}>${to}`));
      }
    }
  });

  it("toOrderStatus passes known statuses through and falls back to CREATED on junk", () => {
    for (const s of ALL) expect(toOrderStatus(s)).toBe(s);
    expect(toOrderStatus("GARBAGE")).toBe("CREATED");
    expect(toOrderStatus(undefined)).toBe("CREATED");
  });
});

// ── repo.transition: conditional write (two admins double-clicking apply exactly once) ──
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

describe("orderRepo.transition (F054)", () => {
  it("transitions only from an allowed 'from' state — conditional, reports ok honestly", async () => {
    const repo = createOrderRepo();
    const order = await repo.create(draft());

    expect((await repo.transition(order.id, ["PAID"], "IN_PRODUCTION")).ok).toBe(false); // still CREATED
    await repo.markPaid(order.id, "pk_1");
    expect((await repo.transition(order.id, ["PAID"], "IN_PRODUCTION")).ok).toBe(true);
    expect((await repo.get(order.id))?.status).toBe("IN_PRODUCTION");

    // replay (double click): the from-state no longer matches — a strict no-op.
    expect((await repo.transition(order.id, ["PAID"], "IN_PRODUCTION")).ok).toBe(false);
    expect((await repo.get(order.id))?.status).toBe("IN_PRODUCTION");
  });

  it("unknown id → ok:false", async () => {
    const repo = createOrderRepo();
    expect((await repo.transition("ord_nope", ["PAID"], "IN_PRODUCTION")).ok).toBe(false);
  });
});

// ── the settled family stays settled: confirm short-circuits any paid-family state ──
function neverConfirmProvider() {
  const confirms: ConfirmInput[] = [];
  const provider: PaymentProvider = {
    name: "fake",
    createCheckout: (i) => ({
      provider: "fake", orderId: i.orderId, amount: i.amount, orderName: i.orderName,
      clientKey: "ck", successUrl: i.successUrl, failUrl: i.failUrl,
    }),
    confirm: async (i) => {
      confirms.push(i);
      return { status: "PAID", provider: "fake", paymentKey: i.paymentKey, orderId: i.orderId, amount: i.amount };
    },
    lookupPayment: async () => null,
    cancelPayment: async () => ({ status: "CANCELED" as const }),
  };
  return { provider, confirms };
}

describe("confirmPayment × status machine (F054)", () => {
  it("short-circuits a forward-fulfillment order (IN_PRODUCTION) as settled — no gateway call", async () => {
    const repo = createOrderRepo();
    const { provider, confirms } = neverConfirmProvider();
    const order = await repo.create(draft());
    await repo.markPaid(order.id, "pk_first");
    await repo.transition(order.id, ["PAID"], "IN_PRODUCTION");

    const res = await confirmPayment(repo, provider, { orderId: order.id, paymentKey: "pk_replay" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PAID"); // settled — the success page redirect contract holds
    expect(confirms).toHaveLength(0);
    expect((await repo.get(order.id))?.tossPaymentKey).toBe("pk_first");
  });

  it("refuses to settle a CANCELLED order (402 with the real status; no gateway call)", async () => {
    const repo = createOrderRepo();
    const { provider, confirms } = neverConfirmProvider();
    const order = await repo.create(draft());
    await repo.transition(order.id, ["CREATED"], "CANCELLED");

    const res = await confirmPayment(repo, provider, { orderId: order.id, paymentKey: "pk_x" });
    expect(res.status).toBe(402);
    expect(res.body.status).toBe("CANCELLED");
    expect(confirms).toHaveLength(0);
    expect((await repo.get(order.id))?.status).toBe("CANCELLED");
  });
});
