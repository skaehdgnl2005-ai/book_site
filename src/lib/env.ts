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

  // F046 (kept as a SEPARATE block from the live-key check above for clean merge vs F045's TOSS_WEBHOOK_SECRET
  // work). VERCEL_ENV typo backstop, then the required-in-prod secret.
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
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "***@***");
}
