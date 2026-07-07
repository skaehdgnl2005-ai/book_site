/**
 * F056 — the login OTP store: the SAME atomic `OtpStore` contract as the mypage order OTP
 * (issue+throttle / verifyDebit / consume — otp.ts is the audited core and is reused wholesale:
 * `generateCode`/`hashCode`/`verifyAndConsume`/limits). Keys are user-scoped subjects
 * (`login:<email(lowercase)>`) instead of order ids; the Prisma backend targets the separate
 * `LoginOtp` table (ADR-0023 D6 — the order-scoped `OtpCode` table stays untouched).
 */
import {
  createInMemoryOtpStore,
  MAX_SENDS_PER_WINDOW,
  SEND_WINDOW_MS,
  TTL_MS,
  MAX_ATTEMPTS,
  type OtpStore,
} from "../../mypage/_lib/otp";
import type { Db } from "../../../lib/db";

/** Caller passes a normalized (lowercase) email — users.ts `normalizeEmail`. */
export function loginSubject(email: string): string {
  return `login:${email}`;
}

// ── Prisma backend — the createPrismaOtpStore SQL against the LoginOtp table/columns ──
type LoginOtpDelegate = {
  findUnique(a: { where: { subject: string }; select: { codeHash: true } }): Promise<{ codeHash: string } | null>;
  updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};
type RawDb = Db & {
  $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<number>;
  loginOtp: LoginOtpDelegate;
};

export function createPrismaLoginOtpStore(getDb: () => Promise<Db>): OtpStore {
  return {
    async issue(subject, codeHash, now = Date.now()) {
      const db = (await getDb()) as RawDb;
      const exp = new Date(now + TTL_MS);
      const ts = new Date(now);
      const cutoff = new Date(now - SEND_WINDOW_MS);
      // ONE atomic statement (the otp.ts idiom): insert OR in-window-under-cap increment OR
      // window-elapsed reset; in-window at cap ⇒ WHERE excludes the UPDATE ⇒ throttled.
      const affected = await db.$executeRaw`
        INSERT INTO "LoginOtp" ("subject","codeHash","expiresAt","attempts","windowStart","sendCount","lastSentAt","consumedAt","createdAt","updatedAt")
        VALUES (${subject}, ${codeHash}, ${exp}, 0, ${ts}, 1, ${ts}, NULL, ${ts}, ${ts})
        ON CONFLICT ("subject") DO UPDATE SET
          "codeHash" = EXCLUDED."codeHash", "expiresAt" = EXCLUDED."expiresAt", "attempts" = 0,
          "consumedAt" = NULL, "lastSentAt" = ${ts}, "updatedAt" = ${ts},
          "windowStart" = CASE WHEN "LoginOtp"."windowStart" > ${cutoff} THEN "LoginOtp"."windowStart" ELSE ${ts} END,
          "sendCount"   = CASE WHEN "LoginOtp"."windowStart" > ${cutoff} THEN "LoginOtp"."sendCount" + 1 ELSE 1 END
        WHERE "LoginOtp"."windowStart" <= ${cutoff} OR "LoginOtp"."sendCount" < ${MAX_SENDS_PER_WINDOW}`;
      return { sent: affected > 0 };
    },
    async verifyDebit(subject, now = Date.now()) {
      const db = (await getDb()) as RawDb;
      const r = await db.loginOtp.updateMany({
        where: { subject, consumedAt: null, expiresAt: { gt: new Date(now) }, attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      if (r.count === 0) return null;
      return db.loginOtp.findUnique({ where: { subject }, select: { codeHash: true } });
    },
    async consume(subject, now = Date.now()) {
      const db = (await getDb()) as RawDb;
      await db.loginOtp.updateMany({ where: { subject, consumedAt: null }, data: { consumedAt: new Date(now) } });
    },
  };
}

// ── Factory (globalThis singletons) — in-memory store is the otp.ts one, keyed by subject ──
const g = globalThis as unknown as { __loginOtpMem?: OtpStore; __loginOtpDb?: OtpStore };
const getDbLazy = (): Promise<Db> => import("../../../lib/db").then((m) => m.getDb());

export function loginOtpStore(): OtpStore {
  if (process.env.DATABASE_URL) return (g.__loginOtpDb ??= createPrismaLoginOtpStore(getDbLazy));
  return (g.__loginOtpMem ??= createInMemoryOtpStore());
}
