"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { untrusted, requireApproval } from "@/lib/guardrails";
import { emailAdapter } from "@/lib/email";
import { redact } from "@/lib/env";
import { customTossProvider } from "@/lib/customRequest";
import { orderRepo, type OrderStatus } from "@/app/api/payments/_lib/orders";
import { canTransition } from "@/app/api/payments/_lib/status";
import { trackingUrl, carrierDisplayName } from "@/app/api/payments/_lib/tracking";
import { checkoutProvider } from "@/app/api/payments/_lib/checkout";
import { requireAdmin } from "../../_lib/adminAuth";

/**
 * F060 — admin fulfillment actions. Defense in depth: requireAdmin() re-runs INSIDE every
 * action (the layout gate alone never protects a POST). Every move re-validates against the
 * canTransition table on the OBSERVED status and applies via the repo's conditional write —
 * two admins double-clicking apply exactly once, the loser sees the honest error. REFUNDED is
 * deliberately NOT reachable here (F063: requireApproval-gated refund flow only).
 */

export type AdminActionState = { error?: string };

const FORWARD_TARGETS: readonly OrderStatus[] = ["IN_PRODUCTION", "SHIPPED", "COMPLETED"];

export async function advanceOrder(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdmin();
  const orderId = String(untrusted(formData.get("orderId")).value ?? "").trim();
  const to = String(untrusted(formData.get("to")).value ?? "").trim() as OrderStatus;
  if (!FORWARD_TARGETS.includes(to)) return { error: "허용되지 않은 상태입니다." };

  const repo = orderRepo();
  const order = await repo.get(orderId);
  if (!order) return { error: "주문을 찾을 수 없습니다." };
  if (!canTransition(order.status, to)) return { error: "현재 상태에서 허용되지 않는 전이입니다." };

  // SHIPPED requires the shipment record — validate the carrier + number in the same move, BEFORE
  // the transition (never flip to SHIPPED with a missing waybill), but persist it only AFTER the
  // transition wins (below) so a losing concurrent racer can't overwrite the shipped order's tracking.
  let shipment: { carrier: string; trackingNumber: string } | null = null;
  if (to === "SHIPPED") {
    const carrier = String(untrusted(formData.get("trackingCarrier")).value ?? "").trim();
    const trackingNumber = String(untrusted(formData.get("trackingNumber")).value ?? "").trim();
    if (!carrier || !trackingNumber) return { error: "택배사와 운송장 번호를 입력해 주세요." };
    if (carrier.length > 60 || trackingNumber.length > 60) return { error: "운송장 정보가 너무 깁니다." };
    shipment = { carrier, trackingNumber };
  }

  const res = await repo.transition(orderId, [order.status], to);
  if (!res.ok) return { error: "이미 처리되었거나 상태가 바뀌었습니다. 새로고침해 주세요." };

  if (shipment) {
    const { carrier, trackingNumber } = shipment;
    // Winner-only write: the atomic transition above already elected this call the sole winner, so
    // the persisted waybill and the emailed waybill are provably the same (no divergence, and a
    // losing racer never writes tracking onto an order it didn't ship — worker≠checker F068).
    await repo.setTracking(orderId, carrier, trackingNumber);

    // F068 — 발송 알림 이메일. exactly-once는 위 조건부 전이가 보장(승자만 여기 도달). PII-minimal:
    // 주문번호·상품명·택배사(정규 표시명)·운송장·조회 링크만(메시지 타입에 아동 이름/주소 필드 없음).
    // 발송 실패는 배송 전이를 절대 되돌리지 않는다(after + catch, order_confirmation/refund 선례).
    const to_ = order.buyerEmail;
    const orderName = order.orderName;
    const url = trackingUrl(carrier, trackingNumber);
    after(async () => {
      try {
        await emailAdapter().send({
          kind: "order_shipped",
          to: to_,
          orderId,
          orderName,
          carrier: carrierDisplayName(carrier),
          trackingNumber,
          trackingUrl: url,
        });
      } catch (e) {
        console.warn("shipping notification send failed:", redact(String(e))); // shipment already stands
      }
    });
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return {};
}

/**
 * F063 — REFUND: real money moves. Three locks, in order: ① requireAdmin (identity),
 * ② requireApproval("toss.refund.live", token) — the operator pastes the token issued by
 * `pnpm approve toss.refund.live` (guardrails default-deny; the discrete-irreversible-act
 * tool, exactly what ADR-0021 D4 said approval tokens are FOR), ③ the gateway call carries
 * `Idempotency-Key: refund-<orderId>` so a retry can never double-execute. FULL cancel only.
 * On CANCELED: conditional REFUNDED transition (webhook convergence may have won the race —
 * that's success, not an error) + after()-scheduled refund-confirmation email.
 */
export async function refundOrder(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdmin();
  const orderId = String(untrusted(formData.get("orderId")).value ?? "").trim();
  const token = String(formData.get("approvalToken") ?? "").trim();

  try {
    requireApproval("toss.refund.live", token);
  } catch {
    return { error: "승인 토큰이 필요합니다. `pnpm approve toss.refund.live` 발급 토큰을 입력해 주세요." };
  }

  const repo = orderRepo();
  const order = await repo.get(orderId);
  if (!order) return { error: "주문을 찾을 수 없습니다." };
  if (!order.tossPaymentKey) return { error: "결제 이력이 없는 주문입니다." };
  if (!canTransition(order.status, "REFUNDED")) return { error: "현재 상태에서는 환불할 수 없습니다." };

  const provider = order.kind === "CUSTOM" ? customTossProvider() : checkoutProvider();
  const res = await provider.cancelPayment({
    paymentKey: order.tossPaymentKey,
    orderId,
    cancelReason: order.cancelReason ?? "구매자 취소 요청",
  });
  if (res.status !== "CANCELED") {
    return { error: "결제 취소가 승인되지 않았습니다. Toss 대시보드에서 결제 상태를 확인해 주세요." };
  }

  await repo.transition(orderId, ["PAID", "IN_PRODUCTION"], "REFUNDED"); // webhook race → benign no-op

  const to = order.buyerEmail;
  const orderName = order.orderName;
  const amountWon = order.amountWon;
  after(async () => {
    try {
      await emailAdapter().send({ kind: "refund_confirmation", to, orderId, orderName, amountWon });
    } catch (e) {
      console.warn("refund confirmation send failed:", redact(String(e))); // refund already stands
    }
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return {};
}
