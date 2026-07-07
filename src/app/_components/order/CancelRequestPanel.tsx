"use client";
import { useActionState, useEffect, useState } from "react";
import {
  requestOrderCancel,
  type CancelRequestState,
} from "@/app/account/orders/_lib/cancelActions";
import type { OrderStatus } from "@/app/api/payments/_lib/orders";
import styles from "../mypage/mypage.module.css";

/**
 * F062 — 취소 요청 패널 (account 상세 + mypage 공용). 상태별 3분기:
 * 이미 접수 → 접수 안내 / PAID·IN_PRODUCTION → 사유 폼(제작 착수 후 거부 가능 고지) /
 * SHIPPED 이후 → 고객센터 안내. 서버 액션이 접근·상태·중복을 재검증한다(UX ≠ 게이트).
 */
export function CancelRequestPanel({
  orderId,
  status,
  cancelRequestedAt,
}: {
  orderId: string;
  status: OrderStatus;
  cancelRequestedAt: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [state, action, pending] = useActionState(requestOrderCancel, {} as CancelRequestState);

  if (cancelRequestedAt) {
    return (
      <p className={styles.note} data-testid="cancel-requested">
        취소 요청이 접수되었습니다 ({cancelRequestedAt.slice(0, 10)}). 확인 후 순차적으로 처리해 드릴게요.
      </p>
    );
  }

  if (status === "PAID" || status === "IN_PRODUCTION") {
    return (
      <form action={action} className={styles.form} data-testid="cancel-form">
        <input type="hidden" name="orderId" value={orderId} />
        <label className={styles.note} htmlFor="cancel-reason">
          취소 사유 — 한 아이만을 위한 맞춤 제작 특성상, 제작이 이미 시작된 경우 취소가 어려울 수 있어요.
        </label>
        <textarea
          id="cancel-reason"
          name="reason"
          rows={2}
          className={styles.control}
          data-testid="cancel-reason"
        />
        {state.error ? (
          <p role="alert" className={styles.error} data-testid="cancel-error">{state.error}</p>
        ) : null}
        <button type="submit" className="cta" data-testid="cancel-submit" disabled={!mounted || pending}>
          {pending ? "접수 중…" : "취소 요청"}
        </button>
      </form>
    );
  }

  if (status === "SHIPPED" || status === "COMPLETED") {
    return (
      <p className={styles.note} data-testid="cancel-contact-cs">
        배송이 시작된 주문은 온라인 취소가 어려워요. 문의 페이지를 통해 고객센터로 연락해 주세요.
      </p>
    );
  }

  return null; // CREATED / CANCELLED / REFUNDED — nothing to request here
}
