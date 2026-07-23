import { describe, it, expect } from "vitest";
import { createOrderRepo, createWebhookLedger } from "../../src/app/api/payments/_lib/orders";
import { vaDepositExpired } from "../../src/app/api/payments/_lib/status";
import {
  buildOrderDraft,
  processWebhook,
  type TemplateResolver,
  type PaymentLookup,
} from "../../src/app/api/payments/_lib/checkout";
import { auditStore } from "../../src/app/admin/_lib/auditLog";
import type { PaymentLookupResult } from "../../src/lib/payments";

// F078 — 입금대기(가상계좌) 운영. 핵심 불변식(레드팀 치명 교정):
//   ① 미입금 종료는 기한 만료분(depositDueDate < now)만 — vaDepositExpired가 그 순수 게이트다
//     (기한 데이터가 없거나 깨져 있으면 fail-closed: 앱 내 종료 불가, 런북의 Toss 대시보드 경로만).
//   ② 종료(터미널 CANCELLED)는 은행 비동기 입금과 경합한다 — 종료 후 도착한 뒤늦은 입금 웹훅은
//     절대 재정산되지 않고(CANCELLED은 markPaid 제외, F070) LATE_DEPOSIT으로 감지·감사 기록된다.
//     실제 돈은 Toss에 남아 있으므로 운영자는 docs/RUNBOOK_VA.md대로 Toss 대시보드에서 환불한다.

const TOKEN = "test_whsec_unitfake";

const resolver: TemplateResolver = async (key) =>
  key === "birth" ? { label: "탄생", softPriceWon: 43000, hardPriceWon: 49000 } : null;

function payload() {
  return {
    buyerName: "김부모",
    buyerEmail: "parent@example.com",
    shipName: "김수취",
    shipPhone: "010-2222-3333",
    shipZip: "04524",
    shipAddress: "서울특별시 중구 세종대로 110",
    withdrawalConsent: true,
    qrVideoAddon: false,
    lines: [
      {
        templateKey: "birth",
        coverType: "SOFT",
        unitPriceWon: 1,
        personalization: { childName: "도윤", childGender: "MALE", extraVar: null },
        photo: null,
      },
    ],
  };
}

function tossBody(over: { paymentKey?: string; orderId?: string; status?: string } = {}): string {
  return JSON.stringify({
    eventType: "PAYMENT_STATUS_CHANGED",
    createdAt: "2026-07-23T00:00:00.000000",
    data: {
      paymentKey: over.paymentKey ?? "pay_va_unit",
      orderId: over.orderId ?? "ord_unit",
      status: over.status ?? "DONE",
    },
  });
}

function lookupReturning(result: PaymentLookupResult | null): PaymentLookup {
  return async () => result;
}

/** 발급된 가상계좌 주문(WAITING_FOR_DEPOSIT)을 만든다. */
async function wfdOrder() {
  const repo = createOrderRepo();
  const built = await buildOrderDraft(payload(), resolver);
  if (!built.ok) throw new Error("fixture draft should be ok");
  const order = await repo.create(built.draft);
  await repo.markAwaitingDeposit(order.id, "pk_va", {
    bank: "우리은행",
    account: "56001234567890",
    dueDate: "2026-07-20T23:59:59.000Z",
  });
  return { repo, order };
}

// ── ① 만료 게이트: depositDueDate < now 만 종료 가능, 데이터 부재/오염은 fail-closed ──
describe("vaDepositExpired (F078 — 미입금 종료의 순수 게이트)", () => {
  const NOW = Date.parse("2026-07-23T12:00:00.000Z");

  it("기한이 지난 주문만 만료다", () => {
    expect(vaDepositExpired("2026-07-20T23:59:59.000Z", NOW)).toBe(true);
  });

  it("기한 전이면 만료가 아니다 (무게이트 취소 봉쇄)", () => {
    expect(vaDepositExpired("2026-07-24T00:00:00.000Z", NOW)).toBe(false);
  });

  it("기한 정각(now === due)은 아직 만료가 아니다 (엄격 미만)", () => {
    expect(vaDepositExpired("2026-07-23T12:00:00.000Z", NOW)).toBe(false);
  });

  it("기한 데이터가 없으면 fail-closed(만료 아님 → 앱 내 종료 불가)", () => {
    expect(vaDepositExpired(undefined, NOW)).toBe(false);
    expect(vaDepositExpired("", NOW)).toBe(false);
  });

  it("깨진 날짜 문자열도 fail-closed", () => {
    expect(vaDepositExpired("not-a-date", NOW)).toBe(false);
  });
});

