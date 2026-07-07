import { z } from "zod";

/**
 * Validated environment contract.
 *
 * - Fails fast on boot with a model-readable error (G-ERR), never dumping secret
 *   values into the message.
 * - Refuses TossPayments LIVE keys outside production (G-HITL / E-safety): real
 *   charges are an irreversible action and must go through the approval gate
 *   (scripts/approve.mjs + src/lib/guardrails.requireApproval). TossPayments keys are
 *   `test_sk_…`/`test_ck_…` (test) vs `live_sk_…`/`live_ck_…` (live).
 */
const schema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  // Direct/session connection for Prisma migrations (pooled DATABASE_URL can't run DDL).
  DIRECT_URL: z.string().url().optional(),
  // Supabase Storage for durable upload bytes (server-only; service_role bypasses RLS — never NEXT_PUBLIC).
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().optional(),
  TOSS_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_TOSS_CLIENT_KEY: z.string().optional(),
  TOSS_WEBHOOK_SECRET: z.string().optional(),
  BASE_URL: z.string().url().default("http://localhost:3000"),
  // HMAC key for the mypage OTP-hash + capability cookie (F046). Required in production (boot check below);
  // non-prod uses access.ts's deterministic dev fallback.
  MYPAGE_ACCESS_SECRET: z.string().optional(),
  // Resend transactional-email provider (F047). BOTH must be set to enable real prod mypage OTP mail; either
  // missing ⇒ prod stays fail-closed (F046 behavior — deliberately NOT a boot refusal, so a prod build still
  // boots; the email send fail-closes at the adapter). RESEND_API_KEY is a secret (re_… ; redact()-masked).
  RESEND_API_KEY: z.string().optional(),
  // Verified sender address for the OTP mail (e.g. no-reply@<verified-domain>); the Resend `from`.
  EMAIL_FROM: z.string().optional(),
  // Kakao OAuth (F058, ADR-0023 D4). BOTH secrets are server-only (never NEXT_PUBLIC). Missing in
  // prod ⇒ the kakao login start simply fails closed (redirect back to /login) — not a boot refusal,
  // matching the email-provider rollout pattern. Non-prod uses the sandbox provider (no network).
  KAKAO_REST_API_KEY: z.string().optional(),
  KAKAO_CLIENT_SECRET: z.string().optional(),
  // 관리자 allowlist (F059, ADR-0024): 콤마 구분 이메일, lowercase 비교. 프로덕션 미설정 ⇒
  // /admin 전면 deny(404). 비프로덕션은 hermetic E2E용 결정적 폴백(admin@example.com — adminAuth.ts).
  ADMIN_EMAILS: z.string().optional(),
});

/**
 * Host-independent production marker (F046). A single hand-set APP_ENV (schema default "development") would
 * be one point of failure for all prod gates; cross-check Vercel's injected VERCEL_ENV so a mistyped/omitted
 * APP_ENV on Vercel can't silently fail open. The VERCEL_ENV half protects Vercel only (our deploy target);
 * on a non-Vercel host this falls back to APP_ENV alone (re-check then). The deterministic-OTP ⟺ mock-adapter
 * invariant (otp.ts/email.ts) is the host-independent backstop.
 */
export function isProductionRuntime(raw: Record<string, string | undefined> = process.env): boolean {
  return raw.APP_ENV === "production" || raw.VERCEL_ENV === "production";
}

export type Env = z.infer<typeof schema>;

export function parseEnv(raw: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n- ${issues.join("\n- ")}`);
  }
  const env = parsed.data;

  const live =
    env.TOSS_SECRET_KEY?.startsWith("live_sk_") === true ||
    env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.startsWith("live_ck_") === true;
  if (live && env.APP_ENV !== "production") {
    throw new Error(
      "Refusing to boot: TossPayments LIVE key detected outside production. " +
        "Dev and verification use TEST keys only; live charges require the " +
        "approval gate (pnpm approve toss.charge.live).",
    );
  }

  // F045: the inbound-webhook shared token authenticates Toss PAYMENT_STATUS_CHANGED
  // NOTIFICATIONs (the payment safety-net) and gates the prod re-query path. Missing it in
  // production leaves async PAID settlement unauthenticated — fail fast (never logs the value).
  if (env.APP_ENV === "production" && !env.TOSS_WEBHOOK_SECRET) {
    throw new Error(
      "Refusing to boot: TOSS_WEBHOOK_SECRET is required in production " +
        "(authenticates inbound Toss payment webhooks; without it the payment safety-net is open).",
    );
  }
  // F046 prod-boot backstops (keep all three throws — dropping any is a fail-open regression).
  if (raw.VERCEL_ENV === "production" && env.APP_ENV !== "production") {
    throw new Error(
      "Refusing to boot: VERCEL_ENV=production but APP_ENV!==production — set APP_ENV=production.",
    );
  }
  if (isProductionRuntime(raw) && !env.MYPAGE_ACCESS_SECRET) {
    throw new Error(
      "Refusing to boot: MYPAGE_ACCESS_SECRET is required in production (mypage buyer auth).",
    );
  }
  return env;
}

/** Redact secrets / PII before any value reaches logs or traces (E3). */
export function redact(value: string): string {
  return value
    // TossPayments keys: test_sk_/test_ck_/live_sk_/live_ck_
    .replace(/((?:test|live)_(?:sk|ck)_)[A-Za-z0-9]+/g, "$1***")
    // Legacy Stripe key shapes (defence in depth — should never appear post-F003)
    .replace(/((?:sk|pk)_(?:live|test)_)[A-Za-z0-9]+/g, "$1***")
    // Supabase keys: new sb_secret_/sb_publishable_ AND legacy service_role JWTs (eyJ….eyJ….sig).
    // The service_role key bypasses RLS — this is the backstop so it can never leak via a trace/error.
    .replace(/(sb_(?:secret|publishable)_)[A-Za-z0-9_-]+/g, "$1***")
    .replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "eyJ***.***.***")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "***@***")
    // Resend transactional-email API keys: re_… (F047). MUST run AFTER the email rule above — masking injects
    // '*' (outside that rule's local-part class), so an earlier re_ pass would strand a re_-prefixed email's
    // domain (PII regression caught in review). Left anchor (?<![A-Za-z0-9]) blocks intra-word matches
    // ("more_"/"pre_") while still masking a key that follows '_' or a delimiter.
    .replace(/(?<![A-Za-z0-9])(re_)[A-Za-z0-9_]+/g, "$1***");
}
