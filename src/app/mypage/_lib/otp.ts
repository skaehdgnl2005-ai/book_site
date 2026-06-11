import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { accessSecret } from "./access"; // reuse MYPAGE_ACCESS_SECRET — NO new secret (access.ts unchanged)
import { isProductionRuntime } from "../../../lib/env";
import type { Db } from "../../../lib/db";

/**
 * Mypage buyer-auth OTP (F046). One active code per order; ALL mutations are atomic conditional writes
 * (markPaid idiom + one INSERT…ON CONFLICT for issue) so the store survives Vercel multi-instance. The
 * plaintext code NEVER enters the store — only its order-bound HMAC. Backends: in-memory (hermetic) +
 * Prisma (DATABASE_URL set). See docs/superpowers/specs/2026-06-11-f046-buyer-auth-design.md.
 */
export const TTL_MS = 10 * 60 * 1000;
export const SEND_WINDOW_MS = 60 * 60 * 1000;
export const MAX_SENDS_PER_WINDOW = 5;
export const MAX_ATTEMPTS = 5;
export const OTP_TEST_CODE = "424242"; // deterministic non-prod code (gated by isProductionRuntime; spec §9/K)

/** Canonical 6 ASCII digits. Prod: CSPRNG. Non-prod: deterministic so hermetic E2E knows it. */
export function generateCode(env: Record<string, string | undefined> = process.env): string {
  if (isProductionRuntime(env)) return String(randomInt(0, 1_000_000)).padStart(6, "0");
  return OTP_TEST_CODE;
}

/** HMAC(secret, `${orderId}.${code}`) hex — binds the hash to the order; reuses the mypage access secret. */
export function hashCode(
  orderId: string,
  code: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const secret = accessSecret(env);
  if (!secret) throw new Error("no MYPAGE_ACCESS_SECRET"); // fail-closed (boot already guards prod)
  return createHmac("sha256", secret).update(`${orderId}.${code}`).digest("hex");
}

/** Constant-time hex compare (caller compares hashCode(input) against the stored codeHash). */
export function codeHashEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export interface OtpStore {
  /** Atomic issue+throttle: replaces the code (fresh window or in-window-under-cap) else throttles (no send). */
  issue(orderId: string, codeHash: string, now?: number): Promise<{ sent: boolean }>;
  /** Atomic debit: increments attempts iff live & under cap; returns the charged row's codeHash, else null. */
  verifyDebit(orderId: string, now?: number): Promise<{ codeHash: string } | null>;
  /** Atomic single-use claim (idempotent). */
  consume(orderId: string, now?: number): Promise<void>;
}

type Row = {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  windowStart: number;
  sendCount: number;
  consumedAt: number | null;
};

// ── In-memory (hermetic; JS single-thread serializes → matches the atomic Prisma semantics) ──
export function createInMemoryOtpStore(): OtpStore {
  const m = new Map<string, Row>();
  return {
    async issue(orderId, codeHash, now = Date.now()) {
      const e = m.get(orderId);
      const fresh = !e || now - e.windowStart >= SEND_WINDOW_MS;
      if (e && !fresh && e.sendCount >= MAX_SENDS_PER_WINDOW) return { sent: false }; // throttled: no replace
      m.set(orderId, {
        codeHash,
        expiresAt: now + TTL_MS,
        attempts: 0,
        consumedAt: null,
        windowStart: fresh ? now : e!.windowStart,
        sendCount: fresh ? 1 : e!.sendCount + 1,
      });
      return { sent: true };
    },
    async verifyDebit(orderId, now = Date.now()) {
      const e = m.get(orderId);
      if (!e || e.consumedAt !== null || now >= e.expiresAt || e.attempts >= MAX_ATTEMPTS) return null;
      e.attempts += 1; // debit
      return { codeHash: e.codeHash };
    },
    async consume(orderId, now = Date.now()) {
      const e = m.get(orderId);
      if (e && e.consumedAt === null) e.consumedAt = now;
    },
  };
}

// ── Prisma (DATABASE_URL set) — atomic conditional writes. Structural delegate type (DB-independent). ──
type OtpDelegate = {
  findUnique(a: { where: { orderId: string }; select: { codeHash: true } }): Promise<{ codeHash: string } | null>;
  updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};
type RawDb = Db & {
  $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<number>;
  otpCode: OtpDelegate;
};

export function createPrismaOtpStore(getDb: () => Promise<Db>): OtpStore {
  return {
    async issue(orderId, codeHash, now = Date.now()) {
      const db = (await getDb()) as RawDb;
      const exp = new Date(now + TTL_MS);
      const ts = new Date(now);
      const cutoff = new Date(now - SEND_WINDOW_MS);
      // ONE atomic statement: insert OR (in-window & under cap → increment) OR (window elapsed → reset);
      // in-window & at cap ⇒ WHERE excludes the UPDATE ⇒ 0 rows ⇒ throttled. Identifiers per the migration.
      const affected = await db.$executeRaw`
        INSERT INTO "OtpCode" ("orderId","codeHash","expiresAt","attempts","windowStart","sendCount","lastSentAt","consumedAt","createdAt","updatedAt")
        VALUES (${orderId}, ${codeHash}, ${exp}, 0, ${ts}, 1, ${ts}, NULL, ${ts}, ${ts})
        ON CONFLICT ("orderId") DO UPDATE SET
          "codeHash" = EXCLUDED."codeHash", "expiresAt" = EXCLUDED."expiresAt", "attempts" = 0,
          "consumedAt" = NULL, "lastSentAt" = ${ts}, "updatedAt" = ${ts},
          "windowStart" = CASE WHEN "OtpCode"."windowStart" > ${cutoff} THEN "OtpCode"."windowStart" ELSE ${ts} END,
          "sendCount"   = CASE WHEN "OtpCode"."windowStart" > ${cutoff} THEN "OtpCode"."sendCount" + 1 ELSE 1 END
        WHERE "OtpCode"."windowStart" <= ${cutoff} OR "OtpCode"."sendCount" < ${MAX_SENDS_PER_WINDOW}`;
      return { sent: affected > 0 };
    },
    async verifyDebit(orderId, now = Date.now()) {
      const db = (await getDb()) as RawDb;
      const r = await db.otpCode.updateMany({
        where: { orderId, consumedAt: null, expiresAt: { gt: new Date(now) }, attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      if (r.count === 0) return null;
      return db.otpCode.findUnique({ where: { orderId }, select: { codeHash: true } });
    },
    async consume(orderId, now = Date.now()) {
      const db = (await getDb()) as RawDb;
      await db.otpCode.updateMany({ where: { orderId, consumedAt: null }, data: { consumedAt: new Date(now) } });
    },
  };
}

// ── Factory: Prisma when DATABASE_URL is set, else in-memory (hermetic) — the orders.ts pattern ──
const g = globalThis as unknown as { __otpMem?: OtpStore; __otpDb?: OtpStore };
const getDbLazy = (): Promise<Db> => import("../../../lib/db").then((m) => m.getDb());

export function otpStore(): OtpStore {
  if (process.env.DATABASE_URL) return (g.__otpDb ??= createPrismaOtpStore(getDbLazy));
  return (g.__otpMem ??= createInMemoryOtpStore());
}
