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
// F084 — treat an empty-string env var as "unset". The app's convention: a FALSY DATABASE_URL means
// "no DB, use in-memory" (orders.ts), and hermetic E2E/dev blank DATABASE_URL/DIRECT_URL/SUPABASE_URL
// to "" to force that path. Plain z.string().url() rejects "", so once parseEnv actually runs at boot
// (instrumentation.ts) it would crash a correctly-configured hermetic/dev server — this coercion keeps
// "" as absent while a NON-empty malformed url is still rejected.
const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional());

const schema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: optionalUrl,
  // Direct/session connection for Prisma migrations (pooled DATABASE_URL can't run DDL).
  DIRECT_URL: optionalUrl,
  // Supabase Storage for durable upload bytes (server-only; service_role bypasses RLS — never NEXT_PUBLIC).
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().optional(),
  TOSS_SECRET_KEY: z.string().optional(),
  // API 개별 연동 키(ck) — 결제창(payment(), 맞춤 written flow). publishable.
  NEXT_PUBLIC_TOSS_CLIENT_KEY: z.string().optional(),
  // F069 — 결제위젯 연동 키(gck) — 결제위젯(widgets(), 엔트리 체크아웃 간편결제). 위 ck 키와 상호
  // 배타적(SDK가 키 타입을 강제: widgets()는 ck 거부, payment()는 gck 거부)이라 별도 변수. publishable.
  NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY: z.string().optional(),
  TOSS_WEBHOOK_SECRET: z.string().optional(),
  BASE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().default("http://localhost:3000")),
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
  // F074 — 비프로덕션 인증 지름길(결정론적 OTP·DEV_ADMIN_RE·카카오 샌드박스) 옵트인. "true"/"1"일 때만
  // 활성(devAuthEnabled). 프로덕션에서는 무시. 미설정 = 비프로덕션에서도 fail-closed(공개 staging 보호).
  ALLOW_DEV_AUTH: z.string().optional(),
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

/**
 * F074 — 비프로덕션 개발/E2E 인증 지름길(결정론적 OTP 424242 · 관리자 DEV_ADMIN_RE 폴백 · 카카오
 * 샌드박스 신원 발급)의 단일 fail-closed 게이트. 프로덕션에서는 언제나 false(우회 불가). 비프로덕션에서도
 * ALLOW_DEV_AUTH가 명시적으로 켜져야만 true — 공개된 preview/staging(플래그 미설정 non-prod)에서 아무나
 * 세션/관리자를 발급받는 무자격 접근을 막는다(레드팀: sbx_email·DEV_ADMIN_RE·OTP 세 경로 공통 옵트인).
 */
export function devAuthEnabled(raw: Record<string, string | undefined> = process.env): boolean {
  if (isProductionRuntime(raw)) return false;
  // F086 — APP_ENV-independent tripwire. A real production server (`next start`, incl. a self-hosted /
  // non-Vercel box) sets NODE_ENV=production even when the operator forgot APP_ENV=production. The dev-auth
  // shortcuts (deterministic OTP, admin allowlist fallback, Kakao sandbox identity) must NEVER activate
  // there, whatever ALLOW_DEV_AUTH says. `next dev` (local + hermetic E2E) and vitest are NOT production.
  if (raw.NODE_ENV === "production") return false;
  return raw.ALLOW_DEV_AUTH === "true" || raw.ALLOW_DEV_AUTH === "1";
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
    env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.startsWith("live_ck_") === true ||
    env.NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY?.startsWith("live_gck_") === true;
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
  // F086 — the dev-auth opt-in must NEVER coincide with a production runtime. isProductionRuntime covers
  // Vercel/APP_ENV; NODE_ENV=production additionally catches a self-hosted `next start` that forgot
  // APP_ENV=production. Fail-fast (loud) so a mis-flagged public box can't silently serve the
  // deterministic OTP / admin-allowlist fallback / Kakao-sandbox identity — defense-in-depth with the
  // devAuthEnabled() runtime gate above.
  const devAuthOptIn = raw.ALLOW_DEV_AUTH === "true" || raw.ALLOW_DEV_AUTH === "1";
  if (devAuthOptIn && (isProductionRuntime(raw) || raw.NODE_ENV === "production")) {
    throw new Error(
      "Refusing to boot: ALLOW_DEV_AUTH is enabled on a production runtime " +
        "(APP_ENV/VERCEL_ENV=production, or NODE_ENV=production). The dev-auth shortcuts " +
        "(deterministic OTP, admin allowlist fallback, Kakao sandbox identity) must never run in " +
        "production — unset ALLOW_DEV_AUTH.",
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
