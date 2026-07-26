import { describe, it, expect } from "vitest";
import {
  createOrderRepo,
  createPrismaOrderRepo,
  type OrderDraft,
} from "../../src/app/api/payments/_lib/orders";
import { buildQuery, parsePage } from "../../src/app/admin/orders/_lib/query";

// F088 — 오프셋 페이지네이션: in-memory 슬라이스는 집합 의미론(동일 ms createdAt은 정렬 비결정 —
// 순서 단언 금지), Prisma는 skip>0일 때만 wire(기존 findMany args 무회귀).

function draft(over: Partial<OrderDraft> = {}): OrderDraft {
  return {
    amountWon: 43000,
    orderName: "탄생",
    qrVideoAddon: false,
    buyerName: "김부모",
    buyerEmail: "parent@example.com",
    items: [],
    ...over,
  };
}

describe("listRecent skip (F088, in-memory)", () => {
  it("페이지는 서로소이고 합집합이 전량 — take/skip 슬라이스", async () => {
    const repo = createOrderRepo();
    for (let i = 0; i < 5; i++) await repo.create(draft());
    const p1 = await repo.listRecent({ take: 2 });
    const p2 = await repo.listRecent({ take: 2, skip: 2 });
    const p3 = await repo.listRecent({ take: 2, skip: 4 });
    expect(p1).toHaveLength(2);
    expect(p2).toHaveLength(2);
    expect(p3).toHaveLength(1);
    expect(new Set([...p1, ...p2, ...p3].map((o) => o.id)).size).toBe(5);
    expect(await repo.listRecent({ take: 2, skip: 10 })).toEqual([]);
  });

  it("skip은 필터와 조합 — 필터된 집합 위의 슬라이스", async () => {
    const repo = createOrderRepo();
    for (let i = 0; i < 3; i++) {
      const id = (await repo.create(draft())).id;
      await repo.markPaid(id, `pk_${i}`);
    }
    await repo.create(draft()); // CREATED — PAID 슬라이스에서 제외
    expect(await repo.listRecent({ status: "PAID", take: 2, skip: 2 })).toHaveLength(1);
  });
});

describe("listRecent skip (F088, Prisma wire 계약)", () => {
  function listFakeDb(calls: { findMany: unknown[] }) {
    const order = {
      async findMany(args: unknown) {
        calls.findMany.push(args);
        return [];
      },
    };
    return async () => ({ order }) as never;
  }

  it("skip 미지정/0이면 args에 skip 부재(기존 wire 무회귀), skip>0이면 전달", async () => {
    const calls = { findMany: [] as unknown[] };
    const repo = createPrismaOrderRepo(listFakeDb(calls));
    await repo.listRecent({ take: 50 });
    expect(calls.findMany[0]).not.toHaveProperty("skip");
    await repo.listRecent({ take: 50, skip: 100 });
    expect(calls.findMany[1]).toMatchObject({ take: 50, skip: 100 });
  });
});

describe("parsePage / buildQuery (F088)", () => {
  it("parsePage: 1-기반, 비정수·0·음수·잡문자는 1", () => {
    expect(parsePage("2")).toBe(2);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("1.5")).toBe(1);
  });
  it("buildQuery: 값 있는 키만 직렬화", () => {
    expect(buildQuery({ status: "PAID", page: "2", q: undefined })).toBe("?status=PAID&page=2");
    expect(buildQuery({})).toBe("");
  });
});
