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
});

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
