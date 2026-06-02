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
  create(draft: OrderDraft): Promise<StoredOrder>;
  get(id: string): Promise<StoredOrder | undefined>;
  /**
   * Idempotent PAID transition (both the sync confirm and the async webhook call it):
   * unknown id → undefined; CREATED → set key + PAID; already PAID → no-op keeping the
   * FIRST key (defensive against replay; the schema's `tossPaymentKey @unique` forbids
   * overwrite anyway).
   */
  markPaid(id: string, paymentKey: string): Promise<StoredOrder | undefined>;
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
    async get(id) {
      return map.get(id);
    },
    async markPaid(id, paymentKey) {
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
  kind: "ENTRY";
  status: "CREATED";
  amountWon: number;
  qrVideoAddon: boolean;
  buyerName: string;
  buyerEmail: string;
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
    kind: "ENTRY",
    status: "CREATED",
    amountWon: draft.amountWon,
    qrVideoAddon: draft.qrVideoAddon,
    buyerName: draft.buyerName,
    buyerEmail: draft.buyerEmail,
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
  status: string;
  tossPaymentKey: string | null;
  amountWon: number;
  qrVideoAddon: boolean;
  buyerName: string;
  buyerEmail: string;
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

  return {
    id: row.id,
    status: row.status === "PAID" ? "PAID" : "CREATED", // app's binary status
    tossPaymentKey: row.tossPaymentKey,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString(),
    amountWon: row.amountWon,
    orderName: orderNameFrom(items.map((i) => i.templateLabel)),
    qrVideoAddon: row.qrVideoAddon,
    buyerName: row.buyerName,
    buyerEmail: row.buyerEmail,
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
  updateMany(args: { where: { id: string; status: "CREATED" }; data: { status: "PAID"; tossPaymentKey: string } }): Promise<{ count: number }>;
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
      const data = buildOrderCreateData(draft, randomUUID(), (k) => byKey.get(k));
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
      await (db.order as OrderDelegate).updateMany({
        where: { id, status: "CREATED" },
        data: { status: "PAID", tossPaymentKey: paymentKey },
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
