"use client";
import { useActionState, useEffect, useState } from "react";
import {
  moveCustomRequest,
  confirmConsultationAction,
  type CustomAdminState,
} from "../_lib/actions";
import type { CustomStatus, ConsultationStatus } from "@/lib/customRequest";
import styles from "../../admin.module.css";

const NEXT_MOVE: Partial<Record<CustomStatus, { to: CustomStatus; label: string }>> = {
  SUBMITTED: { to: "IN_REVIEW", label: "검토 시작 (검토중으로)" },
  IN_REVIEW: { to: "IN_PRODUCTION", label: "제작 시작 (제작중으로)" },
  IN_PRODUCTION: { to: "COMPLETED", label: "제작 완료 처리" },
};

/**
 * F061 — 의뢰 상태 이동 + 상담 확정 패널. 전진 이동 1개 + (활성 상태에서) 취소를 렌더;
 * 서버 액션이 어차피 재검증한다(UX ≠ 게이트). 상담 확정은 승인 토큰 입력이 필수 —
 * `pnpm approve consultation.book`이 발급한 토큰 없이는 서버가 default-deny.
 */
export function CustomAdminPanel({
  id,
  status,
  consultationStatus,
}: {
  id: string;
  status: CustomStatus;
  consultationStatus: ConsultationStatus | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [moveState, moveAction, movePending] = useActionState(moveCustomRequest, {} as CustomAdminState);
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmConsultationAction,
    {} as CustomAdminState,
  );

  const forward = NEXT_MOVE[status];
  const cancellable = status === "PENDING_PAYMENT" || status === "SUBMITTED" || status === "IN_REVIEW" || status === "IN_PRODUCTION";

  return (
    <>
      {forward || cancellable ? (
        <div className={styles.moveForm}>
          {moveState.error ? (
            <p role="alert" className={styles.moveError} data-testid="custom-move-error">{moveState.error}</p>
          ) : null}
          <div className={styles.moveFields}>
            {forward ? (
              <form action={moveAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="to" value={forward.to} />
                <button type="submit" className="cta" data-testid={`custom-move-${forward.to}`} disabled={!mounted || movePending}>
                  {movePending ? "처리 중…" : forward.label}
                </button>
              </form>
            ) : null}
            {cancellable ? (
              <form action={moveAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="to" value="CANCELLED" />
                <button type="submit" className={styles.filterLink} data-testid="custom-move-CANCELLED" disabled={!mounted || movePending}>
                  의뢰 취소
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      {consultationStatus === "REQUESTED" ? (
        <form action={confirmAction} className={styles.moveForm}>
          <input type="hidden" name="id" value={id} />
          <div className={styles.moveFields}>
            <label className={styles.moveLabel}>
              승인 토큰 (pnpm approve consultation.book)
              <input className={styles.moveInput} name="approvalToken" data-testid="custom-approval-token" />
            </label>
          </div>
          {confirmState.error ? (
            <p role="alert" className={styles.moveError} data-testid="custom-confirm-error">{confirmState.error}</p>
          ) : null}
          <button type="submit" className="cta" data-testid="custom-confirm-consultation" disabled={!mounted || confirmPending}>
            {confirmPending ? "처리 중…" : "상담 예약 확정"}
          </button>
        </form>
      ) : null}
    </>
  );
}
