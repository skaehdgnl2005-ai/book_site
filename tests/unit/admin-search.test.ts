import { describe, it, expect } from "vitest";
import {
  createOrderRepo,
  createPrismaOrderRepo,
  type OrderDraft,
} from "../../src/app/api/payments/_lib/orders";

// F090 — search 술어: id 정확 OR 이름/이메일 부분(case-insensitive), trim, 교집합 — 양 백엔드 동형.

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

describe("OrderListFilter.search (F090, in-memory)", () => {
  it("id 정확 / 이름·이메일 부분(case-insensitive) / trim / 빈값 무시 / 교집합", async () => {
    const repo = createOrderRepo();
    const a = (await repo.create(draft({ buyerName: "김민준", buyerEmail: "MinJun@Example.com" }))).id;
    await repo.create(draft({ buyerName: "이서연", buyerEmail: "seoyeon@example.com" }));

    expect(await repo.count({ search: a })).toBe(1); // id 정확
    expect(await repo.count({ search: ` ${a} ` })).toBe(1); // trim
    expect(await repo.count({ search: "민준" })).toBe(1); // 이름 부분
    expect(await repo.count({ search: "minjun@" })).toBe(1); // 이메일 대소문자 무시
    expect(await repo.count({ search: "example.com" })).toBe(2);
    expect(await repo.count({ search: "없는사람" })).toBe(0);
    expect(await repo.count({ search: "" })).toBe(2); // 빈 검색 = 필터 없음
    expect(await repo.count({ search: "   " })).toBe(2);

    await repo.markPaid(a, "pk_a");
    expect(await repo.count({ search: "민준", status: "PAID" })).toBe(1); // 교집합
    expect(await repo.count({ search: "서연", status: "PAID" })).toBe(0);
  });
});

describe("OrderListFilter.search (F090, Prisma where 계약)", () => {
  function countFakeDb(calls: { count: unknown[] }) {
    const order = {
      async count(args: unknown) {
        calls.count.push(args);
        return 0;
      },
    };
    return async () => ({ order }) as never;
  }

  it("OR [id 정확, buyerName/buyerEmail contains insensitive]; 공백뿐이면 where에 부재", async () => {
    const calls = { count: [] as unknown[] };
    const repo = createPrismaOrderRepo(countFakeDb(calls));
    await repo.count({ search: " ord_x1 " });
    expect(calls.count[0]).toEqual({
      where: {
        OR: [
          { id: "ord_x1" },
          { buyerName: { contains: "ord_x1", mode: "insensitive" } },
          { buyerEmail: { contains: "ord_x1", mode: "insensitive" } },
        ],
      },
    });
    await repo.count({ search: "   " });
    expect(calls.count[1]).toEqual({ where: {} });
    await repo.count({ search: "부모", status: "PAID" }); // 교집합: status와 OR 공존
    expect(calls.count[2]).toEqual({
      where: {
        status: "PAID",
        OR: [
          { id: "부모" },
          { buyerName: { contains: "부모", mode: "insensitive" } },
          { buyerEmail: { contains: "부모", mode: "insensitive" } },
        ],
      },
    });
  });
});
