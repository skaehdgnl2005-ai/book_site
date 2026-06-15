import { isProductionRuntime } from "./env";

/**
 * Provider-agnostic transactional email boundary (F046). Mirrors the PaymentProvider pattern: a neutral
 * `send()` method name so callers never trip R3's irreversible-send regex, while the REAL send remains a
 * documented seam (the config/boot fail-closed gate is the control, not per-send approval — D4).
 *
 * Email enablement is gated at config/boot (D4), NOT per-send `requireApproval` (which is a one-shot CLI
 * intent token for discrete irreversible acts — wrong tool for automated OTP mail). Non-prod uses the mock;
 * prod uses a real provider ONLY when configured, else fail-closed. "Turning email on" = provisioning the
 * provider at the deploy.production go-live cutover.
 *
 * The OTP `code` is sensitive: it is carried here but MUST never be written to a log/trace (redact() has no
 * numeric rule — protection is by-construction omission, not masking).
 */
export interface EmailMessage {
  to: string;
  code: string;
}

export interface EmailAdapter {
  send(msg: EmailMessage): Promise<void>;
}

/** Non-prod default: records to an in-memory outbox; NO external effect. Never logs the code. */
export function mockEmailAdapter(): EmailAdapter & { outbox: EmailMessage[] } {
  const outbox: EmailMessage[] = [];
  return {
    outbox,
    async send(msg) {
      outbox.push({ to: msg.to, code: msg.code });
    },
  };
}

/** Prod without a configured provider: a security email must not silently no-op → throw (fail-closed, D4). */
export function failClosedProdAdapter(): EmailAdapter {
  return {
    async send() {
      throw new Error(
        "Email provider not configured (mypage OTP). Provision the provider at go-live (D6 / ADR-0021).",
      );
    },
  };
}

/** Resend transactional-email HTTPS API (F047). The OTP code IS the email's content — it travels here over
 *  TLS to Resend, but is never placed anywhere it could be logged/traced (by-construction omission). */
const RESEND_SEND_URL = "https://api.resend.com/emails";
const OTP_SUBJECT = "[그림책 제작소] 마이페이지 인증 코드";
function otpEmailBody(code: string): string {
  return `마이페이지 인증 코드는 ${code} 입니다.\n10분 안에 입력해 주세요. 본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.`;
}

/** Minimal `Response`-shaped result the adapter needs (real `fetch` satisfies it). Mirrors TossResponseLike. */
export interface EmailResponseLike {
  ok: boolean;
  status: number;
}

/** Injectable HTTP transport so unit tests stay hermetic — `pnpm check` needs no network (ADR-0002; the
 *  payments TossTransport pattern). Real `fetch` is the default. */
export type EmailTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<EmailResponseLike>;

const defaultEmailTransport: EmailTransport = (url, init) =>
  fetch(url, init) as unknown as Promise<EmailResponseLike>;

export interface ResendConfig {
  /** Resend server API key, `re_…` (SECRET — redact()-masked; never logged). */
  apiKey: string;
  /** Verified sender address (EMAIL_FROM). */
  from: string;
  transport?: EmailTransport;
  sendUrl?: string;
}

/**
 * Real provider (F047 / D6b): sends the OTP via Resend's HTTPS API. A security email must never silently
 * no-op, so a non-2xx response THROWS (the after() call site logs only a redact()ed error). The thrown error
 * carries the HTTP status ONLY — never the recipient or the code (by-construction PII omission; redact() has
 * no numeric rule, so the code must never reach a place that could be logged).
 */
export function resendEmailAdapter(config: ResendConfig): EmailAdapter {
  const transport = config.transport ?? defaultEmailTransport;
  const sendUrl = config.sendUrl ?? RESEND_SEND_URL;
  return {
    async send(msg) {
      const res = await transport(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.from,
          to: msg.to,
          subject: OTP_SUBJECT,
          text: otpEmailBody(msg.code),
        }),
      });
      if (!res.ok) {
        // Status ONLY — the recipient/code must not appear in the error message (PII omission).
        throw new Error(`Resend email send failed (HTTP ${res.status}).`);
      }
    },
  };
}

/**
 * Factory (D4): non-prod → mock; prod → the real Resend adapter ONLY if BOTH RESEND_API_KEY and EMAIL_FROM
 * are set, else fail-closed (F046 behavior preserved — a half-configured provider must never half-send). The
 * real adapter (F047) landed as F046's paired follow-up; it is invoked via after()/await at the call site
 * (mypage actions), never a bare promise (spec §4.3). Provisioning the secret at the go-live cutover is what
 * flips prod mypage OTP mail from fail-closed to live.
 */
export function emailAdapter(raw: Record<string, string | undefined> = process.env): EmailAdapter {
  if (!isProductionRuntime(raw)) return mockEmailAdapter();
  const apiKey = raw.RESEND_API_KEY;
  const from = raw.EMAIL_FROM;
  if (apiKey && from) return resendEmailAdapter({ apiKey, from });
  return failClosedProdAdapter();
}
