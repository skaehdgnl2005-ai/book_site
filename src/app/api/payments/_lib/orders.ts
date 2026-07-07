/**
 * Checkout order store (TRACK-CHECKOUT, F012–F014).
 *
 * Two backends behind ONE async surface (`OrderRepo`/`WebhookLedger`):
 *   - **In-memory** (`createOrderRepo`/`createWebhookLedger`) — the hermetic path used by
 *     `pnpm check` + Playwright when no `DATABASE_URL` is configured (ADR-0002: the verify
 *     gate runs no Postgres).
 *   - **Prisma** (`createPrismaOrderRepo`/`createPrismaWebhookLedger`) — used whenever
 *     `DATABASE_URL` is set, persisting to the `Order`/`OrderItem`/`Personalization`/`Asset`
 *     tables + the `ProcessedWebhook` idempotency ledger so orders survive a restart.
 *
 * SAFETY (writes ≠ reads): unlike the catalog read path, the factory does NOT silently
 * fall back to in-memory on a DB error — that would create an order that vanishes on
 * restart. With `DATABASE_URL` set we use Prisma and let errors propagate; in-memory is
 * used ONLY when no DB is configured.
 *
 * The pure mapping helpers (`buildOrderCreateData`/`mapOrderRow`) carry the real logic and
 * are unit-tested (orders-prisma.test.ts) without a DB. The thin Prisma orchestration is
 * integration-verified against a live database (eval S10 + E2E). Server-only.
 */
import { randomUUID } from "node:crypto";
import type { Db } from "../../../../lib/db";
import { toOrderStatus } from "./status";

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

export type OrderKind = "ENTRY" | "CUSTOM";

export type OrderDraft = {
  /** Optional explicit id (F052 — a CUSTOM order uses id = CustomRequest.id = tossOrderId). */
  id?: string;
  /** ENTRY (default) or CUSTOM (맞춤 제작 — zero items; the request itself is the product). */
  kind?: OrderKind;
  amountWon: number; // authoritative total (server-recomputed)
  orderName: string; // PII-free product summary ("<label> 외 N건")
  qrVideoAddon: boolean;
  buyerName: string; // PII — never logged/traced
  buyerEmail: string; // PII — never logged/traced
  // F053 — shipping destination (PII — never logged/traced). Required on ENTRY drafts by
  // buildOrderDraft; absent on CUSTOM drafts (recipient lives in the 의뢰서 free text).
  shipName?: string;
  shipPhone?: string;
  shipZip?: string;
  shipAddress?: string;
  /** F057 — owning member (set at create for a signed-in buyer; claimed later for guests). */
  userId?: string;
  /** F060 — shipment record (admin-entered at the SHIPPED transition). */
  trackingCarrier?: string;
  trackingNumber?: string;
  items: OrderItemDraft[];
};

// F054 — the full status machine (mirrors the Prisma enum reserved at F004). Vocabulary,
// transition table, and labels live in ./status; this module only stores/moves the value.
export type OrderStatus =
  | "CREATED"
  | "PAID"
  | "IN_PRODUCTION"
  | "SHIPPED"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";

export type StoredOrder = OrderDraft & {
  id: string; // our orderId == tossOrderId
  kind: OrderKind;
  status: OrderStatus;
  tossPaymentKey: string | null;
  createdAt: string;
};

