/**
 * F092 — 전환 지표(퍼스트파티) 도메인. 구매 퍼널의 page_view / scroll / cta_click 이벤트를
 * 닫힌 어휘로 검증해 append 적재하고, 관리자 페이지가 원시 건수·고유 세션 수를 집계한다.
 * 두 백엔드(hermetic in-memory / Prisma) 뒤의 저장소 — auditLog.ts(F073) 선례.
 *
 * PII 원칙(E3): 이벤트에는 익명 sessionId·정규화된 경로·닫힌 이름/임계값만 들어간다.
 * 쿼리스트링은 정규화 단계에서 폐기하고, 어휘 밖 입력은 저장 전에 드롭한다(오류 응답도 없음 —
 * 비컨 싱크는 csp-report처럼 조용히 버린다). 구매자 이름/이메일 등은 구조적으로 실을 수 없다.
 *
 * Imports are RELATIVE (vitest has no @/ alias) — the src/lib/* / api/_lib convention.
 */
import type { Db } from "../../../../lib/db";
import { redact } from "../../../../lib/env";
import { CTA_NAMES, SCROLL_DEPTHS, type EventKind } from "./eventVocab";

/** 검증을 통과한 저장 입력 — 이 5필드 외에는 어떤 것도 적재되지 않는다. */
export interface AnalyticsEventInput {
  kind: EventKind;
  name: string | null;
  path: string;
  value: number | null;
  sessionId: string;
}
export interface AnalyticsEvent extends AnalyticsEventInput {
  id: string;
  createdAt: string; // ISO
}

// ── 경로 정규화(순수) — 추적 어휘 밖 경로·쿼리·과대 입력은 null(드롭) ─────────────
const TRACKED_EXACT = new Set([
  "/",
  "/anniversary",
  "/first-moments",
  "/custom",
  "/cart",
  "/checkout",
  "/checkout/success",
  "/checkout/failed",
  "/brand-story",
  "/login",
  "/account",
  "/reviews",
]);
// 실 카탈로그 키에 언더스코어가 있다(hundred_days 등 5/8종) — 적대적 검수 확정 #1.
const ORDER_KEY_RE = /^\/order\/[a-z0-9_-]{1,64}$/;

export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200 || !raw.startsWith("/")) return null;
  const bare = raw.split(/[?#]/, 1)[0];
  const p = bare.length > 1 && bare.endsWith("/") ? bare.slice(0, -1) : bare;
  if (TRACKED_EXACT.has(p)) return p;
  if (p === "/mypage" || p.startsWith("/mypage/")) return "/mypage";
  // 주문번호는 준식별자 — 경로 차원에서 일반화해 보관하지 않는다.
  if (p.startsWith("/orders/")) return "/orders/[id]";
  if (ORDER_KEY_RE.test(p)) return p; // 템플릿 키는 상품 식별자(PII 아님) — 템플릿별 전환에 사용
  return null;
}

// ── 검증(순수) — 브라우저 입력은 untrusted: 닫힌 어휘 밖이면 전부 거부 ────────────
const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export type ValidateResult = { ok: true; value: AnalyticsEventInput } | { ok: false; errors: string[] };

export function validateEvent(input: unknown): ValidateResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["잘못된 요청입니다."] };
  }
  const o = input as Record<string, unknown>;
  const kind = o.kind;
  if (kind !== "page_view" && kind !== "scroll" && kind !== "cta_click") {
    return { ok: false, errors: ["알 수 없는 이벤트 종류입니다."] };
  }
  if (typeof o.sessionId !== "string" || !SESSION_ID_RE.test(o.sessionId)) {
    return { ok: false, errors: ["세션 식별자 형식이 아닙니다."] };
  }
  const path = normalizePath(o.path);
  if (path === null) return { ok: false, errors: ["추적 대상 경로가 아닙니다."] };
  let name: string | null = null;
  let value: number | null = null;
  if (kind === "cta_click") {
    if (typeof o.name !== "string" || !(CTA_NAMES as readonly string[]).includes(o.name)) {
      return { ok: false, errors: ["알 수 없는 CTA입니다."] };
    }
    name = o.name;
  }
  if (kind === "scroll") {
    if (typeof o.value !== "number" || !(SCROLL_DEPTHS as readonly number[]).includes(o.value)) {
      return { ok: false, errors: ["스크롤 임계값이 아닙니다."] };
    }
    value = o.value;
  }
  return { ok: true, value: { kind, name, path, value, sessionId: o.sessionId } };
}

