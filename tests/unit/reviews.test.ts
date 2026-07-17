import { describe, it, expect } from "vitest";
import {
  validateReview,
  createReviewStore,
  createPrismaReviewStore,
  buildReviewCreateData,
  mapReviewRow,
  type ReviewRow,
} from "../../src/app/reviews/_lib/reviews";
import type { Db } from "../../src/lib/db";

// F071 — 구매 인증 후기: 순수 검증 + in-memory 저장소(주문당 1개, 최신순) + Prisma 매핑.
// 작성 권한(주문 소유)·구매 인증(paid)은 서버 액션 레이어의 게이트라 여기서는 형태/저장만 검증.

describe("validateReview (F071)", () => {
  const ok = { rating: 5, body: "정말 좋아요", authorName: "도윤맘" };

  it("accepts a valid review and trims the body", () => {
    const r = validateReview("ord_1", { ...ok, body: "  좋은 책  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.draft).toEqual({ orderId: "ord_1", rating: 5, body: "좋은 책", authorName: "도윤맘" });
    }
  });

  it("coerces a string rating and rejects out-of-range / non-integer ratings", () => {
    expect(validateReview("ord_1", { ...ok, rating: "4" }).ok).toBe(true); // form sends a string
    expect(validateReview("ord_1", { ...ok, rating: 0 }).ok).toBe(false);
    expect(validateReview("ord_1", { ...ok, rating: 6 }).ok).toBe(false);
    expect(validateReview("ord_1", { ...ok, rating: 3.5 }).ok).toBe(false);
    expect(validateReview("ord_1", { ...ok, rating: undefined }).ok).toBe(false);
  });

  it("rejects an empty body and an over-long body", () => {
    expect(validateReview("ord_1", { ...ok, body: "   " }).ok).toBe(false);
    expect(validateReview("ord_1", { ...ok, body: "가".repeat(1001) }).ok).toBe(false);
  });

  it("defaults a blank author name to '구매자' and rejects an over-long one", () => {
    const r = validateReview("ord_1", { rating: 5, body: "좋아요", authorName: "  " });
    expect(r.ok && r.draft.authorName).toBe("구매자");
    expect(validateReview("ord_1", { rating: 5, body: "좋아요", authorName: "가".repeat(41) }).ok).toBe(false);
  });

  it("rejects a missing orderId", () => {
    expect(validateReview("", ok).ok).toBe(false);
  });
});

describe("createReviewStore (F071)", () => {
  const draft = (over = {}) => ({ orderId: "ord_1", rating: 5, body: "좋아요", authorName: "도윤맘", ...over });

  it("stores a review and returns it; refuses a SECOND review for the same order (주문당 1개)", async () => {
    const store = createReviewStore();
    const first = await store.create(draft());
    expect(first.ok).toBe(true);
    expect(first.review?.id).toMatch(/^rev_/);
    expect(await store.hasReviewFor("ord_1")).toBe(true);

    const dup = await store.create(draft({ body: "다시 씀" }));
    expect(dup.ok).toBe(false);
    expect((await store.listPublished()).length).toBe(1); // still one
  });

  it("lists published reviews newest-first, bounded by take", async () => {
    const store = createReviewStore();
    await store.create(draft({ orderId: "ord_1", body: "첫째" }));
    await store.create(draft({ orderId: "ord_2", body: "둘째" }));
    await store.create(draft({ orderId: "ord_3", body: "셋째" }));
    const all = await store.listPublished();
    expect(all.map((r) => r.body)).toEqual(["셋째", "둘째", "첫째"]); // newest first
    expect((await store.listPublished({ take: 2 })).length).toBe(2);
  });

  it("hasReviewFor is false for an order with no review", async () => {
    const store = createReviewStore();
    expect(await store.hasReviewFor("ord_none")).toBe(false);
  });
});

describe("Prisma mapping (F071)", () => {
  it("buildReviewCreateData carries the draft fields", () => {
    expect(buildReviewCreateData({ orderId: "ord_1", rating: 4, body: "b", authorName: "n" })).toEqual({
      orderId: "ord_1",
      rating: 4,
      body: "b",
      authorName: "n",
    });
  });

  it("mapReviewRow normalizes a Date createdAt to an ISO string", () => {
    const created = new Date("2026-07-18T01:02:03.000Z");
    const mapped = mapReviewRow({ id: "rev_1", orderId: "ord_1", rating: 5, body: "b", authorName: "n", createdAt: created });
    expect(mapped.createdAt).toBe(created.toISOString());
    expect(mapped).toMatchObject({ id: "rev_1", orderId: "ord_1", rating: 5 });
  });
});

describe("createPrismaReviewStore (F071 — fake delegate)", () => {
  const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({
    id: "rev_1", orderId: "ord_1", rating: 5, body: "b", authorName: "n", createdAt: new Date("2026-07-18T00:00:00.000Z"), ...over,
  });
  const fakeDb = (delegate: unknown): (() => Promise<Db>) => async () =>
    ({ review: delegate, $disconnect: async () => {} }) as unknown as Db;
  const draft = { orderId: "ord_1", rating: 5, body: "좋아요", authorName: "도윤맘" };

  it("refuses a duplicate: findUnique returns an existing row → {ok:false}, no create", async () => {
    let created = false;
    const store = createPrismaReviewStore(
      fakeDb({ findUnique: async () => row(), create: async () => { created = true; return row(); }, findMany: async () => [] }),
    );
    expect((await store.create(draft)).ok).toBe(false);
    expect(created).toBe(false);
  });

  it("swallows a unique-constraint race: create throws → {ok:false} (one review per order holds)", async () => {
    const store = createPrismaReviewStore(
      fakeDb({ findUnique: async () => null, create: async () => { throw new Error("unique violation"); }, findMany: async () => [] }),
    );
    expect((await store.create(draft)).ok).toBe(false);
  });

  it("creates + maps the row, and listPublished maps the delegate's rows", async () => {
    const store = createPrismaReviewStore(
      fakeDb({
        findUnique: async () => null,
        create: async (a: { data: { orderId: string; rating: number; body: string; authorName: string } }) =>
          row({ id: "rev_9", ...a.data }),
        findMany: async () => [row({ id: "rev_2", body: "둘째" }), row({ id: "rev_1", body: "첫째" })],
      }),
    );
    const c = await store.create(draft);
    expect(c.ok && c.review?.id).toBe("rev_9");
    expect(c.ok && c.review?.body).toBe("좋아요");
    const list = await store.listPublished();
    expect(list.map((r) => r.body)).toEqual(["둘째", "첫째"]);
    expect(await store.hasReviewFor("ord_1")).toBe(false); // findUnique(null) above
  });
});
