/**
 * F092 — 전환 지표(퍼스트파티) 도메인 유닛.
 * 닫힌 이벤트 어휘·경로 정규화·검증(브라우저 입력 = untrusted), in-memory 저장소의
 * 고유 세션/원시 카운트 의미론, 그리고 양 백엔드 동형 술어(matchesEvent ↔ buildEventWhere)를
 * DB 없이 고정한다(orders.ts / auditLog.ts 선례).
 */
import { describe, expect, it } from "vitest";
import {
  MEM_EVENT_CAP,
  buildEventCreateData,
  buildEventWhere,
  buildSessionCountSql,
  createAnalyticsStore,
  mapEventRow,
  matchesEvent,
  normalizePath,
  validateEvent,
  type AnalyticsEvent,
} from "../../src/app/api/events/_lib/analytics";
import { RL_EVENTS, rateLimit } from "../../src/lib/rateLimit";
import { CTA_NAMES, SCROLL_DEPTHS, crossedThresholds } from "../../src/app/api/events/_lib/eventVocab";
import { FUNNEL_STEPS, pctLabel } from "../../src/app/admin/analytics/_lib/funnel";

// ── 테스트 헬퍼: 저장된 이벤트를 손으로 조립(술어 테스트는 저장소를 우회한다) ──
function evt(partial: Partial<AnalyticsEvent>): AnalyticsEvent {
  return {
    id: "evt_0001",
    kind: "page_view",
    name: null,
    path: "/",
    value: null,
    sessionId: "s_aaaaaaaa",
    createdAt: "2026-08-08T00:00:00.000Z",
    ...partial,
  };
}

describe("F092 경로 정규화 (normalizePath)", () => {
  it("쿼리스트링·해시를 폐기한다(PII 유입 차단)", () => {
    expect(normalizePath("/checkout?email=a@b.c#x")).toBe("/checkout");
  });
  it("추적 대상 정적 경로는 그대로 통과한다", () => {
    for (const p of ["/", "/anniversary", "/first-moments", "/custom", "/cart", "/checkout", "/checkout/success", "/checkout/failed", "/brand-story"]) {
      expect(normalizePath(p)).toBe(p);
    }
  });
  it("/order/<templateKey>는 키를 보존한다(상품 식별자 — PII 아님)", () => {
    expect(normalizePath("/order/birth-first")).toBe("/order/birth-first");
  });
  it("실 카탈로그의 언더스코어 템플릿 키를 전부 보존한다(검수 확정 #1 회귀 방지)", () => {
    for (const key of ["hundred_days", "first_birthday", "first_steps", "first_word", "became_sibling"]) {
      expect(normalizePath(`/order/${key}`)).toBe(`/order/${key}`);
    }
  });
  it("템플릿 키 형식([a-z0-9_-]) 밖의 /order 경로는 드롭한다", () => {
    expect(normalizePath("/order/한글키")).toBeNull();
    expect(normalizePath("/order/a b")).toBeNull();
  });
  it("/orders/<id>는 /orders/[id]로 일반화한다(주문번호 미보관)", () => {
    expect(normalizePath("/orders/ord_abc123")).toBe("/orders/[id]");
  });
  it("/mypage 하위는 /mypage로 뭉갠다", () => {
    expect(normalizePath("/mypage/finish/xyz")).toBe("/mypage");
  });
  it("/admin·/api 및 미추적 경로는 드롭한다", () => {
    expect(normalizePath("/admin")).toBeNull();
    expect(normalizePath("/admin/orders")).toBeNull();
    expect(normalizePath("/api/events")).toBeNull();
    expect(normalizePath("/no-such-page")).toBeNull();
  });
  it("비정상 입력(빈 값·비절대경로·과대 길이)은 드롭한다", () => {
    expect(normalizePath("")).toBeNull();
    expect(normalizePath("checkout")).toBeNull();
    expect(normalizePath("/order/" + "a".repeat(300))).toBeNull();
  });
});

