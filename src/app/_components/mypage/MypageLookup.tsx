"use client";
import { useActionState, useEffect, useState } from "react";
import { requestAccessCode, verifyAccessCode, type LookupState } from "@/app/mypage/_lib/actions";
import styles from "./mypage.module.css";

/**
 * F046 — 2-stage mypage entry. Stage 1 posts order# + email to `requestAccessCode` (which always advances
 * to the verify stage — no existence oracle); stage 2 posts the 6-digit OTP to `verifyAccessCode`, which on
 * success mints the capability cookie and redirects. Progressive-enhancement `useActionState` + `<form
 * action>`; the submit is mounted-gated (uncontrolled inputs + `disabled={!mounted || pending}`) so a click
 * can't fire a pre-hydration native submit — the `PhoneForm`/`WrittenForm` hydration-safe pattern. No PII logged.
 */
export function MypageLookup() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [req, reqAction, reqPending] = useActionState(requestAccessCode, {} as LookupState);
  const [ver, verAction, verPending] = useActionState(verifyAccessCode, {} as LookupState);
  const stage = req.stage === "verify" ? "verify" : "request";

  if (stage === "verify") {
    return (
      <section className={styles.panel} aria-label="인증 코드 입력">
        <form className={styles.form} action={verAction}>
          <input type="hidden" name="orderId" defaultValue={req.orderId ?? ""} />
          <p className={styles.note} data-testid="mypage-otp-sent">{req.note}</p>
          <label className={styles.field}>
            인증 코드 (6자리)
            <input
              className={styles.input}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="\d{6}"
              placeholder="예: 424242"
              data-testid="mypage-otp-input"
            />
          </label>
          {ver?.error ? (
            <p className={styles.error} role="alert" data-testid="mypage-otp-error">{ver.error}</p>
          ) : null}
          <button type="submit" className="cta" data-testid="mypage-otp-submit" disabled={!mounted || verPending}>
            {verPending ? "확인 중…" : "코드 확인"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="주문 조회">
      <form className={styles.form} action={reqAction}>
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
        {req?.error ? (
          <p className={styles.error} role="alert" data-testid="mypage-lookup-error">{req.error}</p>
        ) : null}
        <button type="submit" className="cta" data-testid="mypage-lookup-submit" disabled={!mounted || reqPending}>
          {reqPending ? "전송 중…" : "인증 코드 받기"}
        </button>
      </form>
    </section>
  );
}
