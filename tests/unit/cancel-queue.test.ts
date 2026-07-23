import { describe, it, expect } from "vitest";
import {
  createOrderRepo,
  createPrismaOrderRepo,
  type OrderDraft,
  type OrderRepo,
  type OrderRow,
} from "../../src/app/api/payments/_lib/orders";
import { CANCELLABLE_STATUSES } from "../../src/app/api/payments/_lib/status";

// F082 — 취소요청 큐: listRecent의 cancelRequested 필터 + take 컷과 분리된 정직한 count 경로.
// 큐 의미론(확정): 처리 대기 = cancelRequestedAt ≠ null && status ∈ CANCELLABLE_STATUSES
// (PAID/IN_PRODUCTION — requestCancel 전제조건이자 RefundPanel 렌더 집합). 환불(REFUNDED)·
// 배송(SHIPPED) 전이로 온라인 환불 경로가 닫힌 건은 큐에서 빠진다. 양 백엔드 동형.

function draft(over: Partial<OrderDraft> = {}): OrderDraft {
  return {
    amountWon: 43000,
    orderName: "탄생",
    qrVideoAddon: false,
    buyerName: "김부모",
    buyerEmail: "parent@example.com",
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
    ...over,
  };
}

/** 결제 완료 + 취소요청 접수 상태의 주문을 만든다 (큐 진입의 표준 경로). */
async function paidWithCancelRequest(repo: OrderRepo, reason = "단순 변심"): Promise<string> {
  const order = await repo.create(draft());
  await repo.markPaid(order.id, `pk_${order.id}`);
  const res = await repo.requestCancel(order.id, reason);
  expect(res.ok).toBe(true);
  return order.id;
}

describe("createOrderRepo — cancel-request queue (F082, in-memory)", () => {
  it("cancelRequested:true는 처리 대기 건만 반환한다 (요청 없는 건·환불/배송 처리된 건 제외)", async () => {
    const repo = createOrderRepo();

    const paidQueued = await paidWithCancelRequest(repo); // PAID + 요청 → 큐
    const inProdQueued = await paidWithCancelRequest(repo); // IN_PRODUCTION + 요청 → 큐
    await repo.transition(inProdQueued, ["PAID"], "IN_PRODUCTION");

    const paidNoRequest = (await repo.create(draft())).id; // 요청 없음 → 큐 밖
    await repo.markPaid(paidNoRequest, "pk_none");

    const refunded = await paidWithCancelRequest(repo); // 환불 실행됨 → 큐에서 제거
    await repo.transition(refunded, ["PAID"], "REFUNDED");

    const shipped = await paidWithCancelRequest(repo); // 배송 전이 → 온라인 환불 경로 닫힘 → 큐 밖
    await repo.transition(shipped, ["PAID"], "IN_PRODUCTION");
    await repo.transition(shipped, ["IN_PRODUCTION"], "SHIPPED");

    const queue = await repo.listRecent({ cancelRequested: true });
    expect(queue.map((o) => o.id).sort()).toEqual([paidQueued, inProdQueued].sort());
    // 환불된 건은 cancelRequestedAt이 여전히 남아 있지만(이력) 큐에서는 빠진다
    expect((await repo.get(refunded))?.cancelRequestedAt).toBeTruthy();
  });

  it("count는 take 컷과 무관한 전량 카운트 — 목록이 50건으로 잘려도 배지 숫자는 정직하다", async () => {
    const repo = createOrderRepo();
    for (let i = 0; i < 53; i++) await paidWithCancelRequest(repo);

    expect((await repo.listRecent({ cancelRequested: true })).length).toBe(50); // 기본 take 50 컷
    expect(await repo.count({ cancelRequested: true })).toBe(53); // 컷 없는 전량
  });

  it("환불(REFUNDED)·배송(SHIPPED) 전이는 큐 count를 정확히 1 줄인다 — 건수 감소 의미론의 결정론 검증 (E2E는 전역 카운트 교차 탓에 멤버십만 단언)", async () => {
    const repo = createOrderRepo();
    const a = await paidWithCancelRequest(repo);
    const b = await paidWithCancelRequest(repo);
    expect(await repo.count({ cancelRequested: true })).toBe(2);

    await repo.transition(a, ["PAID"], "REFUNDED"); // 처리 완료 → 큐 이탈
    expect(await repo.count({ cancelRequested: true })).toBe(1);

    await repo.transition(b, ["PAID"], "IN_PRODUCTION");
    expect(await repo.count({ cancelRequested: true })).toBe(1); // 제작중은 여전히 처리 대기
    await repo.transition(b, ["IN_PRODUCTION"], "SHIPPED"); // 온라인 환불 경로 닫힘 → 큐 이탈
    expect(await repo.count({ cancelRequested: true })).toBe(0);
  });

  it("count는 status 필터도 지원한다 (트랙 O #3 대시보드 카운트 재사용 경로)", async () => {
    const repo = createOrderRepo();
    const paid = (await repo.create(draft())).id;
    await repo.markPaid(paid, "pk_1");
    await repo.create(draft()); // CREATED
    await paidWithCancelRequest(repo); // PAID + 요청

    expect(await repo.count({ status: "PAID" })).toBe(2); // 요청 여부와 무관한 상태 카운트
    expect(await repo.count({ status: "CREATED" })).toBe(1);
    expect(await repo.count()).toBe(3); // 무필터 = 전체
    expect(await repo.count({ status: "PAID", cancelRequested: true })).toBe(1); // 자연 합성(교집합)
  });
});

