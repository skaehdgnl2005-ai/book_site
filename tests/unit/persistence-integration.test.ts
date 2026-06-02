/**
 * Live Supabase persistence integration — gated on DATABASE_URL, so `pnpm check` (no DB) SKIPS it
 * and CI stays hermetic (ADR-0002). Run it against a real database with:
 *   set -a; . .env.local; set +a; pnpm exec vitest run persistence-integration
 *
 * Proves the Prisma adapters round-trip AND survive a "restart" (a brand-new PrismaClient reads
 * the committed rows). Creates and then DELETES everything it touches (no DB pollution).
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb, type Db } from "../../src/lib/db";
import { createPrismaOrderRepo, type OrderDraft } from "../../src/app/api/payments/_lib/orders";
import { createPrismaFinishingStore } from "../../src/app/mypage/_lib/finishing";
import { createPrismaBackend, buildWrittenIntake, buildPhoneIntake } from "../../src/lib/customRequest";
import { storageConfig, putObject } from "../../src/lib/storage";

const hasDb = !!process.env.DATABASE_URL;
const hasStorage = !!storageConfig();
const fresh = (): Promise<Db> => getDb(undefined, {}); // a fresh store ⇒ brand-new client = simulated restart

const orderIds: string[] = [];
const customIds: string[] = [];

const orderDraft = (): OrderDraft => ({
  amountWon: 43000,
  orderName: "탄생",
  qrVideoAddon: false,
  buyerName: "통합검증",
  buyerEmail: "verify@example.com",
  items: [
    {
      templateKey: "birth",
      templateLabel: "탄생",
      coverType: "SOFT",
      unitPriceWon: 43000,
      personalization: { childName: "도윤", childGender: "MALE", extraVar: null },
      photo: null,
    },
  ],
});

describe.skipIf(!hasDb)("Supabase persistence integration", () => {
  it("order: create → restart get → idempotent markPaid persists", async () => {
    const repo = createPrismaOrderRepo(() => getDb());
    const created = await repo.create(orderDraft());
    orderIds.push(created.id);

    const afterRestart = await createPrismaOrderRepo(fresh).get(created.id);
    expect(afterRestart?.amountWon).toBe(43000);
    expect(afterRestart?.items[0].templateKey).toBe("birth");

    await repo.markPaid(created.id, "pk_int_1");
    await repo.markPaid(created.id, "pk_int_2");
    const paid = await createPrismaOrderRepo(fresh).get(created.id);
    expect(paid?.status).toBe("PAID");
    expect(paid?.tossPaymentKey).toBe("pk_int_1"); // idempotent: first key wins
  });

  it("finishing: dedication + photo descriptor survive a restart", async () => {
    const order = await createPrismaOrderRepo(() => getDb()).create(orderDraft());
    orderIds.push(order.id);

    const fin = createPrismaFinishingStore(() => getDb());
    await fin.setDedication(order.id, 0, "한 줄 헌정");
    await fin.setPhoto(order.id, 0, { storageKey: "child-photo/verify.jpg", contentType: "image/jpeg", byteSize: 42 });

    const after = await createPrismaFinishingStore(fresh).getItem(order.id, 0);
    expect(after.dedication).toBe("한 줄 헌정");
    expect(after.photo?.storageKey).toBe("child-photo/verify.jpg");
  });

  it("custom WRITTEN: PENDING_PAYMENT → markSubmitted → SUBMITTED, form round-trips", async () => {
    const custom = createPrismaBackend(() => getDb());
    const written = await custom.create(
      buildWrittenIntake({ contactName: "김부모", contactPhone: "010-1234-5678", answers: { protagonist: { name: "서연" } } }),
    );
    customIds.push(written.id);
    expect(written.status).toBe("PENDING_PAYMENT");

    await custom.markSubmitted(written.id);
    const after = await createPrismaBackend(fresh).get(written.id);
    expect(after?.status).toBe("SUBMITTED");
    expect(after?.form.groups.protagonist.name).toBe("서연");
  });

  it("custom PHONE: consultation REQUESTED, slot round-trips with no timezone shift", async () => {
    const custom = createPrismaBackend(() => getDb());
    const phone = await custom.create(buildPhoneIntake({ slot: "2026-06-10T14:00", name: "박부모", phone: "010-9999-0000", memo: "오후 선호" }));
    customIds.push(phone.id);

    const after = await createPrismaBackend(fresh).get(phone.id);
    expect(after?.consultation?.status).toBe("REQUESTED");
    expect(after?.consultation?.requestedSlot).toBe("2026-06-10T14:00"); // exact, tz-faithful
  });

  afterAll(async () => {
    if (!hasDb) return;
    type CleanupDb = {
      order: {
        findUnique(a: { where: { id: string }; include: unknown }): Promise<{ items: { id: string; personalization: { id: string; photoAssetId: string | null } | null }[] } | null>;
        delete(a: { where: { id: string } }): Promise<unknown>;
      };
      orderItem: { deleteMany(a: { where: { orderId: string } }): Promise<unknown> };
      personalization: { delete(a: { where: { id: string } }): Promise<unknown> };
      asset: { delete(a: { where: { id: string } }): Promise<unknown> };
      consultation: { deleteMany(a: { where: { customRequestId: string } }): Promise<unknown> };
      customRequest: { delete(a: { where: { id: string } }): Promise<unknown> };
      $disconnect(): Promise<void>;
    };
    const db = (await getDb()) as unknown as CleanupDb;
    for (const id of orderIds) {
      const full = await db.order.findUnique({ where: { id }, include: { items: { include: { personalization: true } } } });
      if (!full) continue;
      for (const it of full.items) {
        const photoAssetId = it.personalization?.photoAssetId ?? null;
        if (it.personalization) await db.personalization.delete({ where: { id: it.personalization.id } });
        if (photoAssetId) await db.asset.delete({ where: { id: photoAssetId } });
      }
      await db.orderItem.deleteMany({ where: { orderId: id } });
      await db.order.delete({ where: { id } });
    }
    for (const id of customIds) {
      await db.consultation.deleteMany({ where: { customRequestId: id } });
      await db.customRequest.delete({ where: { id } });
    }
    await db.$disconnect();
  });
});

// Gated on the SUPABASE_* storage config (separate from DATABASE_URL). Proves photo BYTES durably
// round-trip through Supabase Storage (eval S11). Uploads a tiny object, reads it back, deletes it.
describe.skipIf(!hasStorage)("Supabase Storage integration (eval S11)", () => {
  it("putObject stores bytes that round-trip from the private bucket, then cleans up", async () => {
    const cfg = storageConfig();
    if (!cfg) return;
    const key = `child-photo/itest-${randomUUID()}.jpg`;
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 250]);
    const auth = { Authorization: `Bearer ${cfg.serviceKey}` };
    const objectUrl = `${cfg.url}/storage/v1/object/${cfg.bucket}/${key}`;

    try {
      const res = await putObject(key, "image/jpeg", bytes);
      expect(res).toEqual({ stored: true });

      // Read it back via the Storage REST API (service_role) — proves the bytes are durably stored.
      const got = await fetch(objectUrl, { headers: auth });
      expect(got.ok).toBe(true);
      expect(Array.from(new Uint8Array(await got.arrayBuffer()))).toEqual([1, 2, 3, 4, 5, 250]);
    } finally {
      await fetch(objectUrl, { method: "DELETE", headers: auth });
    }
  });

  it("unconfigured putObject is a no-op (descriptor-only), independent of the live bucket", async () => {
    expect(await putObject("child-photo/x.jpg", "image/jpeg", new Uint8Array([1]), { config: null })).toEqual({ stored: false });
  });
});
