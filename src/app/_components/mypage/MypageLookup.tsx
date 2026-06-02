"use client";
import { useActionState } from "react";
import { lookupOrder } from "@/app/mypage/_lib/actions";
import styles from "./mypage.module.css";

/**
 * F017 — order# + email lookup. Progressive-enhancement form posting to the `lookupOrder` server
 * action, which (on a match) sets the capability cookie and redirects to the finishing page; on a
 * mismatch it returns a uniform error (no id-existence oracle). No PII is logged.
 */
export function MypageLookup() {
  const [state, formAction, pending] = useActionState(lookupOrder, {});
  return (
    <section className={styles.panel} aria-label="주문 조회">
      <form className={styles.form} action={formAction}>
        <label className={styles.field}>
          주문번호
          <input
            className={styles.input}
            name="orderId"
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="예: ord_0001"
            data-testid="mypage-lookup-orderid"
          />
        </label>
        <label className={styles.field}>
          결제 이메일
          <input
            className={styles.input}
            name="email"
            type="email"
            autoComplete="off"
            data-testid="mypage-lookup-email"
          />
        </label>
        {state?.error ? (
          <p className={styles.error} role="alert" data-testid="mypage-lookup-error">
            {state.error}
          </p>
        ) : null}
        <button type="submit" className="cta" data-testid="mypage-lookup-submit" disabled={pending}>
          {pending ? "조회 중…" : "조회하기"}
        </button>
      </form>
    </section>
  );
}
