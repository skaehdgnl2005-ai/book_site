"use server";

import { revalidatePath } from "next/cache";
import { untrusted } from "@/lib/guardrails";
import { requireApproval } from "@/lib/approval";
import {
  customRequestStore,
  canTransitionCustom,
  type CustomStatus,
} from "@/lib/customRequest";
import { requireAdmin } from "../../_lib/adminAuth";
import { recordAuditSafe } from "../../_lib/auditLog";

/**
 * F061 — admin actions for 맞춤 의뢰. requireAdmin() re-runs INSIDE every action (defense in
 * depth). Status moves re-validate against canTransitionCustom on the OBSERVED status and apply
 * via the conditional write. 상담 확정 is a REAL customer-facing commitment — it executes only
 * behind requireApproval("consultation.book", token): the operator pastes the token issued by
 * `pnpm approve consultation.book` (HITL; guardrails.ts default-deny).
 */

export type CustomAdminState = { error?: string };

const MOVE_TARGETS: readonly CustomStatus[] = ["IN_REVIEW", "IN_PRODUCTION", "COMPLETED", "CANCELLED"];

export async function moveCustomRequest(_prev: CustomAdminState, formData: FormData): Promise<CustomAdminState> {
  const admin = await requireAdmin();
  const id = String(untrusted(formData.get("id")).value ?? "").trim();
  const to = String(untrusted(formData.get("to")).value ?? "").trim() as CustomStatus;
  if (!MOVE_TARGETS.includes(to)) return { error: "허용되지 않은 상태입니다." };

  const rec = await customRequestStore.get(id);
  if (!rec) return { error: "접수 내역을 찾을 수 없습니다." };
  if (!canTransitionCustom(rec.status, to)) return { error: "현재 상태에서 허용되지 않는 전이입니다." };
  const fromStatus = rec.status; // snapshot before update (in-memory store may mutate rec in place)

  const res = await customRequestStore.updateStatus(id, [rec.status], to);
  if (!res.ok) return { error: "이미 처리되었거나 상태가 바뀌었습니다. 새로고침해 주세요." };

  // F073 — 전이 승자만 감사 기록(actor·전후 상태; 의뢰서 PII 미기록). best-effort.
  await recordAuditSafe({
    actorUserId: admin.id,
    action: "custom.move",
    targetType: "customRequest",
    targetId: id,
    before: fromStatus,
    after: to,
  });

  revalidatePath(`/admin/custom/${id}`);
  revalidatePath("/admin/custom");
  return {};
}

export async function confirmConsultationAction(
  _prev: CustomAdminState,
  formData: FormData,
): Promise<CustomAdminState> {
  const admin = await requireAdmin();
  const id = String(untrusted(formData.get("id")).value ?? "").trim();
  const token = String(untrusted(formData.get("approvalToken")).value ?? "").trim();

  try {
    requireApproval("consultation.book", id, token); // F076 — token bound to THIS request + TTL
  } catch {
    return { error: `승인 토큰이 필요합니다. \`pnpm approve consultation.book ${id}\`로 발급한 토큰(이 의뢰·10분 한정)을 입력해 주세요.` };
  }

  const res = await customRequestStore.confirmConsultation(id);
  if (!res.ok) return { error: "확정할 수 있는 상담 요청이 없습니다(이미 확정되었거나 요청 상태가 아님)." };

  // F073 — 상담 확정 감사 기록(actor·전후 상태; 연락처/메모 등 PII 미기록). best-effort.
  await recordAuditSafe({
    actorUserId: admin.id,
    action: "consultation.confirm",
    targetType: "consultation",
    targetId: id,
    before: "REQUESTED",
    after: "CONFIRMED",
  });

  revalidatePath(`/admin/custom/${id}`);
  revalidatePath("/admin/custom");
  return {};
}