export interface OrderRepo {
  create(draft: OrderDraft): Promise<StoredOrder>;
  get(id: string): Promise<StoredOrder | undefined>;
  /**
   * Idempotent PAID transition (both the sync confirm and the async webhook call it):
   * unknown id → order undefined; CREATED → set key + PAID; already settled → no-op keeping
   * the FIRST key (defensive against replay; the schema's `tossPaymentKey @unique` forbids
   * overwrite anyway). `transitioned` is true ONLY for the single call that actually moved
   * CREATED→PAID — the atomic conditional write is the truth source for exactly-once effects
   * (F055: the confirmation email fires exactly once even when confirm and webhook race).
   */
  markPaid(id: string, paymentKey: string): Promise<{ order: StoredOrder | undefined; transitioned: boolean }>;
  /**
   * F054 — conditional status transition: applies only while the current status is in `from`
   * (updateMany-style conditional write — two admins double-clicking apply exactly once).
   * Callers gate the PAIR against `canTransition` (./status); this method enforces atomicity.
   */
  transition(id: string, from: readonly OrderStatus[], to: OrderStatus): Promise<{ ok: boolean }>;
  /**
   * F057 — retroactively claim guest orders for a member whose EMAIL OWNERSHIP was just proven
   * (login OTP / verified Kakao email). Case-insensitive on buyerEmail; only unclaimed rows
   * (userId null) take the link — idempotent, and an order never silently changes owners.
   */
  claimByEmail(email: string, userId: string): Promise<{ count: number }>;
  /** F057 — the member's orders, newest first. */
  listByUser(userId: string): Promise<StoredOrder[]>;
  /** F059 — admin listing: newest first, optional status filter, bounded take (default 50). */
  listRecent(opts?: { status?: OrderStatus; take?: number }): Promise<StoredOrder[]>;
  /** F060 — record the shipment (carrier + tracking number) ahead of the SHIPPED transition. */
  setTracking(id: string, carrier: string, trackingNumber: string): Promise<StoredOrder | undefined>;
}

export interface WebhookLedger {
  seen(id: string): Promise<boolean>;
  record(id: string): Promise<void>;
}

