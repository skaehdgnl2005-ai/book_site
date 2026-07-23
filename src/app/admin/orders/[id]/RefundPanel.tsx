"use client";
import { useActionState, useEffect, useState } from "react";
import { refundOrder, type AdminActionState } from "../_lib/actions";
import styles from "../../admin.module.css";

/**
 * F063 — 환불 승인 패널. 승인 토큰(`pnpm approve toss.refund.live` 발급) 없이는 서버가
 * default-deny — 이 입력칸이 곧 HITL 게이트의 UI다. 부모(page)가 환불 가능 상태
 * (PAID/IN_PRODUCTION + 결제키 보유)에서만 렌더한다; 서버 액션이 어차피 재검증한다.
 */
export function RefundPanel({ orderId, cancelRequested }: { orderId: string; cancelRequested: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [state, action, pending] = useActionState(refundOrder, {} as AdminActionState);

  return (
    <form action={action} className={styles.moveForm} data-testid="refund-panel">
      <input type="hidden" name="orderId" value={orderId} />
      <p className={styles.note}>
        {cancelRequested
          ? "구매자의 취소 요청이 접수된 주문입니다. 환불은 전액 취소로 실행됩니다."
          : "취소 요청이 없는 주문입니다. 환불이 필요한 경우에만 실행해 주세요 (전액 취소)."}
      </p>
      <div className={styles.moveFields}>
        <label className={styles.moveLabel}>
          승인 토큰 (pnpm approve toss.refund.live {orderId})
          <input className={styles.moveInput} name="approvalToken" data-testid="refund-approval-token" />
        </label>
      </div>
      {state.error ? (
        <p role="alert" className={styles.moveError} data-testid="refund-error">{state.error}</p>
      ) : null}
      <button type="submit" className="cta" data-testid="refund-submit" disabled={!mounted || pending}>
        {pending ? "환불 처리 중…" : "환불 승인 (전액 취소)"}
      </button>
    </form>
  );
}
