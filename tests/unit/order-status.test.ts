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

// F054/F070 — the order status machine: 8 app-layer states (F070 added WAITING_FOR_DEPOSIT), an
// explicit transition table, and a conditional-write repo transition. CREATED→PAID is NOT in the
// table on purpose: payment settlement goes through markPaid (gateway-confirmed), never an admin
// hand-flip. F070: CREATED→WAITING_FOR_DEPOSIT (markAwaitingDeposit) and WAITING_FOR_DEPOSIT→PAID
// (deposit webhook) are settlement transitions too — NOT in the admin table (only WFD→CANCELLED is).

const ALL: readonly OrderStatus[] = ["CREATED", "WAITING_FOR_DEPOSIT", "PAID", "IN_PRODUCTION", "SHIPPED", "COMPLETED", "CANCELLED", "REFUNDED"];

const ALLOWED: ReadonlyArray<[OrderStatus, OrderStatus]> = [
  ["CREATED", "CANCELLED"],
  ["WAITING_FOR_DEPOSIT", "CANCELLED"], // F070 — 미입금/기한만료 종료 (입금 확정→PAID은 웹훅 전용)
  ["PAID", "IN_PRODUCTION"],
  ["PAID", "REFUNDED"],
  ["IN_PRODUCTION", "SHIPPED"],
  ["IN_PRODUCTION", "REFUNDED"],
  ["SHIPPED", "COMPLETED"],
];

