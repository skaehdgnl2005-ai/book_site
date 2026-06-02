/**
 * Mypage finishing store (F017/F018) — per-OrderItem post-pay data, behind ONE async surface.
 *
 * Holds the finishing data keyed by (orderId, item index):
 *   - `{ photo descriptor, dedication }` → mirrors prisma `Personalization` (photoAsset + dedication)
 *
 * QR video is NOT collected here (option B / ADR-0016): the order carries only the `qrVideoAddon`
 * flag; the actual video is received backstage by the studio, never stored web-side.
 *
 * Two backends behind the same surface (parallels orders.ts):
 *   - In-memory (`createFinishingStore`) — hermetic path when no `DATABASE_URL` (pnpm check + E2E).
 *   - Prisma (`createPrismaFinishingStore`) — when `DATABASE_URL` is set; updates the `Personalization`
 *     row of the OrderItem at `position === index` (stable item addressing). Server-only.
 *
 * Stores only the access-controlled DESCRIPTOR (storageKey/contentType/byteSize) per F029/ADR-0011;
 * the durable object-storage of the bytes is handled in the upload path (src/lib/storage.ts).
 */
import type { Db } from "../../../lib/db";

export type Descriptor = { storageKey: string; contentType: string; byteSize: number };
export type ItemFinishing = { photo: Descriptor | null; dedication: string | null };

export interface FinishingStore {
  getItem(orderId: string, index: number): Promise<ItemFinishing>;
  setPhoto(orderId: string, index: number, photo: Descriptor): Promise<void>;
  setDedication(orderId: string, index: number, dedication: string): Promise<void>;
}

const EMPTY: ItemFinishing = { photo: null, dedication: null };

// ── In-memory backend (hermetic; used when no DATABASE_URL) ────────────────────
export function createFinishingStore(): FinishingStore {
  const items = new Map<string, Map<number, ItemFinishing>>(); // orderId -> (index -> finishing)

  const entry = (orderId: string, index: number): ItemFinishing => {
    let m = items.get(orderId);
    if (!m) {
      m = new Map();
      items.set(orderId, m);
    }
    let e = m.get(index);
    if (!e) {
      e = { photo: null, dedication: null };
      m.set(index, e);
    }
    return e;
  };

  return {
    async getItem(orderId, index) {
      const e = items.get(orderId)?.get(index);
      return e ? { ...e } : { ...EMPTY };
    },
    async setPhoto(orderId, index, photo) {
      entry(orderId, index).photo = photo;
    },
    async setDedication(orderId, index, dedication) {
      entry(orderId, index).dedication = dedication;
    },
  };
}

// ── Prisma backend (used when DATABASE_URL is set) ─────────────────────────────
type OrderItemDelegate = {
  findFirst(args: {
    where: { orderId: string; position: number };
    select: unknown;
  }): Promise<{
    id: string;
    personalization: {
      dedication: string | null;
      photoAsset: { storageKey: string; contentType: string; byteSize: number } | null;
    } | null;
  } | null>;
};
type AssetFields = { kind: "CHILD_PHOTO"; storageKey: string; contentType: string; byteSize: number };
type PersonalizationDelegate = {
  update(args: {
    where: { orderItemId: string };
    data: { dedication: string } | { photoAsset: { upsert: { create: AssetFields; update: AssetFields } } };
  }): Promise<unknown>;
};

const ITEM_SELECT = {
  id: true,
  personalization: {
    select: {
      dedication: true,
      photoAsset: { select: { storageKey: true, contentType: true, byteSize: true } },
    },
  },
} as const;

export function createPrismaFinishingStore(getDb: () => Promise<Db>): FinishingStore {
  return {
    async getItem(orderId, index) {
      const db = await getDb();
      const it = await (db.orderItem as OrderItemDelegate).findFirst({ where: { orderId, position: index }, select: ITEM_SELECT });
      const p = it?.personalization;
      return {
        photo: p?.photoAsset
          ? { storageKey: p.photoAsset.storageKey, contentType: p.photoAsset.contentType, byteSize: p.photoAsset.byteSize }
          : null,
        dedication: p?.dedication ?? null,
      };
    },
    async setDedication(orderId, index, dedication) {
      const db = await getDb();
      const it = await (db.orderItem as OrderItemDelegate).findFirst({ where: { orderId, position: index }, select: { id: true } });
      if (!it) return;
      await (db.personalization as PersonalizationDelegate).update({ where: { orderItemId: it.id }, data: { dedication } });
    },
    async setPhoto(orderId, index, photo) {
      const db = await getDb();
      const it = await (db.orderItem as OrderItemDelegate).findFirst({ where: { orderId, position: index }, select: { id: true } });
      if (!it) return;
      const asset: AssetFields = { kind: "CHILD_PHOTO", storageKey: photo.storageKey, contentType: photo.contentType, byteSize: photo.byteSize };
      // upsert (not create): a photo may already be attached (at checkout, or a re-upload), and the
      // photoAsset relation is one-to-one — a bare `create` would collide and throw. upsert overwrites
      // in place, matching the in-memory backend's overwrite semantics (no backend divergence).
      await (db.personalization as PersonalizationDelegate).update({
        where: { orderItemId: it.id },
        data: { photoAsset: { upsert: { create: asset, update: asset } } },
      });
    },
  };
}

// ── Factory: Prisma when DATABASE_URL is set, else in-memory (hermetic) ─────────
const g = globalThis as unknown as { __mypageFinishingMem?: FinishingStore; __mypageFinishingDb?: FinishingStore };
const getDbLazy = (): Promise<Db> => import("../../../lib/db").then((m) => m.getDb());

export function finishingStore(): FinishingStore {
  if (process.env.DATABASE_URL) return (g.__mypageFinishingDb ??= createPrismaFinishingStore(getDbLazy));
  return (g.__mypageFinishingMem ??= createFinishingStore());
}
