/**
 * F073 — 관리자 감사 로그(AdminAuditLog) 도메인. 관리자 변이(주문/맞춤 전이·환불·상담 확정)마다
 * 행위자·액션·대상·전후 상태를 append 기록한다. 두 백엔드(hermetic in-memory / Prisma) 뒤의 저장소.
 *
 * ADR-0024 D2(관리자 PII 미로깅) — 이 저장소에는 actorUserId(내부 User.id)·action·target(type/id)·
 * before/after(상태 enum 문자열)만 넣는다. 구매자 이름/이메일/주소 등 PII는 호출부에서 절대 넘기지 않는다.
 *
 * Imports are RELATIVE (vitest has no @/ alias) — the src/lib/* / api/_lib convention (reviews.ts 선례).
 */
import type { Db } from "../../../lib/db";
import { redact } from "../../../lib/env";

export type AuditAction =
  | "order.advance"
  | "order.refund"
  | "custom.move"
  | "consultation.confirm"
  // F078 — 입금대기(가상계좌) 운영: 관리자 미입금 종료 + 종료 후 뒤늦은 입금 감지(웹훅 발신, actor "system").
  | "order.close_unpaid_va"
  | "order.late_deposit";

/**
 * 호출부가 넘기는 감사 항목. before/after는 상태 문자열(없으면 생략) — PII는 절대 담지 않는다.
 * actorUserId는 관리자 변이면 내부 User.id, 시스템 발신 감지(웹훅 등)면 리터럴 "system"(F078).
 */
export type AuditEntry = {
  actorUserId: string;
  action: AuditAction;
  targetType: "order" | "customRequest" | "consultation";
  targetId: string;
  before?: string | null;
  after?: string | null;
};
export type StoredAuditEntry = Required<AuditEntry> & { id: string; createdAt: string };

export interface AuditStore {
  /** append-only 기록. 저장된 항목을 돌려준다. */
  record(entry: AuditEntry): Promise<StoredAuditEntry>;
  /** 최신순(bounded take, 기본 100). */
  listRecent(opts?: { take?: number }): Promise<StoredAuditEntry[]>;
}

// ── In-memory backend (hermetic; used when no DATABASE_URL) ────────────────────
export function createAuditStore(): AuditStore {
  const rows: StoredAuditEntry[] = [];
  let seq = 0;
  return {
    async record(entry) {
      const stored: StoredAuditEntry = {
        id: `aud_${(++seq).toString(36).padStart(4, "0")}`,
        actorUserId: entry.actorUserId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        before: entry.before ?? null,
        after: entry.after ?? null,
        createdAt: new Date().toISOString(),
      };
      rows.push(stored);
      return stored;
    },
    async listRecent(opts = {}) {
      // seq는 단조 증가 → 삽입 역순이 최신순(동일 ms createdAt 타이 방지: seq 기준 안정 정렬).
      return [...rows].reverse().slice(0, opts.take ?? 100);
    },
  };
}

// ── Pure mapping: domain ↔ Prisma (no DB, no @prisma/client) — unit-tested ──────
export type AuditCreateData = {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: string | null;
  after: string | null;
};
export function buildAuditCreateData(entry: AuditEntry): AuditCreateData {
  return {
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  };
}

export type AuditRow = {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: string | null;
  after: string | null;
  createdAt: Date | string;
};
export function mapAuditRow(row: AuditRow): StoredAuditEntry {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    action: row.action as AuditAction,
    targetType: row.targetType as AuditEntry["targetType"],
    targetId: row.targetId,
    before: row.before,
    after: row.after,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString(),
  };
}

// ── Prisma backend (used when DATABASE_URL is set) ─────────────────────────────
type AuditDelegate = {
  create(args: { data: AuditCreateData }): Promise<AuditRow>;
  findMany(args: {
    orderBy: Array<{ createdAt?: "desc"; id?: "desc" }>;
    take?: number;
  }): Promise<AuditRow[]>;
};

export function createPrismaAuditStore(getDb: () => Promise<Db>): AuditStore {
  return {
    async record(entry) {
      const db = await getDb();
      const row = await (db.adminAuditLog as AuditDelegate).create({ data: buildAuditCreateData(entry) });
      return mapAuditRow(row);
    },
    async listRecent(opts = {}) {
      const db = await getDb();
      // createdAt은 밀리초 정밀도라 동일 ms 타이가 가능 — id를 2차 키로 두어 결정적 정렬(백엔드 간 편차 방지).
      const rows = await (db.adminAuditLog as AuditDelegate).findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: opts.take ?? 100,
      });
      return rows.map(mapAuditRow);
    },
  };
}

// ── Factory: Prisma when DATABASE_URL is set, else in-memory (hermetic) ─────────
const g = globalThis as unknown as { __auditStoreMem?: AuditStore; __auditStoreDb?: AuditStore };
const getDbLazy = (): Promise<Db> => import("../../../lib/db").then((m) => m.getDb());

export function auditStore(): AuditStore {
  if (process.env.DATABASE_URL) return (g.__auditStoreDb ??= createPrismaAuditStore(getDbLazy));
  return (g.__auditStoreMem ??= createAuditStore());
}

/**
 * best-effort 기록 — 이미 성공한 변이를 감사 로그 쓰기 실패로 되돌리지 않는다(발송 실패가 배송/환불을
 * 되돌리지 않는 선례). 실패는 redact()로 마스킹해 warn만 남긴다(엔트리에 PII가 없어도 방어적).
 */
export async function recordAuditSafe(entry: AuditEntry): Promise<void> {
  try {
    await auditStore().record(entry);
  } catch (e) {
    console.warn("admin audit log write failed:", redact(String(e)));
  }
}
