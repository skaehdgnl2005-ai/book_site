"use client";
import { useActionState, useEffect, useState } from "react";
import { closeUnpaidVaOrder, type AdminActionState } from "../_lib/actions";
import styles from "../../admin.module.css";

/**
 * F078 — 미입금(가상계좌) 종료 패널. UI는 게이트가 아니다: 서버 액션이 기한 만료(depositDueDate<now)
 * + 승인 토큰(order.close_unpaid_va — 이 주문·10분 바인딩) + 조건부 전이를 전부 재검증한다. 기한 전에는
 * 종료 불가 안내가 보이고 제출해도 서버가 정직하게 거부한다(은행 비동기 입금과의 경합 봉쇄 — 레드팀 교정).
 */
export function VaClosePanel({ orderId, expired }: { orderId: string; expired: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [state, action, pending] = useActionState(closeUnpaidVaOrder, {} as AdminActionState);

  return (
    <form action={action} className={styles.moveForm} data-testid="va-close-panel">
      <input type="hidden" name="orderId" value={orderId} />
      <p className={styles.note} data-testid="va-close-state">
        {expired
          ? "입금 기한이 지났습니다. 입금이 확인되지 않았다면 주문을 종료(취소)할 수 있어요. 종료 후 뒤늦게 입금이 확인되면 감사 로그에 감지 기록이 남고, 환불은 Toss 대시보드에서 진행합니다(RUNBOOK_VA)."
          : "입금 기한이 지나지 않았습니다. 기한 내 입금은 은행에서 비동기로 도착할 수 있어 기한 전에는 종료할 수 없어요."}
      </p>
      <div className={styles.moveFields}>
        <label className={styles.moveLabel}>
          승인 토큰 (pnpm approve order.close_unpaid_va {orderId})
          <input className={styles.moveInput} name="approvalToken" data-testid="va-close-approval-token" />
        </label>
      </div>
      {state.error ? (
        <p role="alert" className={styles.moveError} data-testid="va-close-error">{state.error}</p>
      ) : null}
      <button type="submit" className="cta" data-testid="va-close-submit" disabled={!mounted || pending}>
        {pending ? "종료 처리 중…" : "미입금 종료 (주문 취소)"}
      </button>
    </form>
  );
}