// ── 집계 어휘 — 양 백엔드가 같은 술어를 공유한다(matchesEvent ↔ buildEventWhere) ──
export interface EventMatch {
  kind: EventKind;
  name?: string;
  path?: string;
  paths?: string[]; // 목록 내 일치(OR) — 카테고리 2종 묶음
  pathPrefix?: string; // startsWith — /order/ 묶음 (path/paths와 배타적으로 사용)
  value?: number;
  createdFrom?: string; // ISO, 포함
  createdTo?: string; // ISO, 배타 — 반개구간 [from, to) (F089 선례)
}

export interface AnalyticsStore {
  /** append-only 적재. 저장된 이벤트를 돌려준다. */
  record(input: AnalyticsEventInput): Promise<AnalyticsEvent>;
  /** 술어에 맞는 원시 이벤트 건수(전량 — take 없음, F082 정직성). */
  countEvents(match: EventMatch): Promise<number>;
  /** 술어에 맞는 고유 sessionId 수(전량) — 퍼널의 단계 값. */
  countSessions(match: EventMatch): Promise<number>;
}

export function matchesEvent(e: AnalyticsEvent, m: EventMatch): boolean {
  if (e.kind !== m.kind) return false;
  if (m.name !== undefined && e.name !== m.name) return false;
  if (m.path !== undefined && e.path !== m.path) return false;
  if (m.paths !== undefined && !m.paths.includes(e.path)) return false;
  if (m.pathPrefix !== undefined && !e.path.startsWith(m.pathPrefix)) return false;
  if (m.value !== undefined && e.value !== m.value) return false;
  // ISO 문자열을 epoch으로 비교 — Prisma의 timestamp gte/lt와 동형(포맷 편차에도 안전).
  if (m.createdFrom !== undefined && Date.parse(e.createdAt) < Date.parse(m.createdFrom)) return false;
  if (m.createdTo !== undefined && Date.parse(e.createdAt) >= Date.parse(m.createdTo)) return false;
  return true;
}

// ── In-memory backend (hermetic; used when no DATABASE_URL) ────────────────────
/** in-memory 보존 상한 — 초과 시 최고령부터 드롭(무한 증가 방지; dev/E2E 전용 백엔드라 허용). */
export const MEM_EVENT_CAP = 10_000;

export function createAnalyticsStore(): AnalyticsStore {
  const rows: AnalyticsEvent[] = [];
  let seq = 0;
  return {
    async record(input) {
      const stored: AnalyticsEvent = {
        id: `evt_${(++seq).toString(36).padStart(4, "0")}`,
        ...input,
        createdAt: new Date().toISOString(),
      };
      rows.push(stored);
      if (rows.length > MEM_EVENT_CAP) rows.splice(0, rows.length - MEM_EVENT_CAP);
      return stored;
    },
    async countEvents(m) {
      return rows.filter((e) => matchesEvent(e, m)).length;
    },
    async countSessions(m) {
      return new Set(rows.filter((e) => matchesEvent(e, m)).map((e) => e.sessionId)).size;
    },
  };
}

// ── Pure mapping: domain ↔ Prisma (no DB, no @prisma/client) — unit-tested ──────
export type EventCreateData = {
  kind: string;
  name: string | null;
  path: string;
  value: number | null;
  sessionId: string;
};
export function buildEventCreateData(input: AnalyticsEventInput): EventCreateData {
  return {
    kind: input.kind,
    name: input.name ?? null,
    path: input.path,
    value: input.value ?? null,
    sessionId: input.sessionId,
  };
}

export type EventRow = {
  id: string;
  kind: string;
  name: string | null;
  path: string;
  value: number | null;
  sessionId: string;
  createdAt: Date | string;
};
export function mapEventRow(row: EventRow): AnalyticsEvent {
  return {
    id: row.id,
    kind: row.kind as EventKind,
    name: row.name,
    path: row.path,
    value: row.value,
    sessionId: row.sessionId,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString(),
  };
}

export function buildEventWhere(m: EventMatch): Record<string, unknown> {
  const where: Record<string, unknown> = { kind: m.kind };
  if (m.name !== undefined) where.name = m.name;
  if (m.path !== undefined) where.path = m.path;
  if (m.paths !== undefined) where.path = { in: m.paths };
  if (m.pathPrefix !== undefined) where.path = { startsWith: m.pathPrefix };
  if (m.value !== undefined) where.value = m.value;
  if (m.createdFrom !== undefined || m.createdTo !== undefined) {
    const createdAt: Record<string, string> = {};
    if (m.createdFrom !== undefined) createdAt.gte = m.createdFrom;
    if (m.createdTo !== undefined) createdAt.lt = m.createdTo;
    where.createdAt = createdAt;
  }
  return where;
}

