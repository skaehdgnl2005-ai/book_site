/**
 * Mypage finishing store (F017/F018) — hermetic, globalThis-backed, keyed by order.
 *
 * Holds the post-pay finishing data the checkout-owned `OrderRepo` has no place for (it exposes
 * only create/get/markPaid and is out of this track's touch-scope):
 *   - per `OrderItem` (by index): `{ photo descriptor, dedication }`  → mirrors prisma Personalization
 *   - per `Order`:                `{ qrVideo descriptor }`            → mirrors an Order Asset(kind=QR_VIDEO)
 *
 * Documented Prisma seam (parallels `api/payments/_lib/orders.ts` / ADR-0013): a production deploy
 * swaps a Prisma adapter behind this same surface. Server-only (never imported by a client
 * component). Stores only the access-controlled DESCRIPTOR (storageKey/contentType/byteSize), per
 * F009/ADR-0011 — durable object-storage of the bytes stays backstage. `createFinishingStore()` is
 * an injection seam; `finishingStore()` is the globalThis singleton the routes/actions use.
 */
export type Descriptor = { storageKey: string; contentType: string; byteSize: number };

export type ItemFinishing = { photo: Descriptor | null; dedication: string | null };

export interface FinishingStore {
  getItem(orderId: string, index: number): ItemFinishing;
  setPhoto(orderId: string, index: number, photo: Descriptor): void;
  setDedication(orderId: string, index: number, dedication: string): void;
  getQrVideo(orderId: string): Descriptor | null;
  setQrVideo(orderId: string, video: Descriptor): void;
}

export function createFinishingStore(): FinishingStore {
  const items = new Map<string, Map<number, ItemFinishing>>(); // orderId -> (index -> finishing)
  const qr = new Map<string, Descriptor>(); // orderId -> QR video descriptor

  const itemMap = (orderId: string): Map<number, ItemFinishing> => {
    let m = items.get(orderId);
    if (!m) {
      m = new Map();
      items.set(orderId, m);
    }
    return m;
  };
  const itemEntry = (orderId: string, index: number): ItemFinishing => {
    const m = itemMap(orderId);
    let e = m.get(index);
    if (!e) {
      e = { photo: null, dedication: null };
      m.set(index, e);
    }
    return e;
  };

  return {
    getItem(orderId, index) {
      const e = items.get(orderId)?.get(index);
      return e ? { ...e } : { photo: null, dedication: null };
    },
    setPhoto(orderId, index, photo) {
      itemEntry(orderId, index).photo = photo;
    },
    setDedication(orderId, index, dedication) {
      itemEntry(orderId, index).dedication = dedication;
    },
    getQrVideo(orderId) {
      return qr.get(orderId) ?? null;
    },
    setQrVideo(orderId, video) {
      qr.set(orderId, video);
    },
  };
}

const g = globalThis as unknown as { __mypageFinishing?: FinishingStore };

export function finishingStore(): FinishingStore {
  return (g.__mypageFinishing ??= createFinishingStore());
}
