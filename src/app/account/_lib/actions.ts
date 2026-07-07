"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { untrusted } from "@/lib/guardrails";
import { emailAdapter } from "@/lib/email";
import { redact } from "@/lib/env";
import { generateCode, hashCode, verifyAndConsume } from "../../mypage/_lib/otp";
import { accessSecret } from "../../mypage/_lib/access";
import { loginOtpStore, loginSubject } from "./loginOtp";
import { userRepo, normalizeEmail } from "./users";
import { getSessionUser, setSessionCookie, clearSessionCookie } from "./sessionUser";
import { orderRepo } from "../../api/payments/_lib/orders";

/**
 * F056 server actions — 이메일 OTP 로그인(=가입 통합). Thin glue over the audited otp.ts core
 * (canonical gate → atomic debit → constant-time compare → mint-before-consume) + the session
 * cookie. Login == signup, so EVERY well-formed email gets a code (no existence oracle exists to
 * hide; volume is capped by the per-subject 5-sends/1h window). PII (email/code) never logged.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // the checkout/customRequest discipline

const LOGIN_NOTE = "인증 코드를 이메일로 보냈습니다. 10분 안에 입력해 주세요.";
const LOGIN_BAD = "인증 코드가 올바르지 않거나 만료되었습니다. 다시 시도해 주세요.";
const LOGIN_CLOSED = "로그인이 일시적으로 제한되어 있습니다. 잠시 후 다시 시도해 주세요.";

export type LoginState = { stage?: "request" | "verify"; email?: string; error?: string; note?: string };

export async function requestLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = normalizeEmail(untrusted(String(formData.get("email") ?? "")).value);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { stage: "request", error: "올바른 이메일을 입력해 주세요." };
  }
  const subject = loginSubject(email);
  const code = generateCode();
  const { sent } = await loginOtpStore().issue(subject, hashCode(subject, code));
  if (sent) {
    after(async () => {
      try {
        await emailAdapter().send({ kind: "login_otp", to: email, code });
      } catch (e) {
        console.warn("login otp send failed:", redact(String(e))); // recoverable by re-request
      }
    });
  }
  // Throttled (!sent) shows the SAME note — the per-subject cap must not leak send-rate state.
  return { stage: "verify", email, note: LOGIN_NOTE };
}

export async function verifyLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = normalizeEmail(untrusted(String(formData.get("email") ?? "")).value);
  const code = String(formData.get("code") ?? "").trim();
  if (!EMAIL_RE.test(email)) return { stage: "request", error: "올바른 이메일을 입력해 주세요." };

  const subject = loginSubject(email);
  // mint here only checks the signing secret (sync) — the real session mints after the user
  // upsert below; both use the same secret, so a passing check cannot fail later.
  const result = await verifyAndConsume(loginOtpStore(), subject, code, () =>
    accessSecret() ? "session" : null,
  );
  if ("error" in result) {
    return { stage: "verify", email, error: result.error === "closed" ? LOGIN_CLOSED : LOGIN_BAD };
  }

  const user = await userRepo().upsertByEmail(email); // login == signup (email ownership proven)
  // F057 — email ownership is proven RIGHT NOW: retroactively claim this email's guest orders
  // (idempotent conditional write; an already-claimed order never changes owners).
  await orderRepo().claimByEmail(email, user.id);
  if (!(await setSessionCookie(user))) {
    return { stage: "verify", email, error: LOGIN_CLOSED };
  }
  redirect("/account");
}

export async function logout(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}

/** ADR-0023 D3 — epoch+1 invalidates EVERY outstanding session token for this user. */
export async function logoutAllDevices(): Promise<void> {
  const user = await getSessionUser();
  if (user) await userRepo().bumpSessionEpoch(user.id);
  await clearSessionCookie();
  redirect("/login");
}