describe("F092 이벤트 검증 (validateEvent — 닫힌 어휘)", () => {
  const sid = "s_12345678";
  it("page_view: 경로를 정규화해 통과시키고 name/value는 null로 고정한다", () => {
    const r = validateEvent({ kind: "page_view", path: "/checkout?x=1", sessionId: sid, name: "smuggle", value: 7 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ kind: "page_view", name: null, path: "/checkout", value: null, sessionId: sid });
    }
  });
  it("scroll: 임계값은 25/50/75/100만 허용한다", () => {
    const ok = validateEvent({ kind: "scroll", path: "/", value: 75, sessionId: sid });
    expect(ok.ok).toBe(true);
    for (const bad of [33, 0, -25, 101, "75", null, undefined]) {
      expect(validateEvent({ kind: "scroll", path: "/", value: bad, sessionId: sid }).ok).toBe(false);
    }
  });
  it("cta_click: 닫힌 CTA 이름만 허용한다", () => {
    for (const name of CTA_NAMES) {
      expect(validateEvent({ kind: "cta_click", name, path: "/", sessionId: sid }).ok).toBe(true);
    }
    expect(validateEvent({ kind: "cta_click", name: "unknown_cta", path: "/", sessionId: sid }).ok).toBe(false);
    expect(validateEvent({ kind: "cta_click", path: "/", sessionId: sid }).ok).toBe(false);
  });
  it("미지의 kind·미추적 경로·비객체 입력은 거부한다", () => {
    expect(validateEvent({ kind: "purchase", path: "/", sessionId: sid }).ok).toBe(false);
    expect(validateEvent({ kind: "page_view", path: "/admin", sessionId: sid }).ok).toBe(false);
    expect(validateEvent(null).ok).toBe(false);
    expect(validateEvent("page_view").ok).toBe(false);
    expect(validateEvent([]).ok).toBe(false);
  });
  it("sessionId는 [A-Za-z0-9_-]{8,64}만 허용한다(임의 문자열·PII 차단)", () => {
    expect(validateEvent({ kind: "page_view", path: "/", sessionId: "short" }).ok).toBe(false);
    expect(validateEvent({ kind: "page_view", path: "/", sessionId: "a@b.com아무거나" }).ok).toBe(false);
    expect(validateEvent({ kind: "page_view", path: "/", sessionId: "x".repeat(65) }).ok).toBe(false);
    expect(validateEvent({ kind: "page_view", path: "/", sessionId: 12345678 }).ok).toBe(false);
  });
  it("허용 필드 외 여분 필드는 저장 값에 실리지 않는다(PII 밀수 차단)", () => {
    const r = validateEvent({ kind: "page_view", path: "/", sessionId: sid, email: "a@b.c", note: "hi" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value).sort()).toEqual(["kind", "name", "path", "sessionId", "value"]);
  });
});

describe("F092 in-memory 저장소 — 고유 세션·원시 카운트 의미론", () => {
  it("record는 evt_ 접두 id와 ISO createdAt을 부여해 돌려준다", async () => {
    const store = createAnalyticsStore();
    const stored = await store.record({ kind: "page_view", name: null, path: "/", value: null, sessionId: "s_11111111" });
    expect(stored.id).toMatch(/^evt_/);
    expect(new Date(stored.createdAt).toISOString()).toBe(stored.createdAt);
  });
  it("countEvents는 원시 건수, countSessions는 고유 세션 수를 센다", async () => {
    const store = createAnalyticsStore();
    const a = { kind: "cta_click" as const, name: "checkout_pay", path: "/checkout", value: null, sessionId: "s_aaaaaaaa" };
    await store.record(a);
    await store.record(a); // 같은 세션이 두 번 클릭
    await store.record({ ...a, sessionId: "s_bbbbbbbb" });
    expect(await store.countEvents({ kind: "cta_click", name: "checkout_pay" })).toBe(3);
    expect(await store.countSessions({ kind: "cta_click", name: "checkout_pay" })).toBe(2);
  });
  it("필터는 kind가 다르면 세지 않는다(어휘 교차 오염 방지)", async () => {
    const store = createAnalyticsStore();
    await store.record({ kind: "page_view", name: null, path: "/checkout", value: null, sessionId: "s_aaaaaaaa" });
    expect(await store.countEvents({ kind: "cta_click", name: "checkout_pay" })).toBe(0);
  });
  it("MEM_EVENT_CAP 초과 시 가장 오래된 이벤트부터 버린다(무한 증가 방지 — 검수 확정 #6)", async () => {
    const store = createAnalyticsStore();
    await store.record({ kind: "cta_click", name: "home_hero", path: "/", value: null, sessionId: "s_first001" });
    for (let i = 0; i < MEM_EVENT_CAP; i++) {
      await store.record({ kind: "page_view", name: null, path: "/", value: null, sessionId: "s_bulk0001" });
    }
    expect(await store.countEvents({ kind: "cta_click", name: "home_hero" })).toBe(0); // 최고령 드롭
    expect(await store.countEvents({ kind: "page_view" })).toBe(MEM_EVENT_CAP);
  });
});