/**
 * 고유 세션 수를 DB에서 COUNT(DISTINCT)로 센다 — groupBy로 세션 전량을 메모리에 실체화하면
 * sessionId 카디널리티(비인증 엔드포인트라 외부 통제)만큼 어드민 렌더가 부풀어 DoS가 된다
 * (적대적 검수 확정 #3). 식별자는 전부 정적 리터럴, 값은 $n 바인딩 — 주입 면역.
 * 의미론은 matchesEvent/buildEventWhere와 동형(유닛으로 고정): IN 목록, starts_with 접두,
 * 반개구간 [from, to). path/paths/pathPrefix는 계약상 상호 배타(동시 사용 금지).
 */
export function buildSessionCountSql(m: EventMatch): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const bind = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };
  const conds: string[] = [`"kind" = ${bind(m.kind)}`];
  if (m.name !== undefined) conds.push(`"name" = ${bind(m.name)}`);
  if (m.path !== undefined) conds.push(`"path" = ${bind(m.path)}`);
  if (m.paths !== undefined) {
    if (m.paths.length === 0) conds.push("FALSE"); // IN () 구문 오류 방지 — 공집합은 항상 거짓
    else conds.push(`"path" IN (${m.paths.map((x) => bind(x)).join(", ")})`);
  }
  if (m.pathPrefix !== undefined) conds.push(`starts_with("path", ${bind(m.pathPrefix)})`);
  if (m.value !== undefined) conds.push(`"value" = ${bind(m.value)}`);
  if (m.createdFrom !== undefined) conds.push(`"createdAt" >= ${bind(new Date(m.createdFrom))}`);
  if (m.createdTo !== undefined) conds.push(`"createdAt" < ${bind(new Date(m.createdTo))}`);
  return {
    sql: `SELECT COUNT(DISTINCT "sessionId")::int AS count FROM "AnalyticsEvent" WHERE ${conds.join(" AND ")}`,
    params,
  };
}

// ── Prisma backend (used when DATABASE_URL is set) ─────────────────────────────
type EventDelegate = {
  create(args: { data: EventCreateData }): Promise<EventRow>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
};
// otp.ts/loginOtp.ts 선례 — raw 접근은 구조적 캐스트로(생성 클라이언트 타입 미의존).
type RawDb = Db & {
  $queryRawUnsafe: (sql: string, ...values: unknown[]) => Promise<Array<{ count: number }>>;
};

export function createPrismaAnalyticsStore(getDb: () => Promise<Db>): AnalyticsStore {
  return {
    async record(input) {
      const db = await getDb();
      const row = await (db.analyticsEvent as EventDelegate).create({ data: buildEventCreateData(input) });
      return mapEventRow(row);
    },
    async countEvents(m) {
      const db = await getDb();
      return (db.analyticsEvent as EventDelegate).count({ where: buildEventWhere(m) });
    },
    async countSessions(m) {
      const db = (await getDb()) as RawDb;
      const { sql, params } = buildSessionCountSql(m);
      const rows = await db.$queryRawUnsafe(sql, ...params);
      return rows[0]?.count ?? 0;
    },
  };
}

// ── Factory: Prisma when DATABASE_URL is set, else in-memory (hermetic) ─────────
const g = globalThis as unknown as { __analyticsStoreMem?: AnalyticsStore; __analyticsStoreDb?: AnalyticsStore };
const getDbLazy = (): Promise<Db> => import("../../../../lib/db").then((m) => m.getDb());

export function analyticsStore(): AnalyticsStore {
  if (process.env.DATABASE_URL) return (g.__analyticsStoreDb ??= createPrismaAnalyticsStore(getDbLazy));
  return (g.__analyticsStoreMem ??= createAnalyticsStore());
}

/**
 * best-effort 적재 — 지표 쓰기 실패가 사용자 요청을 실패시키지 않는다(recordAuditSafe 선례).
 * 실패는 redact()로 마스킹해 warn만 남긴다(이벤트에 PII가 없어도 방어적).
 */
export async function recordEventSafe(input: AnalyticsEventInput): Promise<void> {
  try {
    await analyticsStore().record(input);
  } catch (e) {
    console.warn("analytics event write failed:", redact(String(e)));
  }
}
