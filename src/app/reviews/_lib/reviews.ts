/**
 * F071 — 구매 인증 후기(Review) 도메인. 순수 검증(validateReview) + 두 백엔드(hermetic in-memory /
 * Prisma) 뒤의 저장소. 작성 권한(주문 소유)은 서버 액션(actions.ts)에서 hasOrderAccess로 게이트하고,
 * 이 모듈은 형태 검증 + 저장/조회만 담당한다(모든 입력은 untrusted 취급). 주문당 후기 1개(@unique).
 *
 * Imports are RELATIVE (vitest has no @/ alias) — the src/lib/* / api/_lib convention.
 */
import type { Db } from "../../../lib/db";

export type ReviewDraft = { orderId: string; rating: number; body: string; authorName: string };
export type StoredReview = ReviewDraft & { id: string; createdAt: string };

export const RATING_MIN = 1;
export const RATING_MAX = 5;
const BODY_MAX = 1000;
const NAME_MAX = 40;

type ValidateResult = { ok: true; draft: ReviewDraft } | { ok: false; errors: string[] };

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Validate an untrusted review payload for a given order. Pure (no DB/network). */
export function validateReview(orderId: string, value: unknown): ValidateResult {
  const body = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const id = orderId.trim();
  if (!id) return { ok: false, errors: ["주문 정보가 없습니다."] };

  const ratingRaw = typeof body.rating === "number" ? body.rating : Number(asString(body.rating));
  if (!Number.isInteger(ratingRaw) || ratingRaw < RATING_MIN || ratingRaw > RATING_MAX) {
    return { ok: false, errors: [`별점을 ${RATING_MIN}~${RATING_MAX} 중에서 선택해 주세요.`] };
  }
  const text = asString(body.body).trim();
  if (!text) return { ok: false, errors: ["후기 내용을 입력해 주세요."] };
  if (text.length > BODY_MAX) return { ok: false, errors: [`후기는 ${BODY_MAX}자 이내로 입력해 주세요.`] };

  const authorName = asString(body.authorName).trim() || "구매자";
  if (authorName.length > NAME_MAX) return { ok: false, errors: [`표시 이름은 ${NAME_MAX}자 이내로 입력해 주세요.`] };

  return { ok: true, draft: { orderId: id, rating: ratingRaw, body: text, authorName } };
}

export interface ReviewStore {
  /** One review per order: succeeds only if none exists yet for the order (idempotent guard). */
  create(draft: ReviewDraft): Promise<{ ok: boolean; review?: StoredReview }>;
  /** Published reviews, newest first (bounded take, default 50). */
  listPublished(opts?: { take?: number }): Promise<StoredReview[]>;
  /** Whether the order already has a review (drives the write form's shown/hidden state). */
  hasReviewFor(orderId: string): Promise<boolean>;
}

// ── In-memory backend (hermetic; used when no DATABASE_URL) ────────────────────
export function createReviewStore(): ReviewStore {
  const byId = new Map<string, StoredReview>();
  const byOrder = new Map<string, string>(); // orderId → reviewId
  let seq = 0;
  return {
    async create(draft) {
      if (byOrder.has(draft.orderId)) return { ok: false }; // one per order
      const id = `rev_${(++seq).toString(36).padStart(4, "0")}`;
      const review: StoredReview = { ...draft, id, createdAt: new Date().toISOString() };
      byId.set(id, review);
      byOrder.set(draft.orderId, id);
      return { ok: true, review };
    },
    async listPublished(opts = {}) {
      return [...byId.values()]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, opts.take ?? 50);
    },
    async hasReviewFor(orderId) {
      return byOrder.has(orderId);
    },
  };
}

// ── Pure mapping: domain ↔ Prisma (no DB, no @prisma/client) — unit-tested ──────
export type ReviewCreateData = { orderId: string; rating: number; body: string; authorName: string };
export function buildReviewCreateData(draft: ReviewDraft): ReviewCreateData {
  return { orderId: draft.orderId, rating: draft.rating, body: draft.body, authorName: draft.authorName };
}

export type ReviewRow = {
  id: string;
  orderId: string;
  rating: number;
  body: string;
  authorName: string;
  createdAt: Date | string;
};
export function mapReviewRow(row: ReviewRow): StoredReview {
  return {
    id: row.id,
    orderId: row.orderId,
    rating: row.rating,
    body: row.body,
    authorName: row.authorName,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString(),
  };
}

// ── Prisma backend (used when DATABASE_URL is set) ─────────────────────────────
type ReviewDelegate = {
  create(args: { data: ReviewCreateData }): Promise<ReviewRow>;
  findMany(args: { orderBy: { createdAt: "desc" }; take?: number }): Promise<ReviewRow[]>;
  findUnique(args: { where: { orderId: string } }): Promise<ReviewRow | null>;
};

export function createPrismaReviewStore(getDb: () => Promise<Db>): ReviewStore {
  return {
    async create(draft) {
      const db = await getDb();
      const delegate = db.review as ReviewDelegate;
      if (await delegate.findUnique({ where: { orderId: draft.orderId } })) return { ok: false };
      try {
        const row = await delegate.create({ data: buildReviewCreateData(draft) });
        return { ok: true, review: mapReviewRow(row) };
      } catch {
        // Unique-constraint race (a concurrent create won) — one review per order holds.
        return { ok: false };
      }
    },
    async listPublished(opts = {}) {
      const db = await getDb();
      const rows = await (db.review as ReviewDelegate).findMany({ orderBy: { createdAt: "desc" }, take: opts.take ?? 50 });
      return rows.map(mapReviewRow);
    },
    async hasReviewFor(orderId) {
      const db = await getDb();
      return (await (db.review as ReviewDelegate).findUnique({ where: { orderId } })) !== null;
    },
  };
}

// ── Factory: Prisma when DATABASE_URL is set, else in-memory (hermetic) ─────────
const g = globalThis as unknown as { __reviewStoreMem?: ReviewStore; __reviewStoreDb?: ReviewStore };
const getDbLazy = (): Promise<Db> => import("../../../lib/db").then((m) => m.getDb());

export function reviewStore(): ReviewStore {
  if (process.env.DATABASE_URL) return (g.__reviewStoreDb ??= createPrismaReviewStore(getDbLazy));
  return (g.__reviewStoreMem ??= createReviewStore());
}
