import { describe, it, expect } from "vitest";
import { kstDayStartIso } from "../../src/app/_components/order/format";
import {
  createOrderRepo,
  createPrismaOrderRepo,
  type OrderDraft,
} from "../../src/app/api/payments/_lib/orders";
import { PAID_FAMILY, CANCELLABLE_STATUSES } from "../../src/app/api/payments/_lib/status";
import {
  buildWrittenIntake,
  createInMemoryCustomBackend,
  createPrismaBackend,
} from "../../src/lib/customRequest";
import { todayOrdersFilter } from "../../src/app/admin/_lib/dashboard";

// F083 — 관리자 대시보드 카운트: '오늘 주문'의 KST 일경계(kstDayStartIso) + orderRepo.count의
// createdFrom·statusIn 확장(모든 상태 제약은 교집합 conjunction — 양 백엔드 동형) +
// customRequestStore.count 신설(F082 count와 동형: take 없는 전량, fake delegate 계약).

// ── KST 일경계 (Asia/Seoul = UTC+9 고정, DST 없음) ──────────────────────────────
describe("kstDayStartIso (F083 — '오늘' 경계)", () => {
  it("KST 23:59는 같은 날, KST 00:00 정각부터 다음 날로 접힌다", () => {
    // 2026-07-23T14:59Z = KST 07-23 23:59 → 그 날의 시작은 KST 07-23 00:00 = 07-22T15:00Z
    expect(kstDayStartIso(Date.parse("2026-07-23T14:59:59.999Z"))).toBe("2026-07-22T15:00:00.000Z");
    // 2026-07-23T15:00Z = KST 07-24 00:00 정각 → 새 날
    expect(kstDayStartIso(Date.parse("2026-07-23T15:00:00.000Z"))).toBe("2026-07-23T15:00:00.000Z");
    // 한낮(KST 11:00)도 같은 시작점
    expect(kstDayStartIso(Date.parse("2026-07-23T02:00:00.000Z"))).toBe("2026-07-22T15:00:00.000Z");
  });

  it("UTC 자정 부근(KST 오전 9시 전후)에서 UTC 날짜와 갈라진다 — naive slice(0,10) 회귀 가드", () => {
    // 2026-07-23T00:30Z = KST 07-23 09:30 → KST 시작은 07-22T15:00Z (UTC 날짜로는 아직 07-22)
    expect(kstDayStartIso(Date.parse("2026-07-23T00:30:00.000Z"))).toBe("2026-07-22T15:00:00.000Z");
  });
});

// ── '오늘 주문' 타일의 확정 의미론 — 조각이 아니라 조합 자체를 고정 (checker major 교정) ──
describe("todayOrdersFilter (F083 — 대시보드가 소비하는 바로 그 필터)", () => {
  it("statusIn = PAID_FAMILY ∪ WAITING_FOR_DEPOSIT, createdFrom = KST 오늘 시작", () => {
    const now = Date.parse("2026-07-23T02:00:00.000Z"); // KST 11:00
    expect(todayOrdersFilter(now)).toEqual({
      statusIn: [...PAID_FAMILY, "WAITING_FOR_DEPOSIT"],
      createdFrom: kstDayStartIso(now), // = "2026-07-22T15:00:00.000Z"
    });
    expect(todayOrdersFilter(now).statusIn).not.toContain("CREATED"); // 미결제 이탈 제외
    expect(todayOrdersFilter(now).statusIn).not.toContain("CANCELLED");
    expect(todayOrdersFilter(now).statusIn).not.toContain("REFUNDED");
  });

  it("repo.count(todayOrdersFilter(now))는 오늘 성립 주문만 센다 (배선 동작 검증)", async () => {
    const repo = createOrderRepo();
    await repo.create(draft()); // CREATED — 제외
    const paid = (await repo.create(draft())).id;
    await repo.markPaid(paid, "pk_t");
    const va = (await repo.create(draft())).id;
    await repo.markAwaitingDeposit(va, "pk_v", { bank: "우리은행", account: "1", dueDate: "2026-07-30T15:00:00Z" });

    expect(await repo.count(todayOrdersFilter(Date.now()))).toBe(2); // 방금 생성 = 오늘
    // 미래의 '오늘'(다음 KST 날) 기준이면 전부 어제 — 0건 (createdFrom 경계가 실제로 작동)
    expect(await repo.count(todayOrdersFilter(Date.now() + 24 * 60 * 60 * 1000))).toBe(0);
  });
});

