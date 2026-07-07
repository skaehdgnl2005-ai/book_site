/**
 * F056 (ADR-0023) — the User repository. Passwordless membership: a user is created the first
 * time an email proves ownership via the login OTP (login == signup), or via Kakao OAuth (F058).
 * Two backends behind one async surface (the orders.ts pattern): in-memory (hermetic `pnpm
 * check`/Playwright) + Prisma when DATABASE_URL is set. Emails are normalized to lowercase at
 * this boundary. Email addresses are PII — never logged/traced.
 */
import type { Db } from "../../../lib/db";

export type StoredUser = {
  id: string;
  email: string | null; // lowercase; null = Kakao signup without email consent (F058)
  emailVerifiedAt: string | null;
  displayName: string | null;
  kakaoId: string | null;
  sessionEpoch: number;
  createdAt: string;
};

export function normalizeEmail(v: unknown): string {
  return (typeof v === "string" ? v : "").trim().toLowerCase();
}

export interface UserRepo {
  get(id: string): Promise<StoredUser | undefined>;
  findByEmail(email: string): Promise<StoredUser | undefined>;
  /** login == signup: return the user owning this (verified) email, creating one if absent. */
  upsertByEmail(email: string, now?: number): Promise<StoredUser>;
  /** "모든 기기에서 로그아웃": every outstanding session token carries the OLD epoch → invalid. */
  bumpSessionEpoch(id: string): Promise<StoredUser | undefined>;
}

// ── In-memory backend (hermetic) ────────────────────────────────────────────────
export function createInMemoryUserRepo(): UserRepo {
  const byId = new Map<string, StoredUser>();
  let seq = 0;
  const findEmail = (email: string) =>
    [...byId.values()].find((u) => u.email === email);
  return {
    async get(id) {
      return byId.get(id);
    },
    async findByEmail(email) {
      return findEmail(normalizeEmail(email));
    },
    async upsertByEmail(email, now = Date.now()) {
      const norm = normalizeEmail(email);
      const existing = findEmail(norm);
      if (existing) return existing;
      const user: StoredUser = {
        id: `usr_${(++seq).toString(36).padStart(4, "0")}`,
        email: norm,
        emailVerifiedAt: new Date(now).toISOString(),
        displayName: null,
        kakaoId: null,
        sessionEpoch: 0,
        createdAt: new Date(now).toISOString(),
      };
      byId.set(user.id, user);
      return user;
    },
    async bumpSessionEpoch(id) {
      const user = byId.get(id);
      if (!user) return undefined;
      user.sessionEpoch += 1;
      return user;
    },
  };
}

// ── Prisma backend (DATABASE_URL set) — structural delegate (no generated client) ──
type UserRow = {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | string | null;
  displayName: string | null;
  kakaoId: string | null;
  sessionEpoch: number;
  createdAt: Date | string;
};
type UserDelegate = {
  findUnique(a: { where: { id: string } | { email: string } }): Promise<UserRow | null>;
  upsert(a: {
    where: { email: string };
    update: Record<string, never>;
    create: { email: string; emailVerifiedAt: Date };
  }): Promise<UserRow>;
  update(a: { where: { id: string }; data: { sessionEpoch: { increment: number } } }): Promise<UserRow>;
};

function toIso(v: Date | string | null): string | null {
  return v === null ? null : typeof v === "string" ? v : v.toISOString();
}
function mapUserRow(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: toIso(row.emailVerifiedAt),
    displayName: row.displayName,
    kakaoId: row.kakaoId,
    sessionEpoch: row.sessionEpoch,
    createdAt: toIso(row.createdAt) ?? "",
  };
}

export function createPrismaUserRepo(getDb: () => Promise<Db>): UserRepo {
  return {
    async get(id) {
      const db = await getDb();
      const row = await (db.user as UserDelegate).findUnique({ where: { id } });
      return row ? mapUserRow(row) : undefined;
    },
    async findByEmail(email) {
      const db = await getDb();
      const row = await (db.user as UserDelegate).findUnique({ where: { email: normalizeEmail(email) } });
      return row ? mapUserRow(row) : undefined;
    },
    async upsertByEmail(email, now = Date.now()) {
      const db = await getDb();
      const norm = normalizeEmail(email);
      // Atomic find-or-create on the unique email (concurrent first logins converge on one row).
      const row = await (db.user as UserDelegate).upsert({
        where: { email: norm },
        update: {},
        create: { email: norm, emailVerifiedAt: new Date(now) },
      });
      return mapUserRow(row);
    },
    async bumpSessionEpoch(id) {
      const db = await getDb();
      try {
        const row = await (db.user as UserDelegate).update({
          where: { id },
          data: { sessionEpoch: { increment: 1 } },
        });
        return mapUserRow(row);
      } catch {
        return undefined; // unknown id — Prisma update throws
      }
    },
  };
}

// ── Factory (globalThis singletons — the orders.ts pattern) ─────────────────────
const g = globalThis as unknown as { __userRepoMem?: UserRepo; __userRepoDb?: UserRepo };
const getDbLazy = (): Promise<Db> => import("../../../lib/db").then((m) => m.getDb());

export function userRepo(): UserRepo {
  if (process.env.DATABASE_URL) return (g.__userRepoDb ??= createPrismaUserRepo(getDbLazy));
  return (g.__userRepoMem ??= createInMemoryUserRepo());
}
