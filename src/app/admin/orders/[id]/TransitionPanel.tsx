"use client";
import { useActionState, useEffect, useState } from "react";
import { advanceOrder, type AdminActionState } from "../_lib/actions";
import type { OrderStatus } from "@/app/api/payments/_lib/orders";
import styles from "../../admin.module.css";

/**
 * F060 — the status-move panel for one order. Renders ONLY the move the transition table
 * allows from the current status (the server action re-validates anyway — this is UX, not
 * the gate). SHIPPED collects the shipment record in the same submit. Mounted-gated submit
 * (the WrittenForm hydration-safe pattern).
 */
export function TransitionPanel({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [state, action, pending] = useActionState(advanceOrder, {} as AdminActionState);

  if (status === "PAID") {
    return (
      <form action={action} className={styles.moveForm}>
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="to" value="IN_PRODUCTION" />
        {state.error ? <p role="alert" className={styles.moveError} data-testid="admin-move-error">{state.error}</p> : null}
        <button type="submit" className="cta" data-testid="admin-move-in-production" disabled={!mounted || pending}>
          {pending ? "처리 중…" : "제작 시작 (제작중으로)"}
        </button>
      </form>
    );
  }

  if (status === "IN_PRODUCTION") {
    return (
      <form action={action} className={styles.moveForm}>
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="to" value="SHIPPED" />
        <div className={styles.moveFields}>
          <label className={styles.moveLabel}>
            택배사
            <input className={styles.moveInput} name="trackingCarrier" data-testid="admin-tracking-carrier" />
          </label>
          <label className={styles.moveLabel}>
            운송장 번호
            <input className={styles.moveInput} name="trackingNumber" data-testid="admin-tracking-number" />
          </label>
        </div>
        {state.error ? <p role="alert" className={styles.moveError} data-testid="admin-move-error">{state.error}</p> : null}
        <button type="submit" className="cta" data-testid="admin-move-shipped" disabled={!mounted || pending}>
          {pending ? "처리 중…" : "배송 시작 (배송중으로)"}
        </button>
      </form>
    );
  }

  if (status === "SHIPPED") {
    return (
      <form action={action} className={styles.moveForm}>
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="to" value="COMPLETED" />
        {state.error ? <p role="alert" className={styles.moveError} data-testid="admin-move-error">{state.error}</p> : null}
        <button type="submit" className="cta" data-testid="admin-move-completed" disabled={!mounted || pending}>
          {pending ? "처리 중…" : "배송 완료 처리"}
        </button>
      </form>
    );
  }

  return null; // CREATED / terminal states: no forward move from here (F062/F063 own cancel/refund)
}