describe("F092 고유 세션 COUNT(DISTINCT) SQL 빌더 — buildEventWhere와 동형", () => {
  it("kind 단독 필터", () => {
    expect(buildSessionCountSql({ kind: "page_view" })).toEqual({
      sql: 'SELECT COUNT(DISTINCT "sessionId")::int AS count FROM "AnalyticsEvent" WHERE "kind" = $1',
      params: ["page_view"],
    });
  });
  it("name·paths(IN)·pathPrefix(starts_with)·value·반개구간을 사상한다", () => {
    expect(buildSessionCountSql({ kind: "cta_click", name: "checkout_pay" })).toEqual({
      sql: 'SELECT COUNT(DISTINCT "sessionId")::int AS count FROM "AnalyticsEvent" WHERE "kind" = $1 AND "name" = $2',
      params: ["cta_click", "checkout_pay"],
    });
    expect(buildSessionCountSql({ kind: "page_view", paths: ["/a", "/b"] })).toEqual({
      sql: 'SELECT COUNT(DISTINCT "sessionId")::int AS count FROM "AnalyticsEvent" WHERE "kind" = $1 AND "path" IN ($2, $3)',
      params: ["page_view", "/a", "/b"],
    });
    expect(buildSessionCountSql({ kind: "scroll", pathPrefix: "/order/", value: 100 })).toEqual({
      sql: 'SELECT COUNT(DISTINCT "sessionId")::int AS count FROM "AnalyticsEvent" WHERE "kind" = $1 AND starts_with("path", $2) AND "value" = $3',
      params: ["scroll", "/order/", 100],
    });
    expect(
      buildSessionCountSql({ kind: "page_view", path: "/", createdFrom: "2026-08-01T00:00:00.000Z", createdTo: "2026-08-08T00:00:00.000Z" }),
    ).toEqual({
      sql: 'SELECT COUNT(DISTINCT "sessionId")::int AS count FROM "AnalyticsEvent" WHERE "kind" = $1 AND "path" = $2 AND "createdAt" >= $3 AND "createdAt" < $4',
      params: ["page_view", "/", new Date("2026-08-01T00:00:00.000Z"), new Date("2026-08-08T00:00:00.000Z")],
    });
  });
  it("빈 paths는 항상 거짓(IN () 구문 오류 방지 — matchesEvent와 동형)", () => {
    expect(buildSessionCountSql({ kind: "page_view", paths: [] }).sql).toContain("FALSE");
    expect(matchesEvent(evt({ path: "/" }), { kind: "page_view", paths: [] })).toBe(false);
  });
});

describe("F092 이벤트 레이트리밋 (RL_EVENTS — 검수 확정 #2)", () => {
  it("실사용 버스트(퍼널 완주 ~40이벤트/분)를 수용한다 — RL_INTAKE(20)로는 하단 퍼널이 유실된다", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 40; i++) {
      expect(rateLimit("f092-rl-burst", RL_EVENTS, t0 + i * 100).ok).toBe(true);
    }
  });
  it("한도 자체는 유한하다(무한 허용 아님)", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < RL_EVENTS.limit; i++) rateLimit("f092-rl-cap", RL_EVENTS, t0 + i);
    expect(rateLimit("f092-rl-cap", RL_EVENTS, t0 + RL_EVENTS.limit).ok).toBe(false);
  });
});

describe("F092 동형 술어 — matchesEvent(in-memory) ↔ buildEventWhere(Prisma)", () => {
  it("kind·name·path·value 정확 일치 필터", () => {
    const e = evt({ kind: "scroll", path: "/", value: 75 });
    expect(matchesEvent(e, { kind: "scroll", path: "/", value: 75 })).toBe(true);
    expect(matchesEvent(e, { kind: "scroll", path: "/", value: 50 })).toBe(false);
    expect(matchesEvent(e, { kind: "page_view", path: "/" })).toBe(false);
  });
  it("pathPrefix는 startsWith 의미론이다(/order/ 묶음)", () => {
    expect(matchesEvent(evt({ path: "/order/birth-first" }), { kind: "page_view", pathPrefix: "/order/" })).toBe(true);
    expect(matchesEvent(evt({ path: "/orders/[id]" }), { kind: "page_view", pathPrefix: "/order/" })).toBe(false);
  });
  it("paths는 목록 내 일치(OR) 의미론이다(카테고리 2종 묶음)", () => {
    const m = { kind: "page_view" as const, paths: ["/anniversary", "/first-moments"] };
    expect(matchesEvent(evt({ path: "/anniversary" }), m)).toBe(true);
    expect(matchesEvent(evt({ path: "/first-moments" }), m)).toBe(true);
    expect(matchesEvent(evt({ path: "/custom" }), m)).toBe(false);
  });
  it("기간은 반개구간 [from, to) — from 포함·to 배타(F089 선례)", () => {
    const e = evt({ createdAt: "2026-08-08T00:00:00.000Z" });
    expect(matchesEvent(e, { kind: "page_view", createdFrom: "2026-08-08T00:00:00.000Z" })).toBe(true);
    expect(matchesEvent(e, { kind: "page_view", createdTo: "2026-08-08T00:00:00.000Z" })).toBe(false);
    expect(matchesEvent(e, { kind: "page_view", createdFrom: "2026-08-08T00:00:00.001Z" })).toBe(false);
    expect(matchesEvent(e, { kind: "page_view", createdTo: "2026-08-08T00:00:00.001Z" })).toBe(true);
  });
  it("buildEventWhere는 동일 어휘를 Prisma where로 사상한다(누락 키는 부재)", () => {
    expect(
      buildEventWhere({ kind: "scroll", name: undefined, path: "/", value: 75, createdFrom: "A", createdTo: "B" }),
    ).toEqual({ kind: "scroll", path: "/", value: 75, createdAt: { gte: "A", lt: "B" } });
    expect(buildEventWhere({ kind: "cta_click", name: "checkout_pay" })).toEqual({ kind: "cta_click", name: "checkout_pay" });
    expect(buildEventWhere({ kind: "page_view", pathPrefix: "/order/" })).toEqual({
      kind: "page_view",
      path: { startsWith: "/order/" },
    });
    expect(buildEventWhere({ kind: "page_view", createdFrom: "A" })).toEqual({ kind: "page_view", createdAt: { gte: "A" } });
    expect(buildEventWhere({ kind: "page_view", paths: ["/a", "/b"] })).toEqual({ kind: "page_view", path: { in: ["/a", "/b"] } });
  });
});