// ── In-memory backend (hermetic; used when no DATABASE_URL) ────────────────────
export function createOrderRepo(): OrderRepo {
  const map = new Map<string, StoredOrder>();
  let seq = 0;
  return {
    async create(draft) {
      const id = draft.id ?? `ord_${(++seq).toString(36).padStart(4, "0")}`;
      const order: StoredOrder = {
        ...draft,
        id,
        kind: draft.kind ?? "ENTRY",
        status: "CREATED",
        tossPaymentKey: null,
        createdAt: new Date().toISOString(),
      };
      map.set(id, order);
      return order;
    },
    async get(id) {
      return map.get(id);
    },
    async markPaid(id, paymentKey) {
      const order = map.get(id);
      if (!order) return { order: undefined, transitioned: false };
      if (order.status !== "CREATED") return { order, transitioned: false };
      order.status = "PAID";
      order.tossPaymentKey = paymentKey;
      return { order, transitioned: true };
    },
    async transition(id, from, to) {
      const order = map.get(id);
      if (!order || !from.includes(order.status)) return { ok: false };
      order.status = to;
      return { ok: true };
    },
    async claimByEmail(email, userId) {
      const norm = email.trim().toLowerCase();
      let count = 0;
      for (const order of map.values()) {
        if (order.userId == null && order.buyerEmail.trim().toLowerCase() === norm) {
          order.userId = userId;
          count += 1;
        }
      }
      return { count };
    },
    async listByUser(userId) {
      return [...map.values()]
        .filter((o) => o.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async listRecent(opts = {}) {
      const take = opts.take ?? 50;
      return [...map.values()]
        .filter((o) => (opts.status ? o.status === opts.status : true))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, take);
    },
    async setTracking(id, carrier, trackingNumber) {
      const order = map.get(id);
      if (!order) return undefined;
      order.trackingCarrier = carrier;
      order.trackingNumber = trackingNumber;
      return order;
    },
  };
}

export function createWebhookLedger(): WebhookLedger {
  const seenIds = new Set<string>();
  return {
    async seen(id) {
      return seenIds.has(id);
    },
    async record(id) {
      seenIds.add(id);
    },
  };
}

// ── Pure mapping: domain ↔ Prisma (no DB, no @prisma/client) — unit-tested ──────

/** A nested `Asset { create }` for a child photo (only present when a photo exists). */
type AssetCreate = { kind: "CHILD_PHOTO"; storageKey: string; contentType: string; byteSize: number };
type PersonalizationCreate = {
  childName: string;
  childGender: Gender;
  extraVar: ExtraVarValue; // stored as Json
  photoAsset?: { create: AssetCreate };
};
type OrderItemCreate = {
  templateId: string;
  coverType: CoverType;
  unitPriceWon: number;
  position: number; // 0-based index within the order (stable addressing for mypage finishing)
  personalization: { create: PersonalizationCreate };
};

/** The `prisma.order.create({ data })` input we build from a draft (structural; no client coupling). */
export type OrderCreateData = {
  id: string;
  tossOrderId: string;
  kind: OrderKind;
  status: "CREATED";
  amountWon: number;
  qrVideoAddon: boolean;
  buyerName: string;
  buyerEmail: string;
  shipName: string | null;
  shipPhone: string | null;
  shipZip: string | null;
  shipAddress: string | null;
  userId: string | null;
  items: { create: OrderItemCreate[] };
};

/**
 * Build the Prisma create input from a server-authoritative draft. `id` is provided by
 * the caller so `Order.id === tossOrderId === our public order id`. Throws if a
 * templateKey cannot be resolved to a Template.id (an integrity error — the draft was
 * already validated against the same catalogue, so this must never happen silently).
 */
export function buildOrderCreateData(
  draft: OrderDraft,
  id: string,
  templateId: (key: string) => string | undefined,
): OrderCreateData {
  const items = draft.items.map((it, index): OrderItemCreate => {
    const tid = templateId(it.templateKey);
    if (!tid) throw new Error(`Cannot resolve templateId for key "${it.templateKey}".`);
    const personalization: PersonalizationCreate = {
      childName: it.personalization.childName,
      childGender: it.personalization.childGender,
      extraVar: it.personalization.extraVar,
    };
    if (it.photo) {
      personalization.photoAsset = {
        create: {
          kind: "CHILD_PHOTO",
          storageKey: it.photo.storageKey,
          contentType: it.photo.contentType,
          byteSize: it.photo.byteSize,
        },
      };
    }
    return {
      templateId: tid,
      coverType: it.coverType,
      unitPriceWon: it.unitPriceWon,
      position: index,
      personalization: { create: personalization },
    };
  });

  return {
    id,
    tossOrderId: id,
    kind: draft.kind ?? "ENTRY",
    status: "CREATED",
    amountWon: draft.amountWon,
    qrVideoAddon: draft.qrVideoAddon,
    buyerName: draft.buyerName,
    buyerEmail: draft.buyerEmail,
    shipName: draft.shipName ?? null,
    shipPhone: draft.shipPhone ?? null,
    shipZip: draft.shipZip ?? null,
    shipAddress: draft.shipAddress ?? null,
    userId: draft.userId ?? null,
    items: { create: items },
  };
}

/** A Prisma `Order` row with the includes `mapOrderRow` reads (structural). */
export type OrderRowItem = {
  coverType: CoverType;
  unitPriceWon: number;
  template: { key: string; label: string };
  personalization: {
    childName: string;
    childGender: Gender;
    extraVar: unknown;
    photoAsset: { storageKey: string; contentType: string; byteSize: number } | null;
  } | null;
};
export type OrderRow = {
  id: string;
  kind?: string; // scalar included by default; optional so pre-F052 fixtures still type-check
  status: string;
  tossPaymentKey: string | null;
  amountWon: number;
  qrVideoAddon: boolean;
  buyerName: string;
  buyerEmail: string;
  shipName?: string | null;
  shipPhone?: string | null;
  shipZip?: string | null;
  shipAddress?: string | null;
  userId?: string | null;
  trackingCarrier?: string | null;
  trackingNumber?: string | null;
  createdAt: Date | string;
  items: OrderRowItem[];
};

function parseExtraVar(v: unknown): ExtraVarValue {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.kind === "string" && typeof o.value === "string") return { kind: o.kind, value: o.value };
  }
  return null;
}

/** PII-free product summary, recomputed from item labels (never buyer/child names). */
function orderNameFrom(labels: string[]): string {
  if (labels.length === 0) return "";
  return labels.length === 1 ? labels[0] : `${labels[0]} 외 ${labels.length - 1}건`;
}

// A CUSTOM order has zero items to recompute a name from — fixed, PII-free product name (F052).
// String literal (not an import from lib/customRequest) to keep this module's import graph flat.
const CUSTOM_ORDER_NAME = "맞춤 제작 그림책";

