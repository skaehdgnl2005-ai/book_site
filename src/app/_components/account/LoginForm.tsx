"use client";
import { useActionState, useEffect, useState } from "react";
import { requestLoginCode, verifyLoginCode, type LoginState } from "@/app/account/_lib/actions";
import { UnderlineField } from "../form/UnderlineField";
import styles from "../mypage/mypage.module.css";

/**
 * F056 — 2-stage passwordless login (=signup). Stage 1 posts the email to `requestLoginCode`
 * (always advances with a uniform note); stage 2 posts the 6-digit OTP to `verifyLoginCode`,
 * which on success sets the account session cookie and redirects to /account. The MypageLookup
 * clone: `useActionState` progressive enhancement + mounted-gated submit (no pre-hydration
 * native submit). Styles reuse the mypage panel kit. No PII logged.
 */
export function LoginForm() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [req, reqAction, reqPending] = useActionState(requestLoginCode, {} as LoginState);
  const [ver, verAction, verPending] = useActionState(verifyLoginCode, {} as LoginState);
  const stage = ver.stage === "request" ? "request" : req.stage === "verify" ? "verify" : "request";

  if (stage === "verify") {
    return (
      <section className={styles.panel} aria-label="인증 코드 입력">
        <form className={styles.form} action={verAction}>
          <input type="hidden" name="email" defaultValue={req.email ?? ""} />
          <p className={styles.note} data-testid="login-otp-sent">{req.note}</p>
          <UnderlineField
            label="인증 코드 (6자리)"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="\d{6}"
            placeholder="예: 424242"
            data-testid="login-otp-input"
          />
          {ver?.error ? (
            <p className={styles.error} role="alert" data-testid="login-otp-error">{ver.error}</p>
          ) : null}
          <button type="submit" className="cta" data-testid="login-otp-submit" disabled={!mounted || verPending}>
            {verPending ? "확인 중…" : "코드 확인하고 로그인"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="이메일 로그인">
      <form className={styles.form} action={reqAction}>
        <UnderlineField
          label="이메일"
          name="email"
          type="email"
          autoComplete="email"
          data-testid="login-email"
        />
        {req?.error ? (
          <p className={styles.error} role="alert" data-testid="login-email-error">{req.error}</p>
        ) : null}
        <button type="submit" className="cta" data-testid="login-submit" disabled={!mounted || reqPending}>
          {reqPending ? "전송 중…" : "인증 코드 받기"}
        </button>
      </form>
    </section>
  );
}
