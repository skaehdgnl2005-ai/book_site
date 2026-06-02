/**
 * Checkout order store (TRACK-CHECKOUT, F012–F014) — hermetic in-memory repository.
 *
 * Mirrors the Prisma `Order`/`OrderItem`/`Personalization` models and the
 * `ProcessedWebhook` idempotency ledger, but keeps the verifiable path DB-free
 * (ADR-0002: `pnpm check` + Playwright run no Postgres). A production deploy swaps a
 * Prisma adapter behind the same `OrderRepo`/`WebhookLedger` surfaces — a documented
 * seam (parallels ADR-0012 D1's `customRequestStore`), not a silent skip. Hermetic
 * items key by `templateKey`; the Prisma adapter resolves `templateKey`→`Template.id`.
 *
 * Lives under `src/app/api/payments/_lib/` (a Next.js private folder, excluded from
 * routing) because the track grants the three app dirs + "import src/lib/cart +
 * src/lib/payments only" — no new `src/lib/*` file. Server-only (never imported by a
 * client component). `createOrderRepo()`/`createWebhookLedger()` are injection seams so
 * the domain is unit-testable without the globalThis singletons.
 */
export type CoverType = "SOFT" | "HARD";
export type Gender = "MALE" | "FEMALE";
export type ExtraVarValue = { kind: string; value: string } | null;

export type OrderItemDraft = {
  templateKey: string;
  templateLabel: string; // authoritative label (resolved server-side, display)
  coverType: CoverType;
  unitPriceWon: number; // authoritative (recomputed from Template price)
  personalization: { childName: string; childGender: Gender; extraVar: ExtraVarValue };
  photo: { storageKey: string; contentType: string; byteSize: number } | null;
};

export type OrderDraft = {
  amountWon: number; // authoritative total (server-recomputed)
  orderName: string; // PII-free product summary ("<label> 외 N건")
  qrVideoAddon: boolean;
  buyerName: string; // PII — never logged/traced
  buyerEmail: string; // PII — never logged/traced
  items: OrderItemDraft[];
};

export type OrderStatus = "CREATED" | "PAID";

export type StoredOrder = OrderDraft & {
  id: string; // our orderId == tossOrderId
  status: OrderStatus;
  tossPaymentKey: string | null;
  createdAt: string;
};

export interface OrderRepo {
  create(draft: OrderDraft): StoredOrder;
  get(id: string): StoredOrder | undefined;
  /**
   * Idempotent PAID transition (both the sync confirm and the async webhook call it):
   * unknown id → undefined; CREATED → set key + PAID; already PAID → no-op keeping the
   * FIRST key (defensive against replay; the schema's `tossPaymentKey @unique` forbids
   * overwrite anyway).
   */
  markPaid(id: string, paymentKey: string): StoredOrder | undefined;
}

export interface WebhookLedger {
  seen(id: string): boolean;
  record(id: string): void;
}

export function createOrderRepo(): OrderRepo {
  const map = new Map<string, StoredOrder>();
  let seq = 0;
  return {
    create(draft) {
      const id = `ord_${(++seq).toString(36).padStart(4, "0")}`;
      const order: StoredOrder = {
        ...draft,
        id,
        status: "CREATED",
        tossPaymentKey: null,
        createdAt: new Date().toISOString(),
      };
      map.set(id, order);
      return order;
    },
    get(id) {
      return map.get(id);
    },
    markPaid(id, paymentKey) {
      const order = map.get(id);
      if (!order) return undefined;
      if (order.status === "CREATED") {
        order.status = "PAID";
        order.tossPaymentKey = paymentKey;
      }
      return order;
    },
  };
}

export function createWebhookLedger(): WebhookLedger {
  const seen = new Set<string>();
  return {
    seen: (id) => seen.has(id),
    record: (id) => void seen.add(id),
  };
}

// ── globalThis-backed singletons for the route handlers (hermetic; Prisma seam in prod) ──
const g = globalThis as unknown as { __orderRepo?: OrderRepo; __webhookLedger?: WebhookLedger };

export function orderRepo(): OrderRepo {
  return (g.__orderRepo ??= createOrderRepo());
}

export function webhookLedger(): WebhookLedger {
  return (g.__webhookLedger ??= createWebhookLedger());
}