/** Map a persisted Order row (with includes) back to the app's `StoredOrder`. */
export function mapOrderRow(row: OrderRow): StoredOrder {
  const items: OrderItemDraft[] = row.items.map((it) => ({
    templateKey: it.template.key,
    templateLabel: it.template.label,
    coverType: it.coverType,
    unitPriceWon: it.unitPriceWon,
    personalization: {
      childName: it.personalization?.childName ?? "",
      childGender: it.personalization?.childGender ?? "MALE",
      extraVar: parseExtraVar(it.personalization?.extraVar),
    },
    photo: it.personalization?.photoAsset
      ? {
          storageKey: it.personalization.photoAsset.storageKey,
          contentType: it.personalization.photoAsset.contentType,
          byteSize: it.personalization.photoAsset.byteSize,
        }
      : null,
  }));

  const kind: OrderKind = row.kind === "CUSTOM" ? "CUSTOM" : "ENTRY";
  return {
    id: row.id,
    kind,
    status: toOrderStatus(row.status), // F054: full machine passthrough (junk → CREATED)
    tossPaymentKey: row.tossPaymentKey,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString(),
    amountWon: row.amountWon,
    orderName: items.length > 0 ? orderNameFrom(items.map((i) => i.templateLabel)) : kind === "CUSTOM" ? CUSTOM_ORDER_NAME : "",
    qrVideoAddon: row.qrVideoAddon,
    buyerName: row.buyerName,
    buyerEmail: row.buyerEmail,
    shipName: row.shipName ?? undefined,
    shipPhone: row.shipPhone ?? undefined,
    shipZip: row.shipZip ?? undefined,
    shipAddress: row.shipAddress ?? undefined,
    userId: row.userId ?? undefined,
    trackingCarrier: row.trackingCarrier ?? undefined,
    trackingNumber: row.trackingNumber ?? undefined,
    items,
  };
}

// ── Prisma backend (used when DATABASE_URL is set) ─────────────────────────────

// Minimal Prisma delegate surfaces we depend on — a generated client satisfies them.
type TemplateDelegate = {
  findMany(args: { where: { key: { in: string[] } }; select: { id: true; key: true } }): Promise<Array<{ id: string; key: string }>>;
};
type OrderDelegate = {
  create(args: { data: OrderCreateData; include: unknown }): Promise<OrderRow>;
  findUnique(args: { where: { id: string }; include: unknown }): Promise<OrderRow | null>;
  findMany(args: {
    where: { userId: string } | { status?: OrderStatus };
    orderBy: { createdAt: "desc" };
    take?: number;
    include: unknown;
  }): Promise<OrderRow[]>;
  updateMany(args: {
    where:
      | { id: string; status?: "CREATED" | { in: OrderStatus[] } }
      | { buyerEmail: { equals: string; mode: "insensitive" }; userId: null };
    data: {
      status?: OrderStatus;
      tossPaymentKey?: string;
      userId?: string;
      trackingCarrier?: string;
      trackingNumber?: string;
    };
  }): Promise<{ count: number }>;
};
type ProcessedWebhookDelegate = {
  findUnique(args: { where: { id: string } }): Promise<{ id: string } | null>;
  create(args: { data: { id: string } }): Promise<{ id: string }>;
};

const ORDER_INCLUDE = {
  items: { orderBy: { position: "asc" }, include: { template: true, personalization: { include: { photoAsset: true } } } },
} as const;