describe("status vocabulary (F054/F070)", () => {
  it("exposes exactly the 8 statuses, each with a Korean label", () => {
    expect([...ORDER_STATUSES].sort()).toEqual([...ALL].sort());
    for (const s of ALL) expect(ORDER_STATUS_LABEL[s]?.length).toBeGreaterThan(0);
  });

  it("F070: WAITING_FOR_DEPOSIT is NOT paid-family (no money received) and WFD→PAID is NOT an admin transition", () => {
    expect(isPaidFamily("WAITING_FOR_DEPOSIT")).toBe(false);
    expect(canTransition("WAITING_FOR_DEPOSIT", "PAID")).toBe(false); // settlement is markPaid, not canTransition
    expect(canTransition("CREATED", "WAITING_FOR_DEPOSIT")).toBe(false); // markAwaitingDeposit, not canTransition
    expect(canTransition("WAITING_FOR_DEPOSIT", "CANCELLED")).toBe(true); // 미입금 종료만 허용
  });

  it("paid family = PAID and its forward fulfillment states (not CANCELLED/REFUNDED/CREATED)", () => {
    expect([...PAID_FAMILY].sort()).toEqual(["COMPLETED", "IN_PRODUCTION", "PAID", "SHIPPED"]);
    expect(isPaidFamily("PAID")).toBe(true);
    expect(isPaidFamily("SHIPPED")).toBe(true);
    expect(isPaidFamily("CREATED")).toBe(false);
    expect(isPaidFamily("REFUNDED")).toBe(false);
  });

  it("canTransition matches the table EXHAUSTIVELY over all 64 pairs", () => {
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

// ── F070: 가상계좌 — markAwaitingDeposit (CREATED→WFD) then markPaid settles WFD→PAID on deposit ──
describe("orderRepo virtual-account settlement (F070)", () => {
  const va = { bank: "우리은행", account: "56001234567890", dueDate: "2026-07-20T23:59:59.000Z" };

  it("markAwaitingDeposit records the issued account + moves CREATED→WAITING_FOR_DEPOSIT (idempotent)", async () => {
    const repo = createOrderRepo();
    const order = await repo.create(draft());

    const first = await repo.markAwaitingDeposit(order.id, "pk_va_1", va);
    expect(first.transitioned).toBe(true);
    const stored = await repo.get(order.id);
    expect(stored?.status).toBe("WAITING_FOR_DEPOSIT");
    expect(stored?.tossPaymentKey).toBe("pk_va_1");
    expect(stored?.depositBank).toBe("우리은행");
    expect(stored?.depositAccount).toBe("56001234567890");
    expect(stored?.depositDueDate).toBe(va.dueDate);

    // replay: already WFD → no-op (first paymentKey preserved).
    const again = await repo.markAwaitingDeposit(order.id, "pk_va_2", va);
    expect(again.transitioned).toBe(false);
    expect((await repo.get(order.id))?.tossPaymentKey).toBe("pk_va_1");
  });

  it("a deposit settles a WAITING_FOR_DEPOSIT order: markPaid WFD→PAID, exactly-once", async () => {
    const repo = createOrderRepo();
    const order = await repo.create(draft());
    await repo.markAwaitingDeposit(order.id, "pk_va_1", va);

    const paid = await repo.markPaid(order.id, "pk_va_1");
    expect(paid.transitioned).toBe(true); // the deposit webhook's transition
    expect((await repo.get(order.id))?.status).toBe("PAID");

    // replay: already PAID → no-op (exactly-once for the confirmation email).
    expect((await repo.markPaid(order.id, "pk_va_1")).transitioned).toBe(false);
  });

  it("markAwaitingDeposit refuses a non-CREATED order (already PAID card order)", async () => {
    const repo = createOrderRepo();
    const order = await repo.create(draft());
    await repo.markPaid(order.id, "pk_card");
    expect((await repo.markAwaitingDeposit(order.id, "pk_va", va)).transitioned).toBe(false);
    expect((await repo.get(order.id))?.status).toBe("PAID");
  });

  it("a CANCELLED (expired) 가상계좌 order can NEVER be re-settled by a late deposit (markPaid excludes CANCELLED)", async () => {
    const repo = createOrderRepo();
    const order = await repo.create(draft());
    await repo.markAwaitingDeposit(order.id, "pk_va", va);
    await repo.transition(order.id, ["WAITING_FOR_DEPOSIT"], "CANCELLED"); // 기한 만료 → 취소
    // 만료 후 뒤늦은 입금 통보가 와도 markPaid는 CREATED|WFD에서만 전이 → CANCELLED은 불변.
    const late = await repo.markPaid(order.id, "pk_va");
    expect(late.transitioned).toBe(false);
    expect((await repo.get(order.id))?.status).toBe("CANCELLED");
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

  it("F070: a 가상계좌 confirm (WAITING_FOR_DEPOSIT + account) stores the account, does NOT mark PAID, and never notifies", async () => {
    const repo = createOrderRepo();
    const notified: string[] = [];
    const provider: PaymentProvider = {
      name: "fake",
      createCheckout: (i) => ({ provider: "fake", orderId: i.orderId, amount: i.amount, orderName: i.orderName, clientKey: "ck", successUrl: i.successUrl, failUrl: i.failUrl }),
      confirm: async (i) => ({
        status: "WAITING_FOR_DEPOSIT", provider: "fake", paymentKey: i.paymentKey, orderId: i.orderId, amount: i.amount,
        virtualAccount: { bank: "우리은행", accountNumber: "56001234567890", dueDate: "2026-07-20T23:59:59.000Z" },
      }),
      lookupPayment: async () => null,
      cancelPayment: async () => ({ status: "CANCELED" as const }),
    };
    const order = await repo.create(draft());

    const res = await confirmPayment(repo, provider, { orderId: order.id, paymentKey: "pk_va" }, (o) => notified.push(o.id));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("WAITING_FOR_DEPOSIT");
    const stored = await repo.get(order.id);
    expect(stored?.status).toBe("WAITING_FOR_DEPOSIT"); // NOT paid
    expect(stored?.depositAccount).toBe("56001234567890");
    expect(notified).toHaveLength(0); // 발급 시점엔 확인 메일 없음 — 입금 완료(PAID) 때만
  });

  it("F070: a WAITING_FOR_DEPOSIT confirm with NO account info is refused (402), order stays CREATED", async () => {
    const repo = createOrderRepo();
    const provider: PaymentProvider = {
      name: "fake",
      createCheckout: (i) => ({ provider: "fake", orderId: i.orderId, amount: i.amount, orderName: i.orderName, clientKey: "ck", successUrl: i.successUrl, failUrl: i.failUrl }),
      confirm: async (i) => ({ status: "WAITING_FOR_DEPOSIT", provider: "fake", paymentKey: i.paymentKey, orderId: i.orderId, amount: i.amount }), // no virtualAccount
      lookupPayment: async () => null,
      cancelPayment: async () => ({ status: "CANCELED" as const }),
    };
    const order = await repo.create(draft());
    const res = await confirmPayment(repo, provider, { orderId: order.id, paymentKey: "pk_va" });
    expect(res.status).toBe(402);
    expect((await repo.get(order.id))?.status).toBe("CREATED");
  });
});