// ── ② 종료 후 뒤늦은 입금: 재정산 0 + LATE_DEPOSIT 감지 + system 감사 기록 ──
describe("processWebhook 뒤늦은 입금 감지 (F078)", () => {
  it("CANCELLED 주문에 도착한 권위적 PAID 웹훅은 정산하지 않고 LATE_DEPOSIT을 보고한다", async () => {
    const { repo, order } = await wfdOrder();
    await repo.transition(order.id, ["WAITING_FOR_DEPOSIT"], "CANCELLED"); // 만료 종료(관리자/EXPIRED 웹훅)
    const ledger = createWebhookLedger();
    const notified: string[] = [];
    const lookup = lookupReturning({ status: "PAID", amount: order.amountWon, orderId: order.id });

    const res = await processWebhook(
      tossBody({ orderId: order.id, paymentKey: "pk_va" }),
      TOKEN, TOKEN, repo, ledger, lookup,
      (o) => notified.push(o.id),
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("LATE_DEPOSIT");
    expect(res.body.orderId).toBe(order.id);
    expect((await repo.get(order.id))?.status).toBe("CANCELLED"); // 터미널 유지 — 재정산 0
    expect(notified).toEqual([]); // 확인 메일도 절대 발송되지 않는다
  });

  // 주의: in-memory orderRepo는 테스트마다 새로 만들어져 주문 id(ord_0001)가 겹치지만
  // auditStore는 전역 누적이다 — targetId 필터가 아니라 호출 전 스냅샷과의 델타로 단언한다.
  async function auditIdsSnapshot(): Promise<Set<string>> {
    return new Set((await auditStore().listRecent({ take: 500 })).map((r) => r.id));
  }
  async function auditRowsSince(seen: Set<string>) {
    return (await auditStore().listRecent({ take: 500 })).filter((r) => !seen.has(r.id));
  }

  it("뒤늦은 입금은 system 행위자로 감사 로그에 남는다 (운영 가시성; PII 없음)", async () => {
    const { repo, order } = await wfdOrder();
    await repo.transition(order.id, ["WAITING_FOR_DEPOSIT"], "CANCELLED");
    const ledger = createWebhookLedger();
    const lookup = lookupReturning({ status: "PAID", amount: order.amountWon, orderId: order.id });
    const seen = await auditIdsSnapshot();

    await processWebhook(tossBody({ orderId: order.id, paymentKey: "pk_va" }), TOKEN, TOKEN, repo, ledger, lookup);

    const rows = await auditRowsSince(seen);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("order.late_deposit");
    expect(rows[0].actorUserId).toBe("system");
    expect(rows[0].targetType).toBe("order");
    expect(rows[0].targetId).toBe(order.id);
    expect(rows[0].before).toBe("CANCELLED");
    expect(rows[0].after).toBe("CANCELLED"); // 상태는 움직이지 않았다 — 감지 이벤트 기록
  });

  it("같은 통보의 재전달은 dedupe되어 감사 기록이 중복되지 않는다", async () => {
    const { repo, order } = await wfdOrder();
    await repo.transition(order.id, ["WAITING_FOR_DEPOSIT"], "CANCELLED");
    const ledger = createWebhookLedger();
    const lookup = lookupReturning({ status: "PAID", amount: order.amountWon, orderId: order.id });
    const body = tossBody({ orderId: order.id, paymentKey: "pk_va" });
    const seen = await auditIdsSnapshot();

    await processWebhook(body, TOKEN, TOKEN, repo, ledger, lookup);
    const dup = await processWebhook(body, TOKEN, TOKEN, repo, ledger, lookup);
    expect(dup.body.duplicate).toBe(true);

    expect(await auditRowsSince(seen)).toHaveLength(1); // 정확히 1회
  });

  it("금액이 어긋나도 CANCELLED 주문의 입금은 LATE_DEPOSIT으로 감지된다 (감지가 금액 검증보다 먼저)", async () => {
    const { repo, order } = await wfdOrder();
    await repo.transition(order.id, ["WAITING_FOR_DEPOSIT"], "CANCELLED");
    const ledger = createWebhookLedger();
    const lookup = lookupReturning({ status: "PAID", amount: order.amountWon + 1, orderId: order.id });

    const res = await processWebhook(tossBody({ orderId: order.id, paymentKey: "pk_va" }), TOKEN, TOKEN, repo, ledger, lookup);
    expect(res.body.status).toBe("LATE_DEPOSIT"); // 돈이 Toss에 실재 — 금액 불일치여도 운영자는 알아야 한다
    expect((await repo.get(order.id))?.status).toBe("CANCELLED");
  });

  it("경합 창: 웹훅이 WFD로 읽은 직후 종료가 커밋돼도 감지를 놓치지 않는다 (markPaid 후 재확인)", async () => {
    // 인터리빙: processWebhook의 repo.get이 WFD 스냅샷을 읽음 → 관리자 종료가 WFD→CANCELLED 커밋
    // → markPaid는 no-op(transitioned:false). 사전 read 분기는 이미 지나쳤으므로, markPaid 뒤의
    // 재확인이 없으면 LATE_DEPOSIT 감지가 영구 누락된다(200 응답이라 Toss 재시도도 없음).
    const { repo, order } = await wfdOrder();
    const racingRepo: typeof repo = {
      ...repo,
      async get(id) {
        const o = await repo.get(id);
        const snapshot = o ? { ...o } : o; // in-memory는 in-place 변이 — 전이 전 상태를 복사로 보존
        await repo.transition(id, ["WAITING_FOR_DEPOSIT"], "CANCELLED"); // read 직후 종료가 커밋
        return snapshot;
      },
    };
    const ledger = createWebhookLedger();
    const notified: string[] = [];
    const lookup = lookupReturning({ status: "PAID", amount: order.amountWon, orderId: order.id });
    const seen = await auditIdsSnapshot();

    const res = await processWebhook(
      tossBody({ orderId: order.id, paymentKey: "pk_va" }),
      TOKEN, TOKEN, racingRepo, ledger, lookup,
      (o) => notified.push(o.id),
    );
    expect(res.body.status).toBe("LATE_DEPOSIT");
    expect((await repo.get(order.id))?.status).toBe("CANCELLED"); // 재정산 0
    expect(notified).toEqual([]);
    const rows = await auditRowsSince(seen);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("order.late_deposit");
  });

  it("입금 대기 중(WFD, 종료 전) 주문은 여전히 정상 정산된다 (무회귀)", async () => {
    const { repo, order } = await wfdOrder();
    const ledger = createWebhookLedger();
    const lookup = lookupReturning({ status: "PAID", amount: order.amountWon, orderId: order.id });

    const res = await processWebhook(tossBody({ orderId: order.id, paymentKey: "pk_va" }), TOKEN, TOKEN, repo, ledger, lookup);
    expect(res.body.status).toBe("PAID");
    expect((await repo.get(order.id))?.status).toBe("PAID");
  });
});