describe("F092 Prisma 순수 매퍼 계약", () => {
  it("buildEventCreateData는 저장 필드만 담는다(id·createdAt은 DB 소관)", () => {
    expect(
      buildEventCreateData({ kind: "cta_click", name: "home_hero", path: "/", value: null, sessionId: "s_aaaaaaaa" }),
    ).toEqual({ kind: "cta_click", name: "home_hero", path: "/", value: null, sessionId: "s_aaaaaaaa" });
  });
  it("mapEventRow는 Date createdAt을 ISO 문자열로 정규화한다", () => {
    const row = {
      id: "ck123",
      kind: "scroll",
      name: null,
      path: "/",
      value: 100,
      sessionId: "s_aaaaaaaa",
      createdAt: new Date("2026-08-08T01:02:03.000Z"),
    };
    expect(mapEventRow(row).createdAt).toBe("2026-08-08T01:02:03.000Z");
    expect(mapEventRow({ ...row, createdAt: "2026-08-08T01:02:03.000Z" }).createdAt).toBe("2026-08-08T01:02:03.000Z");
  });
});

describe("F092 클라이언트 스크롤 임계 (crossedThresholds — 순수)", () => {
  it("도달 비율이 넘은 임계 중 미전송분만 돌려준다", () => {
    expect(crossedThresholds(0.8, new Set())).toEqual([25, 50, 75]);
    expect(crossedThresholds(0.8, new Set([25, 50]))).toEqual([75]);
    expect(crossedThresholds(1, new Set([25, 50, 75]))).toEqual([100]);
    expect(crossedThresholds(0.1, new Set())).toEqual([]);
  });
  it("비정상 비율(NaN·음수)은 빈 배열", () => {
    expect(crossedThresholds(Number.NaN, new Set())).toEqual([]);
    expect(crossedThresholds(-1, new Set())).toEqual([]);
  });
  it("SCROLL_DEPTHS 어휘는 25/50/75/100으로 닫혀 있다", () => {
    expect([...SCROLL_DEPTHS]).toEqual([25, 50, 75, 100]);
  });
});

describe("F092 퍼널 정의·백분율 라벨", () => {
  it("퍼널 단계는 홈→카테고리→주문 시작→담기→장바구니→결제 페이지→결제 클릭→결제 완료 순서다", () => {
    expect(FUNNEL_STEPS.map((s) => s.key)).toEqual([
      "home",
      "category",
      "order_start",
      "add_to_cart",
      "cart",
      "checkout",
      "pay_click",
      "paid",
    ]);
    // 각 단계 match는 닫힌 EventMatch 어휘만 쓴다(양 백엔드 동형 보장).
    for (const s of FUNNEL_STEPS) {
      expect(["page_view", "cta_click"]).toContain(s.match.kind);
    }
  });
  it("pctLabel은 분모 0이면 '–', 아니면 정수 %를 준다", () => {
    expect(pctLabel(0, 0)).toBe("–");
    expect(pctLabel(1, 4)).toBe("25%");
    expect(pctLabel(3, 3)).toBe("100%");
  });
});