// ── orderRepo.count 확장: in-memory ─────────────────────────────────────────────
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

describe("createOrderRepo — count statusIn/createdFrom (F083, in-memory)", () => {
  it("statusIn은 집합 카운트 — '오늘 주문' 상태 어휘(PAID_FAMILY ∪ WAITING_FOR_DEPOSIT)", async () => {
    const repo = createOrderRepo();
    await repo.create(draft()); // CREATED — 제외
    const paid = (await repo.create(draft())).id;
    await repo.markPaid(paid, "pk_1");
    const va = (await repo.create(draft())).id;
    await repo.markAwaitingDeposit(va, "pk_va", { bank: "우리은행", account: "1", dueDate: "2026-07-30T15:00:00Z" });

    const TODAY_STATUSES = [...PAID_FAMILY, "WAITING_FOR_DEPOSIT"] as const;
    expect(await repo.count({ statusIn: [...TODAY_STATUSES] })).toBe(2); // CREATED 제외
    expect(await repo.count({ statusIn: ["CREATED"] })).toBe(1);
  });

  it("createdFrom은 포함 경계(≥) — 실제 createdAt을 경계로 쓰면 그 주문이 포함된다", async () => {
    const repo = createOrderRepo();
    const a = await repo.create(draft());
    await repo.markPaid(a.id, "pk_a");

    expect(await repo.count({ createdFrom: a.createdAt })).toBe(1); // 경계 포함
    expect(await repo.count({ createdFrom: "2999-01-01T00:00:00.000Z" })).toBe(0); // 미래 경계
    expect(await repo.count({ createdFrom: "2000-01-01T00:00:00.000Z" })).toBe(1);
  });

  it("깨진 createdFrom은 양 백엔드 동형으로 fail-loud (조용히 전량 매칭 금지)", async () => {
    const repo = createOrderRepo();
    await repo.create(draft());
    await expect(repo.count({ createdFrom: "not-a-date" })).rejects.toThrow(); // in-memory
    const calls = { count: [] as unknown[] };
    const prisma = createPrismaOrderRepo(orderFakeDb(calls));
    await expect(prisma.count({ createdFrom: "not-a-date" })).rejects.toThrow(); // where 빌더
    expect(calls.count).toHaveLength(0); // delegate까지 가지 않는다
  });

  it("상태 제약들은 교집합(conjunction) — statusIn × cancelRequested / statusIn × status", async () => {
    const repo = createOrderRepo();
    const q = (await repo.create(draft())).id; // PAID + 취소요청
    await repo.markPaid(q, "pk_q");
    await repo.requestCancel(q, "단순 변심");
    const p = (await repo.create(draft())).id; // PAID만
    await repo.markPaid(p, "pk_p");

    expect(await repo.count({ statusIn: ["PAID"], cancelRequested: true })).toBe(1); // q만
    expect(await repo.count({ statusIn: ["SHIPPED"], cancelRequested: true })).toBe(0); // 공집합
    expect(await repo.count({ status: "PAID", statusIn: ["PAID", "SHIPPED"] })).toBe(2); // 교집합 = PAID
    expect(await repo.count({ status: "SHIPPED", statusIn: ["PAID"] })).toBe(0); // 서로소 → 0
  });
});

// ── orderRepo.count 확장: Prisma where 계약 (fake delegate) ─────────────────────
function orderFakeDb(calls: { count: unknown[] }, countResult = 0) {
  const order = {
    async findMany() {
      throw new Error("count 경로는 findMany를 호출하지 않는다");
    },
    async count(args: unknown) {
      calls.count.push(args);
      return countResult;
    },
  };
  return async () => ({ order }) as never;
}

