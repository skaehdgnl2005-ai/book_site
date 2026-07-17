"use server";

import { revalidatePath } from "next/cache";
import { untrusted } from "@/lib/guardrails";
import { hasOrderAccess } from "@/app/mypage/_lib/orderAccess";
import { orderRepo } from "@/app/api/payments/_lib/orders";
import { isPaidFamily } from "@/app/api/payments/_lib/status";
import { validateReview, reviewStore } from "./reviews";

/**
 * F071 — submit a 구매 인증 후기. Two gates before the store: (1) 작성 권한 — hasOrderAccess (the
 * mypage guest-capability-OR-member-session predicate, reused), and (2) 구매 인증 — the order must be
 * in the paid family (결제 완료). Input is untrusted() at the boundary + shape-validated. One review
 * per order (the store's conditional create + the @unique column).
 */
export type ReviewActionState = { error?: string; ok?: boolean };

export async function submitReview(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const orderId = String(untrusted(formData.get("orderId")).value ?? "").trim();
  if (!orderId) return { error: "주문 정보가 없습니다." };
  if (!(await hasOrderAccess(orderId))) return { error: "후기 작성 권한이 없습니다." };

  const order = await orderRepo().get(orderId);
  if (!order || !isPaidFamily(order.status)) {
    return { error: "결제 완료된 주문만 후기를 작성할 수 있어요." };
  }

  const parsed = validateReview(orderId, {
    rating: untrusted(formData.get("rating")).value,
    body: untrusted(formData.get("body")).value,
    authorName: untrusted(formData.get("authorName")).value,
  });
  if (!parsed.ok) return { error: parsed.errors[0] };

  const res = await reviewStore().create(parsed.draft);
  if (!res.ok) return { error: "이미 이 주문으로 후기를 작성했어요." };

  revalidatePath("/reviews");
  revalidatePath(`/mypage/${orderId}`);
  return { ok: true };
}
