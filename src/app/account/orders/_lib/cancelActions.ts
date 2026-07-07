"use server";

import { revalidatePath } from "next/cache";
import { untrusted } from "@/lib/guardrails";
import { orderRepo } from "@/app/api/payments/_lib/orders";
import { hasOrderAccess } from "@/app/mypage/_lib/orderAccess";

/**
 * F062 — the buyer's cancel REQUEST (a wish, not the refund: money moves only through F063's
 * requireApproval-gated flow). Gate = hasOrderAccess (capability cookie OR session ownership —
 * the shared mypage predicate), so both the guest and member surfaces post here. ONE conditional
 * write records it: still-cancellable status (PAID/IN_PRODUCTION) AND no prior request.
 * The reason is buyer free text (potential PII) — rendered to the owner/admin only, never logged.
 */

export type CancelRequestState = { error?: string };

const MAX_REASON = 500;

export async function requestOrderCancel(
  _prev: CancelRequestState,
  formData: FormData,
): Promise<CancelRequestState> {
  const orderId = String(untrusted(formData.get("orderId")).value ?? "").trim();
  const reason = String(untrusted(formData.get("reason")).value ?? "").trim();

  if (!(await hasOrderAccess(orderId))) {
    return { error: "접근 권한을 확인할 수 없습니다. 주문을 다시 조회해 주세요." };
  }
  if (!reason) return { error: "취소 사유를 입력해 주세요." };
  if (reason.length > MAX_REASON) return { error: `취소 사유는 ${MAX_REASON}자 이내로 입력해 주세요.` };

  const res = await orderRepo().requestCancel(orderId, reason);
  if (!res.ok) {
    return { error: "취소 요청을 접수할 수 없습니다. 이미 접수되었거나, 배송이 시작된 주문입니다." };
  }

  revalidatePath(`/account/orders/${orderId}`);
  revalidatePath(`/mypage/${orderId}`);
  revalidatePath("/admin/orders");
  return {};
}