describe("createPrismaOrderRepo — count statusIn/createdFrom where 계약 (F083)", () => {
  it("statusIn → status.in, createdFrom → createdAt.gte(Date) — take 없음", async () => {
    const calls = { count: [] as unknown[] };
    const repo = createPrismaOrderRepo(orderFakeDb(calls, 7));
    const from = "2026-07-22T15:00:00.000Z";

    const n = await repo.count({ statusIn: [...PAID_FAMILY, "WAITING_FOR_DEPOSIT"], createdFrom: from });
    expect(n).toBe(7);
    expect(calls.count[0]).toEqual({
      where: {
        status: { in: [...PAID_FAMILY, "WAITING_FOR_DEPOSIT"] },
        createdAt: { gte: new Date(from) },
      },
    });
  });

  it("상태 제약 교집합이 where에 그대로 실린다 (in-memory conjunction과 동형)", async () => {
    const calls = { count: [] as unknown[] };
    const repo = createPrismaOrderRepo(orderFakeDb(calls));

    await repo.count({ statusIn: ["PAID", "SHIPPED"], cancelRequested: true });
    expect(calls.count[0]).toEqual({
      where: { cancelRequestedAt: { not: null }, status: { in: ["PAID"] } }, // ∩ CANCELLABLE
    });

    await repo.count({ status: "SHIPPED", statusIn: ["PAID"] });
    expect(calls.count[1]).toEqual({ where: { status: { in: [] } } }); // 서로소 → 정직한 공집합

    // 기존 계약 무회귀: 단독 status는 스칼라, 단독 cancelRequested는 CANCELLABLE in
    await repo.count({ status: "PAID" });
    expect(calls.count[2]).toEqual({ where: { status: "PAID" } });
    await repo.count({ cancelRequested: true });
    expect(calls.count[3]).toEqual({
      where: { cancelRequestedAt: { not: null }, status: { in: [...CANCELLABLE_STATUSES] } },
    });
  });
});

// ── customRequestStore.count (F083 신설 — F082 동형) ────────────────────────────
const writtenDraft = () =>
  buildWrittenIntake({
    contactName: "김부모",
    contactPhone: "010-1234-5678",
    contactEmail: "parent@example.com",
    answers: { protagonist: { name: "서연" } },
  });

describe("customRequest count (F083, in-memory)", () => {
  it("status/path 필터 전량 카운트 — take 컷 없음", async () => {
    const store = createInMemoryCustomBackend();
    for (let i = 0; i < 53; i++) {
      const rec = await store.create(writtenDraft());
      await store.markSubmitted(rec.id); // PENDING_PAYMENT → SUBMITTED
    }
    await store.create(writtenDraft()); // PENDING_PAYMENT 잔류

    expect((await store.list({ status: "SUBMITTED" })).length).toBe(50); // 목록은 take 50 컷
    expect(await store.count({ status: "SUBMITTED" })).toBe(53); // 카운트는 전량
    expect(await store.count({ status: "PENDING_PAYMENT" })).toBe(1);
    expect(await store.count()).toBe(54);
    expect(await store.count({ path: "WRITTEN", status: "SUBMITTED" })).toBe(53);
    expect(await store.count({ path: "PHONE" })).toBe(0);
  });
});

describe("createPrismaBackend(custom) — count where 계약 (F083)", () => {
  it("list와 같은 where 어휘로 delegate.count 호출, take 없음", async () => {
    const calls: unknown[] = [];
    const db = {
      customRequest: {
        async count(args: unknown) {
          calls.push(args);
          return 9;
        },
      },
    };
    const backend = createPrismaBackend(async () => db as never);

    expect(await backend.count({ status: "SUBMITTED" })).toBe(9);
    expect(calls[0]).toEqual({ where: { status: "SUBMITTED" } });
    await backend.count({ path: "PHONE", status: "SUBMITTED" });
    expect(calls[1]).toEqual({ where: { path: "PHONE", status: "SUBMITTED" } });
    await backend.count();
    expect(calls[2]).toEqual({ where: {} });
  });
});
