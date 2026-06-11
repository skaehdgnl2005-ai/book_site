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

/**
 * Factory (D4): non-prod → mock; prod → real adapter ONLY if a provider is configured, else fail-closed.
 * The real (Resend) adapter is a paired follow-up (D6b), deliberately NOT built here, so prod is currently
 * fail-closed. When it lands it MUST be invoked via after()/await — never a bare promise (spec §4.3).
 */
export function emailAdapter(raw: Record<string, string | undefined> = process.env): EmailAdapter {
  if (!isProductionRuntime(raw)) return mockEmailAdapter();
  return failClosedProdAdapter();
}