export function createPrismaOrderRepo(getDb: () => Promise<Db>): OrderRepo {
  return {
    async create(draft) {
      const db = await getDb();
      const keys = [...new Set(draft.items.map((i) => i.templateKey))];
      const tpls = await (db.template as TemplateDelegate).findMany({
        where: { key: { in: keys } },
        select: { id: true, key: true },
      });
      const byKey = new Map(tpls.map((t) => [t.key, t.id]));
      const data = buildOrderCreateData(draft, draft.id ?? randomUUID(), (k) => byKey.get(k));
      const row = await (db.order as OrderDelegate).create({ data, include: ORDER_INCLUDE });
      return mapOrderRow(row);
    },
    async get(id) {
      const db = await getDb();
      const row = await (db.order as OrderDelegate).findUnique({ where: { id }, include: ORDER_INCLUDE });
      return row ? mapOrderRow(row) : undefined;
    },
    async markPaid(id, paymentKey) {
      const db = await getDb();
      // Idempotent: only a CREATED order transitions; an already-PAID order is untouched
      // (count:0), preserving the first paymentKey. The DB row is then re-read + mapped.
      // count===1 ⟺ THIS call made the transition (the atomic exactly-once signal, F055).
      const res = await (db.order as OrderDelegate).updateMany({
        where: { id, status: "CREATED" },
        data: { status: "PAID", tossPaymentKey: paymentKey },
      });
      const row = await (db.order as OrderDelegate).findUnique({ where: { id }, include: ORDER_INCLUDE });
      return { order: row ? mapOrderRow(row) : undefined, transitioned: res.count === 1 };
    },
    async transition(id, from, to) {
      const db = await getDb();
      const res = await (db.order as OrderDelegate).updateMany({
        where: { id, status: { in: [...from] } },
        data: { status: to },
      });
      return { ok: res.count === 1 };
    },
    async claimByEmail(email, userId) {
      const db = await getDb();
      // Conditional write: only unclaimed rows with the (case-insensitively) matching buyer
      // email take the link — idempotent across repeated logins.
      const res = await (db.order as OrderDelegate).updateMany({
        where: { buyerEmail: { equals: email.trim().toLowerCase(), mode: "insensitive" }, userId: null },
        data: { userId },
      });
      return { count: res.count };
    },
    async listByUser(userId) {
      const db = await getDb();
      const rows = await (db.order as OrderDelegate).findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: ORDER_INCLUDE,
      });
      return rows.map(mapOrderRow);
    },
    async listRecent(opts = {}) {
      const db = await getDb();
      const rows = await (db.order as OrderDelegate).findMany({
        where: opts.status ? { status: opts.status } : {},
        orderBy: { createdAt: "desc" },
        take: opts.take ?? 50,
        include: ORDER_INCLUDE,
      });
      return rows.map(mapOrderRow);
    },
    async setTracking(id, carrier, trackingNumber) {
      const db = await getDb();
      await (db.order as OrderDelegate).updateMany({
        where: { id },
        data: { trackingCarrier: carrier, trackingNumber },
      });
      const row = await (db.order as OrderDelegate).findUnique({ where: { id }, include: ORDER_INCLUDE });
      return row ? mapOrderRow(row) : undefined;
    },
  };
}

export function createPrismaWebhookLedger(getDb: () => Promise<Db>): WebhookLedger {
  return {
    async seen(id) {
      const db = await getDb();
      return (await (db.processedWebhook as ProcessedWebhookDelegate).findUnique({ where: { id } })) !== null;
    },
    async record(id) {
      const db = await getDb();
      try {
        await (db.processedWebhook as ProcessedWebhookDelegate).create({ data: { id } });
      } catch {
        // Unique-constraint violation on a concurrent redelivery — the row already exists,
        // which is exactly the recorded-state we want. Swallow (the @id is the atomic gate).
      }
    },
  };
}

// ── Factory: Prisma when DATABASE_URL is set, else in-memory (hermetic) ─────────
const g = globalThis as unknown as {
  __orderRepoMem?: OrderRepo;
  __webhookLedgerMem?: WebhookLedger;
  __orderRepoDb?: OrderRepo;
  __webhookLedgerDb?: WebhookLedger;
};

// Lazy, server-only DB getter: the dynamic import keeps @prisma/client out of the
// hermetic render/verify path (only evaluated when DATABASE_URL is set). Relative path
// (not @/) so this module resolves under vitest too — though this branch never runs there.
const getDbLazy = (): Promise<Db> => import("../../../../lib/db").then((m) => m.getDb());

export function orderRepo(): OrderRepo {
  if (process.env.DATABASE_URL) return (g.__orderRepoDb ??= createPrismaOrderRepo(getDbLazy));
  return (g.__orderRepoMem ??= createOrderRepo());
}

export function webhookLedger(): WebhookLedger {
  if (process.env.DATABASE_URL) return (g.__webhookLedgerDb ??= createPrismaWebhookLedger(getDbLazy));
  return (g.__webhookLedgerMem ??= createWebhookLedger());
}