// ── Prisma 경로: fake delegate로 where/orderBy/take 형태를 고정 (orders-prisma.test 선례) ──

function row(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "ord_q",
    status: "PAID",
    tossPaymentKey: "pk_q",
    amountWon: 43000,
    qrVideoAddon: false,
    buyerName: "김부모",
    buyerEmail: "parent@example.com",
    cancelRequestedAt: new Date("2026-07-23T01:00:00.000Z"),
    cancelReason: "단순 변심",
    createdAt: new Date("2026-07-23T00:00:00.000Z"),
    items: [],
    ...over,
  };
}

function fakeDb(rows: OrderRow[], calls: { findMany: unknown[]; count: unknown[] }, countResult = 0) {
  const order = {
    async findMany(args: unknown) {
      calls.findMany.push(args);
      return rows;
    },
    async count(args: unknown) {
      calls.count.push(args);
      return countResult;
    },
  };
  return async () => ({ order }) as never;
}

describe("createPrismaOrderRepo — cancel-request queue (F082, delegate contract)", () => {
  it("listRecent cancelRequested:true → where에 cancelRequestedAt not-null + CANCELLABLE 상태 in", async () => {
    const calls = { findMany: [] as unknown[], count: [] as unknown[] };
    const repo = createPrismaOrderRepo(fakeDb([row()], calls));

    const list = await repo.listRecent({ cancelRequested: true });
    expect(calls.findMany).toHaveLength(1);
    expect(calls.findMany[0]).toMatchObject({
      where: { cancelRequestedAt: { not: null }, status: { in: [...CANCELLABLE_STATUSES] } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    expect(list[0].id).toBe("ord_q"); // mapOrderRow 경유 (ISO 정규화 포함)
    expect(list[0].cancelRequestedAt).toBe("2026-07-23T01:00:00.000Z");
  });

  it("기존 status 필터 where 형태는 무변경 (admin-orders 상태 필터 계약)", async () => {
    const calls = { findMany: [] as unknown[], count: [] as unknown[] };
    const repo = createPrismaOrderRepo(fakeDb([], calls));
    await repo.listRecent({ status: "PAID", take: 50 });
    expect(calls.findMany[0]).toMatchObject({ where: { status: "PAID" }, take: 50 });
    await repo.listRecent();
    expect(calls.findMany[1]).toMatchObject({ where: {} });
  });

  it("count는 같은 where 어휘로 delegate.count를 호출하고 take를 싣지 않는다", async () => {
    const calls = { findMany: [] as unknown[], count: [] as unknown[] };
    const repo = createPrismaOrderRepo(fakeDb([], calls, 53));

    expect(await repo.count({ cancelRequested: true })).toBe(53);
    expect(calls.count[0]).toEqual({
      where: { cancelRequestedAt: { not: null }, status: { in: [...CANCELLABLE_STATUSES] } },
    });

    await repo.count({ status: "PAID" });
    expect(calls.count[1]).toEqual({ where: { status: "PAID" } });

    // 합성: status ∩ CANCELLABLE 교집합 (in-memory 술어의 conjunction과 동형)
    await repo.count({ status: "PAID", cancelRequested: true });
    expect(calls.count[2]).toEqual({ where: { cancelRequestedAt: { not: null }, status: { in: ["PAID"] } } });
    await repo.count({ status: "REFUNDED", cancelRequested: true });
    expect(calls.count[3]).toEqual({ where: { cancelRequestedAt: { not: null }, status: { in: [] } } }); // 이력≠큐 — 정직한 공집합

    await repo.count();
    expect(calls.count[4]).toEqual({ where: {} });
    expect(calls.findMany).toHaveLength(0); // count 경로는 행을 읽지 않는다
  });
});

describe("CANCELLABLE_STATUSES — 큐 의미론과 requestCancel 전제조건의 단일 어휘", () => {
  it("PAID·IN_PRODUCTION 정확히 두 상태다 (RefundPanel 렌더 집합과 동일)", () => {
    expect([...CANCELLABLE_STATUSES]).toEqual(["PAID", "IN_PRODUCTION"]);
  });

  it("requestCancel은 이 집합 밖(SHIPPED)에서는 접수되지 않는다 (기존 계약 회귀 가드)", async () => {
    const repo = createOrderRepo();
    const id = (await repo.create(draft())).id;
    await repo.markPaid(id, "pk_s");
    await repo.transition(id, ["PAID"], "IN_PRODUCTION");
    await repo.transition(id, ["IN_PRODUCTION"], "SHIPPED");
    expect((await repo.requestCancel(id, "늦은 요청")).ok).toBe(false);
  });
});
