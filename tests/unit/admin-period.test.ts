import { describe, it, expect } from "vitest";
import { resolvePeriod, PERIOD_PRESETS } from "../../src/app/admin/orders/_lib/period";
import {
  createOrderRepo,
  createPrismaOrderRepo,
  type OrderDraft,
} from "../../src/app/api/payments/_lib/orders";

// F089 — 기간 해석은 이 순수 함수 하나가 유닛으로 고정 (F083 todayOrdersFilter 패턴:
// 조각이 아니라 페이지가 소비하는 조합 자체를 고정).

const NOW = Date.parse("2026-07-23T02:00:00.000Z"); // KST 2026-07-23 11:00

describe("resolvePeriod (F089)", () => {
  it("프리셋 4종 — KST 경계, 상한 없는 열린 구간", () => {
    expect(resolvePeriod({ range: "today" }, NOW)).toEqual({ createdFrom: "2026-07-22T15:00:00.000Z" });
    expect(resolvePeriod({ range: "7d" }, NOW)).toEqual({ createdFrom: "2026-07-16T15:00:00.000Z" }); // 오늘 포함 7일
    expect(resolvePeriod({ range: "30d" }, NOW)).toEqual({ createdFrom: "2026-06-23T15:00:00.000Z" });
    expect(resolvePeriod({ range: "month" }, NOW)).toEqual({ createdFrom: "2026-06-30T15:00:00.000Z" });
  });
  it("from/to — 종료일 포함(익일 00:00 배타 상한); range 동시 존재 시 range 우선", () => {
    expect(resolvePeriod({ from: "2026-07-01", to: "2026-07-23" }, NOW)).toEqual({
      createdFrom: "2026-06-30T15:00:00.000Z",
      createdTo: "2026-07-23T15:00:00.000Z",
    });
    expect(resolvePeriod({ from: "2026-07-01" }, NOW)).toEqual({ createdFrom: "2026-06-30T15:00:00.000Z" });
    expect(resolvePeriod({ range: "today", from: "2026-07-01", to: "2026-07-23" }, NOW)).toEqual({
      createdFrom: "2026-07-22T15:00:00.000Z",
    });
  });
  it("불량 입력 무시 — 형식 불일치·역전은 빈 기간, 미지의 range는 from/to로 폴스루", () => {
    expect(resolvePeriod({ from: "07/01/2026" }, NOW)).toEqual({});
    expect(resolvePeriod({ from: "2026-07-23", to: "2026-07-01" }, NOW)).toEqual({}); // 역전
    expect(resolvePeriod({ range: "junk", from: "2026-07-01" }, NOW)).toEqual({
      createdFrom: "2026-06-30T15:00:00.000Z",
    });
    expect(resolvePeriod({}, NOW)).toEqual({});
  });
  it("PERIOD_PRESETS — UI가 도는 어휘 그대로", () => {
    expect(PERIOD_PRESETS.map((p) => p.key)).toEqual(["today", "7d", "30d", "month"]);
  });
});

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

function countFakeDb(calls: { count: unknown[] }, result = 0) {
  const order = {
    async count(args: unknown) {
      calls.count.push(args);
      return result;
    },
  };
  return async () => ({ order }) as never;
}

describe("OrderListFilter.createdTo (F089 — 배타 상한, 양 백엔드)", () => {
  it("in-memory: createdAt < createdTo; createdFrom과 반개구간; 깨진 값은 fail-loud", async () => {
    const repo = createOrderRepo();
    const id = (await repo.create(draft())).id;
    const created = (await repo.get(id))!.createdAt;
    const next = new Date(Date.parse(created) + 1).toISOString();
    expect(await repo.count({ createdTo: next })).toBe(1);
    expect(await repo.count({ createdTo: created })).toBe(0); // 배타
    expect(await repo.count({ createdFrom: created, createdTo: next })).toBe(1);
    await expect(repo.count({ createdTo: "junk" })).rejects.toThrow(); // parseInstant 동형
  });
  it("Prisma where: createdAt { gte, lt } — 단독 gte는 기존 형태 무회귀", async () => {
    const calls = { count: [] as unknown[] };
    const repo = createPrismaOrderRepo(countFakeDb(calls));
    await repo.count({ createdFrom: "2026-07-01T00:00:00.000Z", createdTo: "2026-07-24T00:00:00.000Z" });
    expect(calls.count[0]).toEqual({
      where: {
        createdAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lt: new Date("2026-07-24T00:00:00.000Z"),
        },
      },
    });
    await repo.count({ createdFrom: "2026-07-01T00:00:00.000Z" });
    expect(calls.count[1]).toEqual({ where: { createdAt: { gte: new Date("2026-07-01T00:00:00.000Z") } } });
  });
});

describe("OrderRepo.sumAmount (F089 — 전량, no-take)", () => {
  it("in-memory: 필터 교집합 위 금액 합 — 53건도 take 컷 없이 전량", async () => {
    const repo = createOrderRepo();
    for (let i = 0; i < 53; i++) await repo.create(draft({ amountWon: 1000 }));
    const paid = (await repo.create(draft({ amountWon: 49000 }))).id;
    await repo.markPaid(paid, "pk_s");
    expect(await repo.sumAmount()).toBe(53 * 1000 + 49000);
    expect(await repo.sumAmount({ status: "PAID" })).toBe(49000);
    expect(await repo.sumAmount({ status: "SHIPPED" })).toBe(0); // 공집합 = 0
  });
  it("Prisma: aggregate(_sum.amountWon) 계약 — where는 count와 동일 어휘, null→0, take 없음", async () => {
    const calls = { aggregate: [] as unknown[] };
    const order = {
      async aggregate(args: unknown) {
        calls.aggregate.push(args);
        return { _sum: { amountWon: null } };
      },
    };
    const repo = createPrismaOrderRepo(async () => ({ order }) as never);
    expect(await repo.sumAmount({ status: "PAID" })).toBe(0); // 빈 집합 null → 0
    expect(calls.aggregate[0]).toEqual({ where: { status: "PAID" }, _sum: { amountWon: true } });
  });
});
