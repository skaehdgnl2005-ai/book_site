/**
 * F054 — the order status machine. Pure vocabulary + transition table (no DB, no network;
 * unit-tested exhaustively). The 7 statuses were reserved in the Prisma enum at F004 — this
 * module promotes them into the app layer.
 *
 * CREATED→PAID is deliberately NOT in the table: payment settlement is `markPaid` (gateway-
 * confirmed via confirm/webhook, idempotent conditional write) — an admin can never hand-flip
 * an order to PAID. Refunds leave the table's REFUNDED edges but execute only behind
 * `requireApproval("toss.refund.live")` (F063).
 *
 * F070 — WAITING_FOR_DEPOSIT (가상계좌 발급, 입금 대기): also a SETTLEMENT state, not an admin
 * move. CREATED→WAITING_FOR_DEPOSIT (markAwaitingDeposit, on a VA confirm) and
 * WAITING_FOR_DEPOSIT→PAID (the deposit webhook) are gateway-driven conditional writes — like
 * CREATED→PAID they are NOT in the admin transition table. An unpaid/expired VA may be CANCELLED.
 */
import type { OrderStatus } from "./orders";

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "CREATED",
  "WAITING_FOR_DEPOSIT",
  "PAID",
  "IN_PRODUCTION",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
];

/** Settled money: PAID + its forward fulfillment states. Gates 주문 확인/마이페이지 마무리.
 *  WAITING_FOR_DEPOSIT is deliberately EXCLUDED — no money received yet (F070). */
export const PAID_FAMILY: readonly OrderStatus[] = ["PAID", "IN_PRODUCTION", "SHIPPED", "COMPLETED"];

export function isPaidFamily(status: OrderStatus): boolean {
  return PAID_FAMILY.includes(status);
}

/**
 * F062/F082 — 취소요청이 접수·처리될 수 있는 상태(배송 전 결제 완료 구간). requestCancel의
 * 전제조건이자 취소요청 큐(처리 대기 = cancelRequestedAt ≠ null && status ∈ 이 집합)의 어휘,
 * 그리고 RefundPanel이 렌더되는 환불 가능 집합(전이표의 →REFUNDED 엣지)과 동일한 단일 상수.
 * 환불(REFUNDED)·배송(SHIPPED) 전이는 이 집합을 벗어나므로 큐에서 자연히 빠진다.
 */
export const CANCELLABLE_STATUSES: readonly OrderStatus[] = ["PAID", "IN_PRODUCTION"];

const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  CREATED: ["CANCELLED"], // abandoned/unpaid checkout can be closed; payment itself = markPaid
  WAITING_FOR_DEPOSIT: ["CANCELLED"], // 미입금/기한만료 가상계좌 종료; 입금 확정(→PAID)은 웹훅 전용
  PAID: ["IN_PRODUCTION", "REFUNDED"],
  IN_PRODUCTION: ["SHIPPED", "REFUNDED"],
  SHIPPED: ["COMPLETED"],
  COMPLETED: [], // terminal
  CANCELLED: [], // terminal
  REFUNDED: [], // terminal
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

/**
 * F081 — 미입금 종료(WAITING_FOR_DEPOSIT→CANCELLED)의 순수 만료 게이트. 종료는 기한이 실제로
 * 지난 주문에만 허용된다(엄격 미만): 기한 전 무게이트 취소는 은행의 비동기 입금과 경합해 터미널
 * CANCELLED(REFUNDED 엣지 없음)로 실입금을 앱 내 환불 경로 0에 가둔다. 기한 데이터가 없거나
 * 깨져 있으면 fail-closed(false) — 앱 내 종료 불가, docs/RUNBOOK_VA.md의 Toss 대시보드 경로만.
 */
export function vaDepositExpired(depositDueDate: string | null | undefined, now: number): boolean {
  if (!depositDueDate) return false;
  const due = Date.parse(depositDueDate);
  return Number.isFinite(due) && due < now;
}

/** 한글 표시 라벨 (구매자/관리자 화면 공용). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  CREATED: "결제 대기",
  WAITING_FOR_DEPOSIT: "입금 대기",
  PAID: "결제 완료",
  IN_PRODUCTION: "제작중",
  SHIPPED: "배송중",
  COMPLETED: "배송 완료",
  CANCELLED: "취소됨",
  REFUNDED: "환불 완료",
};

/** Defensive read-side mapping: a DB row's status string → app status (junk → CREATED). */
export function toOrderStatus(value: unknown): OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus) ? (value as OrderStatus) : "CREATED";
}
