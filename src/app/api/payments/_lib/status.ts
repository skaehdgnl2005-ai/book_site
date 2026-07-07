/**
 * F054 — the order status machine. Pure vocabulary + transition table (no DB, no network;
 * unit-tested exhaustively). The 7 statuses were reserved in the Prisma enum at F004 — this
 * module promotes them into the app layer.
 *
 * CREATED→PAID is deliberately NOT in the table: payment settlement is `markPaid` (gateway-
 * confirmed via confirm/webhook, idempotent conditional write) — an admin can never hand-flip
 * an order to PAID. Refunds leave the table's REFUNDED edges but execute only behind
 * `requireApproval("toss.refund.live")` (F063).
 */
import type { OrderStatus } from "./orders";

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "CREATED",
  "PAID",
  "IN_PRODUCTION",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
];

/** Settled money: PAID + its forward fulfillment states. Gates 주문 확인/마이페이지 마무리. */
export const PAID_FAMILY: readonly OrderStatus[] = ["PAID", "IN_PRODUCTION", "SHIPPED", "COMPLETED"];

export function isPaidFamily(status: OrderStatus): boolean {
  return PAID_FAMILY.includes(status);
}

const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  CREATED: ["CANCELLED"], // abandoned/unpaid checkout can be closed; payment itself = markPaid
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

/** 한글 표시 라벨 (구매자/관리자 화면 공용). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  CREATED: "결제 대기",
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
