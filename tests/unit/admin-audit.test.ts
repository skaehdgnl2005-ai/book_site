import { describe, it, expect } from "vitest";
import {
  createAuditStore,
  createPrismaAuditStore,
  buildAuditCreateData,
  mapAuditRow,
  type AuditEntry,
  type AuditRow,
  type AuditCreateData,
} from "../../src/app/admin/_lib/auditLog";
import type { Db } from "../../src/lib/db";

// F073 — 관리자 감사 로그: in-memory 저장소(append·최신순) + Prisma 매핑. ADR-0024 D2 준수를 위해
// 저장 항목에는 상태 문자열·식별자만 담긴다(호출부가 PII를 넘기지 않음 — 여기서는 형태/저장/정렬 검증).

const entry: AuditEntry = {
  actorUserId: "usr_admin1",
  action: "order.advance",
  targetType: "order",
  targetId: "ord_1",
  before: "PAID",
  after: "IN_PRODUCTION",
};

describe("createAuditStore (F073, in-memory)", () => {
  it("records an entry with an id + createdAt and returns it", async () => {
    const store = createAuditStore();
    const stored = await store.record(entry);
    expect(stored.id).toMatch(/^aud_/);
    expect(stored.createdAt).toEqual(expect.any(String));
    expect(stored.actorUserId).toBe("usr_admin1");
    expect(stored.action).toBe("order.advance");
    expect(stored.before).toBe("PAID");
    expect(stored.after).toBe("IN_PRODUCTION");
  });

  it("defaults missing before/after to null (not undefined)", async () => {
    const store = createAuditStore();
    const stored = await store.record({
      actorUserId: "usr_a",
      action: "consultation.confirm",
      targetType: "consultation",
      targetId: "cr_1",
    });
    expect(stored.before).toBeNull();
    expect(stored.after).toBeNull();
  });

  it("listRecent returns newest-first and honors take", async () => {
    const store = createAuditStore();
    await store.record({ ...entry, targetId: "ord_1" });
    await store.record({ ...entry, targetId: "ord_2" });
    await store.record({ ...entry, targetId: "ord_3" });
    const all = await store.listRecent();
    expect(all.map((e) => e.targetId)).toEqual(["ord_3", "ord_2", "ord_1"]);
    const one = await store.listRecent({ take: 1 });
    expect(one.map((e) => e.targetId)).toEqual(["ord_3"]);
  });
});

describe("buildAuditCreateData (F073, pure mapping)", () => {
  it("passes fields through and null-defaults before/after", () => {
    expect(buildAuditCreateData(entry)).toEqual<AuditCreateData>({
      actorUserId: "usr_admin1",
      action: "order.advance",
      targetType: "order",
      targetId: "ord_1",
      before: "PAID",
      after: "IN_PRODUCTION",
    });
    const minimal = buildAuditCreateData({
      actorUserId: "usr_a",
      action: "custom.move",
      targetType: "customRequest",
      targetId: "cr_9",
    });
    expect(minimal.before).toBeNull();
    expect(minimal.after).toBeNull();
  });
});

describe("mapAuditRow (F073, Date ↔ ISO)", () => {
  it("normalizes a Date createdAt to an ISO string", () => {
    const row: AuditRow = {
      id: "aud_1",
      actorUserId: "usr_a",
      action: "order.refund",
      targetType: "order",
      targetId: "ord_7",
      before: "PAID",
      after: "REFUNDED",
      createdAt: new Date("2026-07-20T10:00:00.000Z"),
    };
    expect(mapAuditRow(row).createdAt).toBe("2026-07-20T10:00:00.000Z");
  });

  it("passes a string createdAt through unchanged", () => {
    const row: AuditRow = {
      id: "aud_2",
      actorUserId: "usr_a",
      action: "custom.move",
      targetType: "customRequest",
      targetId: "cr_2",
      before: null,
      after: "COMPLETED",
      createdAt: "2026-07-20T11:00:00.000Z",
    };
    expect(mapAuditRow(row).createdAt).toBe("2026-07-20T11:00:00.000Z");
  });
});

describe("createPrismaAuditStore (F073, fake delegate)", () => {
  function fakeDb(rows: AuditRow[]) {
    const created: AuditCreateData[] = [];
    const db = {
      adminAuditLog: {
        async create({ data }: { data: AuditCreateData }): Promise<AuditRow> {
          created.push(data);
          return { id: `aud_${rows.length + created.length}`, ...data, createdAt: new Date("2026-07-20T12:00:00.000Z") };
        },
        async findMany({ take }: { take?: number }): Promise<AuditRow[]> {
          return rows.slice(0, take ?? rows.length);
        },
      },
    } as unknown as Db;
    return { db, created };
  }

  it("record() writes buildAuditCreateData and maps the row back", async () => {
    const { db, created } = fakeDb([]);
    const store = createPrismaAuditStore(async () => db);
    const stored = await store.record(entry);
    expect(created).toHaveLength(1);
    expect(created[0]).toEqual(buildAuditCreateData(entry));
    expect(stored.targetId).toBe("ord_1");
    expect(stored.createdAt).toBe("2026-07-20T12:00:00.000Z");
  });

  it("listRecent() maps every row via mapAuditRow", async () => {
    const rows: AuditRow[] = [
      {
        id: "aud_a",
        actorUserId: "usr_a",
        action: "order.advance",
        targetType: "order",
        targetId: "ord_a",
        before: "PAID",
        after: "IN_PRODUCTION",
        createdAt: new Date("2026-07-20T09:00:00.000Z"),
      },
    ];
    const { db } = fakeDb(rows);
    const store = createPrismaAuditStore(async () => db);
    const out = await store.listRecent({ take: 10 });
    expect(out).toHaveLength(1);
    expect(out[0].createdAt).toBe("2026-07-20T09:00:00.000Z");
  });
});
