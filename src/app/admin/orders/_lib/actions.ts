"use server";

import { revalidatePath } from "next/cache";
import { untrusted } from "@/lib/guardrails";
import { orderRepo, type OrderStatus } from "@/app/api/payments/_lib/orders";
import { canTransition } from "@/app/api/payments/_lib/status";
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

  if (to === "SHIPPED") {
    // SHIPPED requires the shipment record — enter carrier + number in the same move.
    const carrier = String(untrusted(formData.get("trackingCarrier")).value ?? "").trim();
    const trackingNumber = String(untrusted(formData.get("trackingNumber")).value ?? "").trim();
    if (!carrier || !trackingNumber) return { error: "택배사와 운송장 번호를 입력해 주세요." };
    if (carrier.length > 60 || trackingNumber.length > 60) return { error: "운송장 정보가 너무 깁니다." };
    await repo.setTracking(orderId, carrier, trackingNumber);
  }

  const res = await repo.transition(orderId, [order.status], to);
  if (!res.ok) return { error: "이미 처리되었거나 상태가 바뀌었습니다. 새로고침해 주세요." };

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return {};
}
