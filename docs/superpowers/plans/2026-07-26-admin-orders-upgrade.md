# 어드민 주문 목록 개선 (F088–F090) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/orders`를 테이블+페이지네이션으로 개편하고 기간 필터+합계줄, 검색을 추가한다 (스펙: `docs/superpowers/specs/2026-07-26-admin-orders-upgrade-design.md`).

**Architecture:** 서버 렌더 + URL 파라미터 확장(기존 `?status=` 패턴의 연장). 저장소(`OrderRepo`) 필터 어휘에 `createdTo`/`search`/`skip`과 `sumAmount()`를 양 백엔드(in-memory·Prisma) 동형으로 추가. 신규 API 라우트 0, 신규 클라이언트 컴포넌트 0.

**Tech Stack:** Next.js 15 App Router(서버 컴포넌트) · TypeScript 5 · vitest · Playwright · Prisma 6(fake delegate 계약 테스트)

## Global Constraints

- **WIP=1**: F088 → F089 → F090 순서. 각 피처는 `pnpm attempt <id>`로 시작, passing 후 `pnpm attempt <id> --reset`.
- **DoD**: 피처별로 (1) `feature_list.json` `passes:true`+`evidence` (2) `pnpm check` 그린 (3) 자체 E2E 그린. 셋 다 만족해야 다음 피처로.
- `feature_list.json`은 **append-only** (R9). 기존 항목은 state/passes/evidence만 변경.
- 어드민 page 모듈은 `requireAdmin()` 유지 (R13 — `page.tsx`에 이미 있음, 지우지 말 것). `_lib/*.ts` 순수 모듈은 R13 대상 아님(기존 `_lib/dashboard.ts` 선례).
- PII(구매자명·이메일·검색어)는 **렌더만** — 신규 코드 경로 어디에도 로그/트레이스 금지 (E3).
- UI는 DESIGN.md 토큰만: 헤어라인(`var(--line)`), radius 0(`var(--radius)`), 잉크네이비 accent, box-shadow 금지, 순수 흰/검정 금지. 신규 스타일은 `admin.module.css`에.
- 기존 `data-testid` 계약 보존: `admin-orders`, `admin-order-row`, `admin-order-link`, `admin-cancel-badge`, `admin-orders-empty`, `admin-status-filters`, `admin-filter-<STATUS>`, `admin-filter-cancel-requested`, `admin-cancel-queue-count`.
- E2E는 fullyParallel — **전량 카운트·합계·정확 델타는 유닛 소관**, E2E는 멤버십·형식 단언만 (F082/F083 확립 패턴).
- 금액은 KRW 정수(부 단위 없음). 날짜 경계는 전부 KST(Asia/Seoul, UTC+9 고정) — naive `slice(0,10)` 금지 (F070/F083 교훈).
- 커밋 말미: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. 관례상 `app.json`(untracked)은 스테이징하지 않는다.
- 유닛 실행: `pnpm test -- <파일명>`. E2E 격리 실행: `pnpm test:e2e -- <spec 파일명>` (플래그는 무시되고 위치 필터로 취급됨 — 플래그가 필요하면 `pnpm exec playwright test`).

## File Structure

| 파일 | 책임 |
|---|---|
| `src/app/api/payments/_lib/orders.ts` (수정) | 필터 어휘 `createdTo`/`search`, `listRecent` `skip`, `sumAmount()` — 양 백엔드 동형 |
| `src/app/admin/orders/_lib/query.ts` (신규) | `parsePage`/`buildQuery` — URL 파라미터 순수 헬퍼 |
| `src/app/admin/orders/_lib/period.ts` (신규) | `resolvePeriod`/`PERIOD_PRESETS` — 기간 URL → repo 경계 (순수) |
| `src/app/_components/order/format.ts` (수정) | `formatKstDate`(F088) · `kstDateToIso`/`kstMonthStartIso`(F089) |
| `src/app/admin/orders/page.tsx` (수정) | 테이블·페이저(F088) → 기간 UI·합계줄(F089) → 검색 input(F090) |
| `src/app/admin/admin.module.css` (수정) | 테이블·페이저·툴바 스타일 (토큰만) |
| `feature_list.json` (수정) | F088–F090 append |
| `tests/unit/admin-list-paging.test.ts` (신규) | skip 페이징 + query 헬퍼 |
| `tests/unit/admin-period.test.ts` (신규) | resolvePeriod + createdTo + sumAmount |
| `tests/unit/admin-search.test.ts` (신규) | search 술어 양 백엔드 |
| `tests/unit/format.test.ts` (수정) | KST 유틸 3종 |
| `tests/e2e/admin-orders-table.spec.ts` 외 2 (신규) | 피처별 자체 E2E |

---

### Task 1: feature_list에 F088–F090 등록 + F088 착수

**Files:**
- Modify: `feature_list.json` (배열 마지막 항목 F087 뒤에 append)

**Interfaces:**
- Produces: F088/F089/F090 항목 (이후 태스크가 state/passes/evidence를 갱신)

- [ ] **Step 1: 세 항목 append** — 배열의 마지막 항목 뒤에 (JSON 콤마 주의):

```json
{
  "id": "F088",
  "category": "admin",
  "track": "product",
  "priority": 3,
  "description": "관리자 주문 목록 테이블 + 페이지네이션 — 일렬 리스트를 컬럼 테이블(주문일 KST·주문·상태·금액)로 개편(data-testid 계약 보존), 최신 50건 컷을 오프셋 페이지네이션(page=N, listRecent skip + take 없는 count 전량 기반 totalPages)으로 교체, F082 컷 안내문 대체. 페이지 링크는 기존 status/queue 필터 보존. 주문일은 formatKstDate(F070/F083 naive slice 교훈). 스펙: docs/superpowers/specs/2026-07-26-admin-orders-upgrade-design.md",
  "steps": [
    "/admin/orders가 테이블(주문일·주문·상태·금액)로 렌더되고 행 링크로 상세에 진입한다",
    "51건 이상일 때 페이지 링크로 다음 페이지 주문을 볼 수 있고, 페이지 링크는 기존 필터를 보존한다 (페이지당 50건 컷·전량 페이지 수 산출은 유닛 소관)",
    "기존 상태·취소요청 필터/배지 계약 무회귀 (컷 안내문은 페이지네이션으로 대체)"
  ],
  "verification": "pnpm test:e2e -- admin-orders-table.spec.ts",
  "state": "todo",
  "passes": false,
  "evidence": ""
},
{
  "id": "F089",
  "category": "admin",
  "track": "product",
  "priority": 3,
  "description": "관리자 주문 기간 필터 + 합계줄 — KST 프리셋(오늘/7일/30일/이번달) + from/to 직접 지정(종료일 포함 = 익일 00:00 배타 상한), 목록 상단 '총 N건 · 합계원'(현재 필터 전량 — take 컷 아님). OrderListFilter.createdTo(배타 상한) + OrderRepo.sumAmount(count와 동일 어휘·no-take, Prisma aggregate _sum.amountWon) 양 백엔드 동형. 기간 해석은 순수 resolvePeriod(admin/orders/_lib/period.ts)가 유닛으로 고정. range·from/to 동시 존재 시 range 우선, 불량 입력은 무시.",
  "steps": [
    "프리셋(오늘/7일/30일/이번달) 클릭 시 해당 KST 기간의 주문만 보인다 — 경계는 유닛이 고정",
    "시작일·종료일 직접 지정이 반영된다(종료일 포함)",
    "합계줄의 건수·총금액은 필터 전량 기준이다(50건 컷 아님 — 전량성은 유닛 소관)",
    "상태 필터와 기간 필터가 교집합으로 조합된다"
  ],
  "verification": "pnpm test:e2e -- admin-orders-period.spec.ts",
  "state": "todo",
  "passes": false,
  "evidence": ""
},
{
  "id": "F090",
  "category": "admin",
  "track": "product",
  "priority": 3,
  "description": "관리자 주문 검색 — q 파라미터(GET, trim·빈값 무시): 주문번호 정확 일치 OR 구매자명/이메일 부분 일치(case-insensitive), 기존 필터와 교집합. OrderListFilter.search 양 백엔드 동형(Prisma OR: id 정확 + contains insensitive). PII 결정(스펙 §PII): q는 URL에 실리므로 앱 로그/트레이스 무기록 유지, 인프라 요청 로그 한계는 수용·문서화.",
  "steps": [
    "주문번호 정확 일치 검색이 된다",
    "구매자명/이메일 부분 일치(case-insensitive) 검색이 된다",
    "기존 필터와 조합되고, 0건이면 빈 상태 문구가 보인다"
  ],
  "verification": "pnpm test:e2e -- admin-orders-search.spec.ts",
  "state": "todo",
  "passes": false,
  "evidence": ""
}
```

- [ ] **Step 2: 게이트 확인** — Run: `pnpm constraints` → 위반 0 (R9 append-only 합치, R4는 todo/false 무관). `node -e "require('./feature_list.json')"` → 파싱 OK
- [ ] **Step 3: 착수 기록** — Run: `pnpm attempt F088`
- [ ] **Step 4: Commit** — `git add feature_list.json .harness/attempts.json && git commit` 메시지: `chore(harness): F088-F090 어드민 주문 목록 개선 3건 등록 (스펙 2026-07-26)`

---

### Task 2: [F088] `formatKstDate` — 주문일의 KST 달력일

**Files:**
- Modify: `src/app/_components/order/format.ts` (파일 끝에 추가)
- Test: `tests/unit/format.test.ts` (기존 파일에 describe 추가)

**Interfaces:**
- Produces: `formatKstDate(iso: string): string` — `"YYYY-MM-DD"` (KST). invalid iso는 입력 그대로 반환 (formatKstDateTime 선례).

- [ ] **Step 1: 실패하는 테스트** — `tests/unit/format.test.ts`에 추가 (import에 `formatKstDate` 추가):

```ts
describe("formatKstDate (F088 — 주문일 KST 달력일)", () => {
  it("UTC 자정 부근도 KST 달력일 — naive slice(0,10) 회귀 가드", () => {
    expect(formatKstDate("2026-07-22T16:30:00.000Z")).toBe("2026-07-23"); // KST 01:30
    expect(formatKstDate("2026-07-23T14:59:00.000Z")).toBe("2026-07-23"); // KST 23:59
  });
  it("invalid iso는 입력 그대로 (formatKstDateTime 선례)", () => {
    expect(formatKstDate("junk")).toBe("junk");
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test -- format` → FAIL (`formatKstDate` is not exported)
- [ ] **Step 3: 구현** — `format.ts` 끝에:

```ts
/** F088 — an ISO instant's KST calendar date ("YYYY-MM-DD"). The admin table's 주문일 column:
 *  a naive slice(0,10) shows the UTC date (F070/F083 lesson). en-CA yields YYYY-MM-DD. */
export function formatKstDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm test -- format` → PASS
- [ ] **Step 5: Commit** — `feat(F088): formatKstDate — 주문일 KST 달력일 유틸`

---

### Task 3: [F088] `listRecent` skip + URL 헬퍼 (`parsePage`/`buildQuery`)

**Files:**
- Modify: `src/app/api/payments/_lib/orders.ts`
- Create: `src/app/admin/orders/_lib/query.ts`
- Test: `tests/unit/admin-list-paging.test.ts` (신규)

**Interfaces:**
- Produces: `listRecent(opts?: OrderListFilter & { take?: number; skip?: number })` (skip 기본 0; Prisma는 skip>0일 때만 wire에 실어 기존 계약 무회귀)
- Produces: `parsePage(raw: string | undefined): number` (1-기반; 비정수·<1·잡문자 → 1)
- Produces: `buildQuery(params: Record<string, string | undefined>): string` (값 있는 키만 `?a=b&c=d`, 전부 비면 `""`)

- [ ] **Step 1: 실패하는 테스트** — `tests/unit/admin-list-paging.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  createOrderRepo,
  createPrismaOrderRepo,
  type OrderDraft,
} from "../../src/app/api/payments/_lib/orders";
import { buildQuery, parsePage } from "../../src/app/admin/orders/_lib/query";

// F088 — 오프셋 페이지네이션: in-memory 슬라이스는 집합 의미론(동일 ms createdAt은 정렬 비결정 —
// 순서 단언 금지), Prisma는 skip>0일 때만 wire(기존 findMany args 무회귀).

function draft(over: Partial<OrderDraft> = {}): OrderDraft {
  return {
    amountWon: 43000,
    orderName: "탄생",
    qrVideoAddon: false,
    buyerName: "김부모",
    buyerEmail: "parent@example.com",
    items: [],
    ...over,
  };
}

describe("listRecent skip (F088, in-memory)", () => {
  it("페이지는 서로소이고 합집합이 전량 — take/skip 슬라이스", async () => {
    const repo = createOrderRepo();
    for (let i = 0; i < 5; i++) await repo.create(draft());
    const p1 = await repo.listRecent({ take: 2 });
    const p2 = await repo.listRecent({ take: 2, skip: 2 });
    const p3 = await repo.listRecent({ take: 2, skip: 4 });
    expect(p1).toHaveLength(2);
    expect(p2).toHaveLength(2);
    expect(p3).toHaveLength(1);
    expect(new Set([...p1, ...p2, ...p3].map((o) => o.id)).size).toBe(5);
    expect(await repo.listRecent({ take: 2, skip: 10 })).toEqual([]);
  });

  it("skip은 필터와 조합 — 필터된 집합 위의 슬라이스", async () => {
    const repo = createOrderRepo();
    for (let i = 0; i < 3; i++) {
      const id = (await repo.create(draft())).id;
      await repo.markPaid(id, `pk_${i}`);
    }
    await repo.create(draft()); // CREATED — PAID 슬라이스에서 제외
    expect(await repo.listRecent({ status: "PAID", take: 2, skip: 2 })).toHaveLength(1);
  });
});

describe("listRecent skip (F088, Prisma wire 계약)", () => {
  function listFakeDb(calls: { findMany: unknown[] }) {
    const order = {
      async findMany(args: unknown) {
        calls.findMany.push(args);
        return [];
      },
    };
    return async () => ({ order }) as never;
  }

  it("skip 미지정/0이면 args에 skip 부재(기존 wire 무회귀), skip>0이면 전달", async () => {
    const calls = { findMany: [] as unknown[] };
    const repo = createPrismaOrderRepo(listFakeDb(calls));
    await repo.listRecent({ take: 50 });
    expect(calls.findMany[0]).not.toHaveProperty("skip");
    await repo.listRecent({ take: 50, skip: 100 });
    expect(calls.findMany[1]).toMatchObject({ take: 50, skip: 100 });
  });
});

describe("parsePage / buildQuery (F088)", () => {
  it("parsePage: 1-기반, 비정수·0·음수·잡문자는 1", () => {
    expect(parsePage("2")).toBe(2);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("1.5")).toBe(1);
  });
  it("buildQuery: 값 있는 키만 직렬화", () => {
    expect(buildQuery({ status: "PAID", page: "2", q: undefined })).toBe("?status=PAID&page=2");
    expect(buildQuery({})).toBe("");
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test -- admin-list-paging` → FAIL (query.ts 부재)
- [ ] **Step 3: 구현** — `src/app/admin/orders/_lib/query.ts` 신규:

```ts
/**
 * F088 — /admin/orders URL 파라미터 순수 헬퍼. 페이지 링크·프리셋 링크·GET 폼이 서로의
 * 파라미터를 보존하는 단일 직렬화 지점 (값 없는 키는 내보내지 않는다).
 */
export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}
```

`orders.ts` 수정 — 인터페이스 선언(L135)을:

```ts
  listRecent(opts?: OrderListFilter & { take?: number; skip?: number }): Promise<StoredOrder[]>;
```

in-memory `listRecent`(L252)를:

```ts
    async listRecent(opts = {}) {
      const take = opts.take ?? 50;
      const skip = opts.skip ?? 0;
      return [...map.values()]
        .filter((o) => matchesListFilter(o, opts))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(skip, skip + take);
    },
```

`OrderDelegate.findMany` args 타입(L522)에 `skip?: number;` 추가(“take?: number;” 아래). Prisma `listRecent`(L655)를:

```ts
    async listRecent(opts = {}) {
      const db = await getDb();
      const skip = opts.skip ?? 0;
      const rows = await (db.order as OrderDelegate).findMany({
        where: buildListWhere(opts),
        orderBy: { createdAt: "desc" },
        take: opts.take ?? 50,
        ...(skip > 0 ? { skip } : {}), // F088 — 0이면 기존 wire 그대로 (무회귀)
        include: ORDER_INCLUDE,
      });
      return rows.map(mapOrderRow);
    },
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm test -- admin-list-paging` → PASS. 회귀: `pnpm test -- cancel-queue dashboard-counts` → PASS
- [ ] **Step 5: Commit** — `feat(F088): listRecent skip + parsePage/buildQuery 헬퍼`

---

### Task 4: [F088] 테이블 + 페이저 UI

**Files:**
- Modify: `src/app/admin/orders/page.tsx` (전면 교체 — 아래 전체 코드)
- Modify: `src/app/admin/admin.module.css` (끝에 추가)

**Interfaces:**
- Consumes: Task 2 `formatKstDate`, Task 3 `parsePage`/`buildQuery`/`listRecent skip`
- Produces: `data-testid`: `admin-orders-pager`, `admin-page-prev`, `admin-page-next`, `admin-page-indicator` (E2E가 사용). 기존 testid 전부 보존. `admin-queue-cut-note`는 제거.

- [ ] **Step 1: page.tsx 전면 교체**:

```tsx
import Link from "next/link";
import { Nav } from "../../_components/Nav";
import { formatWon, formatKstDate } from "../../_components/order/format";
import { orderRepo, type OrderStatus } from "../../api/payments/_lib/orders";
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from "../../api/payments/_lib/status";
import { requireAdmin } from "../_lib/adminAuth";
import { buildQuery, parsePage } from "./_lib/query";
import styles from "../admin.module.css";

const PAGE_SIZE = 50;

/**
 * F059 — 관리자 주문 목록. PII(구매자명)는 화면 렌더만 — 어떤 admin 코드 경로도 로그/트레이스에
 * 남기지 않는다(E3). 게이트는 admin/layout.tsx(+자체 requireAdmin, F075/R13).
 * F082 — 취소요청 큐 필터(?queue=cancel-requested). 배지 숫자는 take 컷과 분리된 전량 count.
 * F088 — 테이블 렌더 + 오프셋 페이지네이션(page=N): 최신 50건 컷을 페이지로 교체(F082 컷
 * 안내문 대체 — 전량이 페이지로 도달 가능). totalPages는 take 없는 count 전량 기반.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; queue?: string; page?: string }>;
}) {
  await requireAdmin(); // F075 — own gate, not just the layout (defense in depth)
  const params = await searchParams;
  const cancelQueue = params.queue === "cancel-requested";
  const filter =
    !cancelQueue && ORDER_STATUSES.includes(params.status as OrderStatus)
      ? (params.status as OrderStatus)
      : undefined;
  const page = parsePage(params.page);
  const listFilter = cancelQueue ? { cancelRequested: true as const } : { status: filter };
  const repo = orderRepo();
  const [orders, total, cancelQueueCount] = await Promise.all([
    repo.listRecent({ ...listFilter, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    repo.count(listFilter),
    repo.count({ cancelRequested: true }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 페이지 링크가 보존해야 하는 현재 필터 (값 없는 키는 buildQuery가 떨군다)
  const keep: Record<string, string | undefined> = {
    status: filter,
    queue: cancelQueue ? "cancel-requested" : undefined,
  };

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="admin-orders-title">
          <p className="eyebrow eyebrow--ko">관리자</p>
          <h1 className="hero__title" id="admin-orders-title">주문 관리</h1>
        </section>
        <section className={styles.panel} aria-label="주문 목록">
          <ul className={styles.filters} data-testid="admin-status-filters">
            <li>
              <Link
                href="/admin/orders"
                className={`${styles.filterLink} ${!filter && !cancelQueue ? styles.filterActive : ""}`}
              >
                전체
              </Link>
            </li>
            {ORDER_STATUSES.map((s) => (
              <li key={s}>
                <Link
                  href={`/admin/orders?status=${s}`}
                  className={`${styles.filterLink} ${filter === s ? styles.filterActive : ""}`}
                  data-testid={`admin-filter-${s}`}
                >
                  {ORDER_STATUS_LABEL[s]}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/admin/orders?queue=cancel-requested"
                className={`${styles.filterLink} ${cancelQueue ? styles.filterActive : ""}`}
                data-testid="admin-filter-cancel-requested"
              >
                취소요청 (<span data-testid="admin-cancel-queue-count">{cancelQueueCount}</span>)
              </Link>
            </li>
          </ul>
          {orders.length === 0 ? (
            <p className={styles.empty} data-testid="admin-orders-empty">
              {cancelQueue ? "처리 대기 중인 취소요청이 없습니다." : "해당 상태의 주문이 없습니다."}
            </p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table} data-testid="admin-orders">
                <thead>
                  <tr>
                    <th scope="col" className={styles.th}>주문일</th>
                    <th scope="col" className={styles.th}>주문</th>
                    <th scope="col" className={styles.th}>상태</th>
                    <th scope="col" className={`${styles.th} ${styles.thAmount}`}>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className={styles.tr} data-testid="admin-order-row">
                      <td className={styles.tdDate}>{formatKstDate(order.createdAt)}</td>
                      <td className={styles.tdMain}>
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className={styles.tableLink}
                          data-testid="admin-order-link"
                        >
                          {order.kind === "CUSTOM" ? "[맞춤] " : ""}
                          {order.orderName} · {order.buyerName}
                        </Link>
                        <span className={styles.tdId}>{order.id}</span>
                      </td>
                      <td className={styles.tdStatus}>
                        {order.cancelRequestedAt ? (
                          <span data-testid="admin-cancel-badge">취소요청 · </span>
                        ) : null}
                        {ORDER_STATUS_LABEL[order.status]}
                      </td>
                      <td className={styles.tdAmount}>{formatWon(order.amountWon)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 ? (
            <nav className={styles.pager} aria-label="페이지" data-testid="admin-orders-pager">
              {page > 1 ? (
                <Link
                  href={`/admin/orders${buildQuery({ ...keep, page: String(page - 1) })}`}
                  data-testid="admin-page-prev"
                >
                  ← 이전
                </Link>
              ) : (
                <span className={styles.pagerMuted}>← 이전</span>
              )}
              <span data-testid="admin-page-indicator">{page} / {totalPages}</span>
              {page < totalPages ? (
                <Link
                  href={`/admin/orders${buildQuery({ ...keep, page: String(page + 1) })}`}
                  data-testid="admin-page-next"
                >
                  다음 →
                </Link>
              ) : (
                <span className={styles.pagerMuted}>다음 →</span>
              )}
            </nav>
          ) : null}
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 2: CSS 추가** — `admin.module.css` 끝에:

```css
/* F088 — orders table (hairlines only; radius 0; no boxes) */
.tableWrap { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; border-top: 1px solid var(--line); }
.th {
  font-family: var(--font-grotesk); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.02em;
  color: var(--muted); text-align: left; padding: var(--space-xs) var(--space-sm) var(--space-xs) 0;
  border-bottom: 1px solid var(--line); white-space: nowrap;
}
.thAmount { text-align: right; padding-right: 0; }
.tr { border-bottom: 1px solid var(--line); }
.tr:hover .tableLink { text-decoration: underline; text-underline-offset: 3px; }
.tdDate {
  font-family: var(--font-grotesk); font-size: 0.78rem; color: var(--muted);
  padding: var(--space-sm) var(--space-sm) var(--space-sm) 0; white-space: nowrap; vertical-align: top;
}
.tdMain { padding: var(--space-sm) var(--space-sm) var(--space-sm) 0; }
.tableLink { display: block; font-size: 0.95rem; color: var(--ink); text-decoration: none; }
.tdId { display: block; font-family: var(--font-grotesk); font-size: 0.72rem; letter-spacing: 0; color: var(--muted); }
.tdStatus {
  font-family: var(--font-grotesk); font-weight: 600; font-size: 0.78rem; letter-spacing: 0;
  color: var(--accent); padding: var(--space-sm) var(--space-sm) var(--space-sm) 0;
  white-space: nowrap; vertical-align: top;
}
.tdAmount {
  font-family: var(--font-grotesk); font-weight: 600; font-size: 0.88rem; color: var(--ink);
  text-align: right; font-variant-numeric: tabular-nums; padding: var(--space-sm) 0;
  white-space: nowrap; vertical-align: top;
}
.pager {
  display: flex; gap: var(--space-sm); align-items: baseline; margin: var(--space-md) 0 0;
  font-family: var(--font-grotesk); font-weight: 600; font-size: 0.82rem; letter-spacing: 0;
}
.pager a { color: var(--ink); }
.pagerMuted { color: var(--muted); }
```

- [ ] **Step 3: 수동 스모크** — Run: `pnpm dev` 후 관리자 로그인 → `/admin/orders` 테이블 렌더·필터 링크·행 클릭 상세 진입 확인 (또는 곧바로 Task 5 E2E로)
- [ ] **Step 4: 기존 E2E 무회귀** — Run: `pnpm test:e2e -- admin-orders.spec.ts admin-cancel-queue.spec.ts admin-dashboard.spec.ts` → PASS (testid 계약 보존 검증)
- [ ] **Step 5: Commit** — `feat(F088): 주문 목록 테이블 렌더 + 오프셋 페이지네이션 UI`

---

### Task 5: [F088] 자체 E2E + DoD 마감

**Files:**
- Create: `tests/e2e/admin-orders-table.spec.ts`
- Modify: `feature_list.json` (F088), `PROGRESS.md`

**Interfaces:**
- Consumes: `POST /api/payments/create` (hermetic 시드 — dev-auth 하에서 rate limit 전면 바이패스, `enforceRateLimit`/`devAuthEnabled` 참조), `completePaidOrder`/`loginAs` 헬퍼, Task 4 testids

- [ ] **Step 1: E2E 작성**:

```ts
import { test, expect, type Page } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F088 — 테이블 + 페이지네이션. 정확 카운트·페이지 수 산출은 유닛 소관(전역 상태 — F082/F083
// 패턴); E2E는 렌더·멤버십·필터 보존만 단언. 시드는 결제 퍼널이 아닌 create API 직접 호출
// (hermetic: dev-auth 하에서 per-IP rate limit은 enforceRateLimit이 전면 바이패스).

async function seedCreatedOrder(page: Page, email: string): Promise<string> {
  const res = await page.request.post("/api/payments/create", {
    data: {
      buyerName: "김부모",
      buyerEmail: email,
      shipName: "김수취",
      shipPhone: "010-2222-3333",
      shipZip: "04524",
      shipAddress: "서울특별시 중구 세종대로 110",
      withdrawalConsent: true,
      lines: [
        {
          templateKey: "birth",
          coverType: "SOFT",
          personalization: { childName: "도윤", childGender: "MALE", extraVar: null },
        },
      ],
    },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { orderId: string }).orderId;
}

test.describe("admin orders table + pagination (F088)", () => {
  test("테이블(주문일·주문·상태·금액) 렌더 + 행 링크로 상세 진입", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "f088-table@example.com" });
    await loginAs(page, "admin+f088table@example.com");
    await page.goto("/admin/orders");
    await expect(page.getByTestId("admin-orders")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "주문일" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "금액" })).toBeVisible();
    const row = page.getByTestId("admin-order-row").filter({ hasText: orderId });
    await expect(row).toContainText("결제 완료");
    await expect(row).toContainText("43,000원");
    await row.getByTestId("admin-order-link").click();
    await page.waitForURL(`**/admin/orders/${orderId}`);
  });

  test("51건 이상이면 페이저 — 다음 페이지 이동, 필터 보존", async ({ page }) => {
    test.setTimeout(120_000); // 51건 API 시드 (F082 선례 — 구조적 예산 명시)
    for (let i = 0; i < 51; i++) await seedCreatedOrder(page, `f088-page-${i}@example.com`);
    await loginAs(page, "admin+f088paging@example.com");

    // 시드는 전부 CREATED에 머문다(퍼널 미진행) — status=CREATED 뷰는 항상 ≥51건.
    await page.goto("/admin/orders?status=CREATED");
    await expect(page.getByTestId("admin-orders-pager")).toBeVisible();
    await expect(page.getByTestId("admin-page-indicator")).toHaveText(/^1 \/ \d+$/);
    await expect(page.getByTestId("admin-order-row")).toHaveCount(50); // 페이지 컷

    await page.getByTestId("admin-page-next").click();
    await page.waitForURL(/status=CREATED/); // 필터 보존
    expect(new URL(page.url()).searchParams.get("page")).toBe("2");
    await expect(page.getByTestId("admin-page-indicator")).toHaveText(/^2 \/ \d+$/);
    await expect(page.getByTestId("admin-order-row").first()).toBeVisible(); // 2페이지에도 행
  });
});
```

- [ ] **Step 2: 격리 실행** — Run: `pnpm test:e2e -- admin-orders-table.spec.ts` → 2/2 PASS
- [ ] **Step 3: 전체 게이트** — Run: `pnpm check` → 그린. `pnpm test:e2e` 전체 → 그린(perf 아티팩트는 격리 재판정 선례 따름)
- [ ] **Step 4: feature_list 마감** — F088을 `state:"passing"`, `passes:true`, `evidence`에 날짜·게이트 결과·유닛/E2E 요약·스텝 귀속(테이블 렌더·상세 진입·필터 보존=E2E, 50컷·totalPages 산출·skip 슬라이스=유닛) 기록
- [ ] **Step 5: 마무리 커밋** — `PROGRESS.md` 갱신 + `pnpm attempt F088 --reset` → `git add -A && git restore --staged app.json`(관례: app.json 미스테이징) 후 commit: `feat(F088): 관리자 주문 목록 테이블 + 페이지네이션 (passes:true)`

---

### Task 6: [F089] KST 기간 유틸 (`kstDateToIso`/`kstMonthStartIso`)

**Files:**
- Modify: `src/app/_components/order/format.ts`
- Test: `tests/unit/format.test.ts`

**Interfaces:**
- Produces: `kstDateToIso(date: string, dayOffset?: number): string | undefined` — KST 달력일 `"YYYY-MM-DD"` → 그 날 KST 00:00 instant. `dayOffset=1`이면 익일 00:00(포함 종료일의 배타 상한). 형식 불일치 → `undefined`. (달력 롤오버(예: 02-31)는 Date.UTC 의미론대로 수용 — `<input type="date">`는 생성하지 않는 값.)
- Produces: `kstMonthStartIso(nowMs: number): string` — KST 이번달 1일 00:00 instant.

- [ ] **Step 1: 착수 기록** — Run: `pnpm attempt F089`
- [ ] **Step 2: 실패하는 테스트** — `tests/unit/format.test.ts`에 추가:

```ts
describe("kstDateToIso / kstMonthStartIso (F089 — 기간 경계)", () => {
  it("KST 달력일 → 00:00 instant; dayOffset=1은 익일(포함 종료일의 배타 상한)", () => {
    expect(kstDateToIso("2026-07-23")).toBe("2026-07-22T15:00:00.000Z");
    expect(kstDateToIso("2026-07-23", 1)).toBe("2026-07-23T15:00:00.000Z");
    expect(kstDateToIso("2026-7-3")).toBeUndefined(); // 형식 불일치
    expect(kstDateToIso("junk")).toBeUndefined();
  });
  it("kstMonthStartIso: KST 달 1일 00:00 — UTC 말일 저녁은 KST 새달", () => {
    // 2026-07-31T16:00Z = KST 08-01 01:00 → 8월 시작(= 07-31T15:00Z)
    expect(kstMonthStartIso(Date.parse("2026-07-31T16:00:00.000Z"))).toBe("2026-07-31T15:00:00.000Z");
    // 2026-07-15T00:00Z = KST 07-15 09:00 → 7월 시작(= 06-30T15:00Z)
    expect(kstMonthStartIso(Date.parse("2026-07-15T00:00:00.000Z"))).toBe("2026-06-30T15:00:00.000Z");
  });
});
```

- [ ] **Step 3: 실패 확인** — Run: `pnpm test -- format` → FAIL
- [ ] **Step 4: 구현** — `format.ts` 끝에 (kstDayStartIso와 같은 순수 산술 — Intl 불사용):

```ts
/** F089 — a KST calendar date ("YYYY-MM-DD") → its KST 00:00 instant. dayOffset shifts calendar
 *  days (+1 = the EXCLUSIVE upper bound for an inclusive end date). Malformed input → undefined. */
export function kstDateToIso(date: string, dayOffset = 0): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return undefined;
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const utcMs = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dayOffset) - KST_OFFSET_MS;
  return new Date(utcMs).toISOString();
}

/** F089 — the KST first-of-month 00:00 instant for a given moment ('이번달' preset boundary). */
export function kstMonthStartIso(nowMs: number): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(nowMs + KST_OFFSET_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - KST_OFFSET_MS).toISOString();
}
```

- [ ] **Step 5: 통과 확인** — Run: `pnpm test -- format` → PASS
- [ ] **Step 6: Commit** — `feat(F089): KST 기간 경계 유틸 (kstDateToIso·kstMonthStartIso)`

---

### Task 7: [F089] `resolvePeriod` — URL 기간 파라미터 → repo 경계

**Files:**
- Create: `src/app/admin/orders/_lib/period.ts`
- Test: `tests/unit/admin-period.test.ts` (신규 — Task 8 테스트도 이 파일에 이어짐)

**Interfaces:**
- Consumes: Task 6 `kstDateToIso`/`kstMonthStartIso`, 기존 `kstDayStartIso`
- Produces: `resolvePeriod(params: { range?: string; from?: string; to?: string }, nowMs: number): { createdFrom?: string; createdTo?: string }` · `PERIOD_PRESETS: readonly { key, label }[]` (`today`·`7d`·`30d`·`month` / `오늘`·`7일`·`30일`·`이번달`)

- [ ] **Step 1: 실패하는 테스트** — `tests/unit/admin-period.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolvePeriod, PERIOD_PRESETS } from "../../src/app/admin/orders/_lib/period";

// F089 — 기간 해석은 이 순수 함수 하나가 유닛으로 고정 (F083 todayOrdersFilter 패턴:
// 조각이 아니라 페이지가 소비하는 조합 자체를 고정).

const NOW = Date.parse("2026-07-23T02:00:00.000Z"); // KST 2026-07-23 11:00

describe("resolvePeriod (F089)", () => {
  it("프리셋 4종 — KST 경계, 상한 없는 열린 구간", () => {
    expect(resolvePeriod({ range: "today" }, NOW)).toEqual({ createdFrom: "2026-07-22T15:00:00.000Z" });
    expect(resolvePeriod({ range: "7d" }, NOW)).toEqual({ createdFrom: "2026-07-16T15:00:00.000Z" }); // 오늘 포함 7일
    expect(resolvePeriod({ range: "30d" }, NOW)).toEqual({ createdFrom: "2026-06-23T15:00:00.000Z" });
    expect(resolvePeriod({ range: "month" }, NOW)).toEqual({ createdFrom: "2026-06-30T15:00:00.000Z" });
  });
  it("from/to — 종료일 포함(익일 00:00 배타 상한); range 동시 존재 시 range 우선", () => {
    expect(resolvePeriod({ from: "2026-07-01", to: "2026-07-23" }, NOW)).toEqual({
      createdFrom: "2026-06-30T15:00:00.000Z",
      createdTo: "2026-07-23T15:00:00.000Z",
    });
    expect(resolvePeriod({ from: "2026-07-01" }, NOW)).toEqual({ createdFrom: "2026-06-30T15:00:00.000Z" });
    expect(resolvePeriod({ range: "today", from: "2026-07-01", to: "2026-07-23" }, NOW)).toEqual({
      createdFrom: "2026-07-22T15:00:00.000Z",
    });
  });
  it("불량 입력 무시 — 형식 불일치·역전은 빈 기간, 미지의 range는 from/to로 폴스루", () => {
    expect(resolvePeriod({ from: "07/01/2026" }, NOW)).toEqual({});
    expect(resolvePeriod({ from: "2026-07-23", to: "2026-07-01" }, NOW)).toEqual({}); // 역전
    expect(resolvePeriod({ range: "junk", from: "2026-07-01" }, NOW)).toEqual({
      createdFrom: "2026-06-30T15:00:00.000Z",
    });
    expect(resolvePeriod({}, NOW)).toEqual({});
  });
  it("PERIOD_PRESETS — UI가 도는 어휘 그대로", () => {
    expect(PERIOD_PRESETS.map((p) => p.key)).toEqual(["today", "7d", "30d", "month"]);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test -- admin-period` → FAIL (period.ts 부재)
- [ ] **Step 3: 구현** — `src/app/admin/orders/_lib/period.ts`:

```ts
import { kstDayStartIso, kstDateToIso, kstMonthStartIso } from "../../../_components/order/format";

/**
 * F089 — /admin/orders 기간 파라미터 해석. 페이지는 이 반환값을 그대로 repo 필터에 얹는다 —
 * 조각이 아니라 이 조합 자체가 유닛으로 고정된다(F083 todayOrdersFilter 패턴).
 * 의미론: range 프리셋은 KST 열린 구간(상한 없음), from/to는 KST 달력일(종료일 포함 = 익일
 * 00:00 배타 상한). range·from/to 동시 존재 시 range 우선. 불량 입력(형식·역전)은 무시.
 */
export type Period = { createdFrom?: string; createdTo?: string };

export const PERIOD_PRESETS = [
  { key: "today", label: "오늘" },
  { key: "7d", label: "7일" },
  { key: "30d", label: "30일" },
  { key: "month", label: "이번달" },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolvePeriod(
  params: { range?: string; from?: string; to?: string },
  nowMs: number,
): Period {
  switch (params.range) {
    case "today":
      return { createdFrom: kstDayStartIso(nowMs) };
    case "7d":
      return { createdFrom: kstDayStartIso(nowMs - 6 * DAY_MS) };
    case "30d":
      return { createdFrom: kstDayStartIso(nowMs - 29 * DAY_MS) };
    case "month":
      return { createdFrom: kstMonthStartIso(nowMs) };
    default: {
      // 미지의 range는 무시하고 from/to로 폴스루 (파라미터 단위 무시 — 스펙 §URL 계약)
      const createdFrom = params.from ? kstDateToIso(params.from) : undefined;
      const createdTo = params.to ? kstDateToIso(params.to, 1) : undefined;
      if (createdFrom && createdTo && createdFrom >= createdTo) return {}; // 역전 — 무시
      return { ...(createdFrom ? { createdFrom } : {}), ...(createdTo ? { createdTo } : {}) };
    }
  }
}
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm test -- admin-period` → PASS
- [ ] **Step 5: Commit** — `feat(F089): resolvePeriod — KST 기간 프리셋·from/to 해석`

---

### Task 8: [F089] repo `createdTo` + `sumAmount` (양 백엔드)

**Files:**
- Modify: `src/app/api/payments/_lib/orders.ts`
- Test: `tests/unit/admin-period.test.ts` (이어서 추가)

**Interfaces:**
- Produces: `OrderListFilter.createdTo?: string`(배타 상한), `OrderRepo.sumAmount(opts?: OrderListFilter): Promise<number>` — count와 동일 어휘·no-take. Prisma delegate에 `aggregate` 추가.

- [ ] **Step 1: 실패하는 테스트** — `tests/unit/admin-period.test.ts`에 이어서:

```ts
import {
  createOrderRepo,
  createPrismaOrderRepo,
  type OrderDraft,
} from "../../src/app/api/payments/_lib/orders";

function draft(over: Partial<OrderDraft> = {}): OrderDraft {
  return {
    amountWon: 43000,
    orderName: "탄생",
    qrVideoAddon: false,
    buyerName: "김부모",
    buyerEmail: "parent@example.com",
    items: [],
    ...over,
  };
}

function countFakeDb(calls: { count: unknown[] }, result = 0) {
  const order = {
    async count(args: unknown) {
      calls.count.push(args);
      return result;
    },
  };
  return async () => ({ order }) as never;
}

describe("OrderListFilter.createdTo (F089 — 배타 상한, 양 백엔드)", () => {
  it("in-memory: createdAt < createdTo; createdFrom과 반개구간; 깨진 값은 fail-loud", async () => {
    const repo = createOrderRepo();
    const id = (await repo.create(draft())).id;
    const created = (await repo.get(id))!.createdAt;
    const next = new Date(Date.parse(created) + 1).toISOString();
    expect(await repo.count({ createdTo: next })).toBe(1);
    expect(await repo.count({ createdTo: created })).toBe(0); // 배타
    expect(await repo.count({ createdFrom: created, createdTo: next })).toBe(1);
    await expect(repo.count({ createdTo: "junk" })).rejects.toThrow(); // parseInstant 동형
  });
  it("Prisma where: createdAt { gte, lt } — 단독 gte는 기존 형태 무회귀", async () => {
    const calls = { count: [] as unknown[] };
    const repo = createPrismaOrderRepo(countFakeDb(calls));
    await repo.count({ createdFrom: "2026-07-01T00:00:00.000Z", createdTo: "2026-07-24T00:00:00.000Z" });
    expect(calls.count[0]).toEqual({
      where: {
        createdAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lt: new Date("2026-07-24T00:00:00.000Z"),
        },
      },
    });
    await repo.count({ createdFrom: "2026-07-01T00:00:00.000Z" });
    expect(calls.count[1]).toEqual({ where: { createdAt: { gte: new Date("2026-07-01T00:00:00.000Z") } } });
  });
});

describe("OrderRepo.sumAmount (F089 — 전량, no-take)", () => {
  it("in-memory: 필터 교집합 위 금액 합 — 53건도 take 컷 없이 전량", async () => {
    const repo = createOrderRepo();
    for (let i = 0; i < 53; i++) await repo.create(draft({ amountWon: 1000 }));
    const paid = (await repo.create(draft({ amountWon: 49000 }))).id;
    await repo.markPaid(paid, "pk_s");
    expect(await repo.sumAmount()).toBe(53 * 1000 + 49000);
    expect(await repo.sumAmount({ status: "PAID" })).toBe(49000);
    expect(await repo.sumAmount({ status: "SHIPPED" })).toBe(0); // 공집합 = 0
  });
  it("Prisma: aggregate(_sum.amountWon) 계약 — where는 count와 동일 어휘, null→0, take 없음", async () => {
    const calls = { aggregate: [] as unknown[] };
    const order = {
      async aggregate(args: unknown) {
        calls.aggregate.push(args);
        return { _sum: { amountWon: null } };
      },
    };
    const repo = createPrismaOrderRepo(async () => ({ order }) as never);
    expect(await repo.sumAmount({ status: "PAID" })).toBe(0); // 빈 집합 null → 0
    expect(calls.aggregate[0]).toEqual({ where: { status: "PAID" }, _sum: { amountWon: true } });
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test -- admin-period` → FAIL
- [ ] **Step 3: 구현** — `orders.ts` 수정 5곳:

(a) `OrderListFilter`(L162)에 추가:

```ts
  /** F089 — EXCLUSIVE upper bound on createdAt (ISO instant; 종료일 포함 = 익일 00:00). */
  createdTo?: string;
```

(b) `parseCreatedFrom`(L184)을 일반화 — 함수를 교체하고 기존 호출 2곳(`matchesListFilter`, `buildListWhere`)을 맞춘다:

```ts
/** F083/F089 — invalid instants fail LOUD in both backends alike (silent full-match would diverge). */
function parseInstant(iso: string, field: "createdFrom" | "createdTo"): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`Invalid ${field} instant.`);
  return ms;
}
```

(c) `matchesListFilter`(L174)에 createdFrom 줄 아래로 추가 (기존 줄은 `parseInstant(opts.createdFrom, "createdFrom")`으로 변경):

```ts
  if (opts.createdTo && Date.parse(o.createdAt) >= parseInstant(opts.createdTo, "createdTo")) return false;
```

(d) `OrderListWhere`(L513) `createdAt`을 `createdAt?: { gte?: Date; lt?: Date };`로. `buildListWhere`(L573)의 createdFrom 줄을 교체:

```ts
  if (opts.createdFrom || opts.createdTo) {
    where.createdAt = {
      ...(opts.createdFrom ? { gte: new Date(parseInstant(opts.createdFrom, "createdFrom")) } : {}),
      ...(opts.createdTo ? { lt: new Date(parseInstant(opts.createdTo, "createdTo")) } : {}),
    };
  }
```

(e) `sumAmount` — `OrderRepo` 인터페이스(count 선언 아래), 양 백엔드, delegate:

```ts
  /** F089 — honest full sum (₩) over the SAME filter vocabulary as count — NO take cut. */
  sumAmount(opts?: OrderListFilter): Promise<number>;
```

in-memory (`count` 아래):

```ts
    async sumAmount(opts = {}) {
      // count와 동일 술어·전량 — 합계줄이 50행 슬라이스의 합이 되는 일은 없다 (F082 원칙).
      return [...map.values()]
        .filter((o) => matchesListFilter(o, opts))
        .reduce((sum, o) => sum + o.amountWon, 0);
    },
```

`OrderDelegate`(L519)에 추가:

```ts
  aggregate(args: {
    where: OrderListWhere;
    _sum: { amountWon: true };
  }): Promise<{ _sum: { amountWon: number | null } }>;
```

Prisma (`count` 아래):

```ts
    async sumAmount(opts = {}) {
      const db = await getDb();
      const res = await (db.order as OrderDelegate).aggregate({
        where: buildListWhere(opts),
        _sum: { amountWon: true },
      });
      return res._sum.amountWon ?? 0; // 빈 집합은 null — 0으로 정규화
    },
```

- [ ] **Step 4: 통과 + 회귀** — Run: `pnpm test -- admin-period cancel-queue dashboard-counts orders-prisma` → PASS
- [ ] **Step 5: Commit** — `feat(F089): OrderListFilter.createdTo + OrderRepo.sumAmount (양 백엔드 동형)`

---

### Task 9: [F089] 기간 UI + 합계줄

**Files:**
- Modify: `src/app/admin/orders/page.tsx`
- Modify: `src/app/admin/admin.module.css`

**Interfaces:**
- Consumes: Task 7 `resolvePeriod`/`PERIOD_PRESETS`, Task 8 `sumAmount`
- Produces: testids `admin-range-<key>`(프리셋 4종), `admin-period-form`, `admin-orders-summary`

- [ ] **Step 1: page.tsx 수정 4곳**:

(a) import에 `resolvePeriod, PERIOD_PRESETS`(`./_lib/period`) 추가. `searchParams` 타입을:

```ts
  searchParams: Promise<{ status?: string; queue?: string; page?: string; range?: string; from?: string; to?: string }>;
```

(b) `listFilter` 조립과 fetch를 교체 (`const page = parsePage(params.page);` 아래):

```ts
  const period = resolvePeriod(params, Date.now());
  const listFilter = {
    ...(cancelQueue ? { cancelRequested: true as const } : { status: filter }),
    ...period,
  };
  const repo = orderRepo();
  const [orders, total, sum, cancelQueueCount] = await Promise.all([
    repo.listRecent({ ...listFilter, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    repo.count(listFilter),
    repo.sumAmount(listFilter), // 합계줄 — 필터 전량 (take 컷 아님)
    repo.count({ cancelRequested: true }),
  ]);
```

(c) `keep`에 기간 파라미터 추가 (활성 range가 있으면 from/to는 이미 무시되는 의미론 그대로 보존):

```ts
  const keep: Record<string, string | undefined> = {
    status: filter,
    queue: cancelQueue ? "cancel-requested" : undefined,
    range: params.range,
    from: params.from,
    to: params.to,
  };
```

(d) 상태 필터 `</ul>` 바로 아래에 기간 프리셋 줄 + GET 폼 + 합계줄 삽입 (empty/table 분기 위):

```tsx
          <ul className={styles.filters} data-testid="admin-period-presets">
            <li>
              <Link
                href={`/admin/orders${buildQuery({ status: filter, queue: keep.queue })}`}
                className={`${styles.filterLink} ${!params.range && !params.from && !params.to ? styles.filterActive : ""}`}
              >
                전체 기간
              </Link>
            </li>
            {PERIOD_PRESETS.map((p) => (
              <li key={p.key}>
                <Link
                  href={`/admin/orders${buildQuery({ status: filter, queue: keep.queue, range: p.key })}`}
                  className={`${styles.filterLink} ${params.range === p.key ? styles.filterActive : ""}`}
                  data-testid={`admin-range-${p.key}`}
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
          <form method="get" action="/admin/orders" className={styles.toolbar} data-testid="admin-period-form">
            {filter ? <input type="hidden" name="status" value={filter} /> : null}
            {cancelQueue ? <input type="hidden" name="queue" value="cancel-requested" /> : null}
            <label className={styles.toolLabel}>
              시작일
              <input type="date" name="from" defaultValue={params.from ?? ""} className={styles.moveInput} />
            </label>
            <label className={styles.toolLabel}>
              종료일
              <input type="date" name="to" defaultValue={params.to ?? ""} className={styles.moveInput} />
            </label>
            <button type="submit" className={styles.toolButton}>적용</button>
          </form>
          <p className={styles.summary} data-testid="admin-orders-summary">
            총 {total}건 · {formatWon(sum)}
          </p>
```

- [ ] **Step 2: CSS 추가** — `admin.module.css` 끝에:

```css
/* F089 — period toolbar + summary line */
.toolbar { display: flex; gap: var(--space-sm); align-items: flex-end; flex-wrap: wrap; margin: 0 0 var(--space-sm); }
.toolLabel {
  display: flex; flex-direction: column; gap: var(--space-xs);
  font-family: var(--font-grotesk); font-weight: 600; font-size: 0.78rem; letter-spacing: 0; color: var(--ink);
}
.toolButton {
  font-family: var(--font-grotesk); font-weight: 600; font-size: 0.82rem; letter-spacing: 0;
  color: var(--ink); background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 0.55em 1em; cursor: pointer;
}
.toolButton:hover { border-color: var(--ink); }
.toolButton:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.summary {
  margin: 0 0 var(--space-xs); font-family: var(--font-grotesk); font-weight: 600;
  font-size: 0.85rem; letter-spacing: 0; color: var(--ink); font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: 무회귀 확인** — Run: `pnpm test:e2e -- admin-orders.spec.ts admin-orders-table.spec.ts admin-cancel-queue.spec.ts` → PASS
- [ ] **Step 4: Commit** — `feat(F089): 기간 프리셋·직접 지정 UI + 합계줄`

---

### Task 10: [F089] 자체 E2E + DoD 마감

**Files:**
- Create: `tests/e2e/admin-orders-period.spec.ts`
- Modify: `feature_list.json` (F089), `PROGRESS.md`

- [ ] **Step 1: E2E 작성**:

```ts
import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F089 — 기간 필터 + 합계줄. KST 경계·전량 합계의 정확값은 유닛 소관(resolvePeriod·sumAmount);
// E2E는 멤버십(기간 안/밖)·형식·교집합만 단언 (F082/F083 패턴).

test.describe("admin orders period filter + sum (F089)", () => {
  test("프리셋·직접 지정·합계줄·상태 교집합", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "f089-period@example.com" });
    await loginAs(page, "admin+f089period@example.com");

    // 프리셋 '오늘' — 방금 만든 주문은 기간 안 (링크 클릭 경로)
    await page.goto("/admin/orders");
    await page.getByTestId("admin-range-today").click();
    await page.waitForURL(/range=today/);
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toBeVisible();
    await expect(page.getByTestId("admin-orders-summary")).toHaveText(/^총 \d+건 · [\d,]+원$/);

    // 직접 지정: 과거 창(2000년) — 어떤 주문도 없다 (병렬 스위트에서도 결정론)
    await page.goto("/admin/orders?from=2000-01-01&to=2000-01-02");
    await expect(page.getByTestId("admin-order-row")).toHaveCount(0);
    await expect(page.getByTestId("admin-orders-summary")).toHaveText("총 0건 · 0원");
    await expect(page.getByTestId("admin-orders-empty")).toBeVisible();

    // 종료일 포함: 오늘을 종료일로 지정하면 오늘 주문이 잡힌다 (KST 정확 경계는 유닛)
    const kstToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    await page.goto(`/admin/orders?from=2000-01-01&to=${kstToday}`);
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toBeVisible();

    // 상태 × 기간 교집합
    await page.goto("/admin/orders?status=PAID&range=today");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toBeVisible();
    await page.goto("/admin/orders?status=CANCELLED&range=today");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toHaveCount(0);
  });
});
```

- [ ] **Step 2: 격리 실행** — Run: `pnpm test:e2e -- admin-orders-period.spec.ts` → PASS
- [ ] **Step 3: 전체 게이트** — Run: `pnpm check` 그린 + `pnpm test:e2e` 전체 그린
- [ ] **Step 4: feature_list 마감** — F089 `passing`/`passes:true`/`evidence` (스텝 귀속: 멤버십·교집합·형식=E2E, KST 경계·전량 합계·no-take=유닛)
- [ ] **Step 5: 마무리 커밋** — `PROGRESS.md` + `pnpm attempt F089 --reset` → commit: `feat(F089): 기간 필터 + 합계줄 (passes:true)`

---

### Task 11: [F090] repo `search` (양 백엔드)

**Files:**
- Modify: `src/app/api/payments/_lib/orders.ts`
- Test: `tests/unit/admin-search.test.ts` (신규)

**Interfaces:**
- Produces: `OrderListFilter.search?: string` — trim 후 빈값 무시; `id` **정확 일치**(대소문자 구분, trim만) OR `buyerName`/`buyerEmail` **부분 일치**(case-insensitive). 타 필터와 교집합.

- [ ] **Step 1: 착수 기록** — Run: `pnpm attempt F090`
- [ ] **Step 2: 실패하는 테스트** — `tests/unit/admin-search.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  createOrderRepo,
  createPrismaOrderRepo,
  type OrderDraft,
} from "../../src/app/api/payments/_lib/orders";

// F090 — search 술어: id 정확 OR 이름/이메일 부분(case-insensitive), trim, 교집합 — 양 백엔드 동형.

function draft(over: Partial<OrderDraft> = {}): OrderDraft {
  return {
    amountWon: 43000,
    orderName: "탄생",
    qrVideoAddon: false,
    buyerName: "김부모",
    buyerEmail: "parent@example.com",
    items: [],
    ...over,
  };
}

describe("OrderListFilter.search (F090, in-memory)", () => {
  it("id 정확 / 이름·이메일 부분(case-insensitive) / trim / 빈값 무시 / 교집합", async () => {
    const repo = createOrderRepo();
    const a = (await repo.create(draft({ buyerName: "김민준", buyerEmail: "MinJun@Example.com" }))).id;
    await repo.create(draft({ buyerName: "이서연", buyerEmail: "seoyeon@example.com" }));

    expect(await repo.count({ search: a })).toBe(1); // id 정확
    expect(await repo.count({ search: ` ${a} ` })).toBe(1); // trim
    expect(await repo.count({ search: "민준" })).toBe(1); // 이름 부분
    expect(await repo.count({ search: "minjun@" })).toBe(1); // 이메일 대소문자 무시
    expect(await repo.count({ search: "example.com" })).toBe(2);
    expect(await repo.count({ search: "없는사람" })).toBe(0);
    expect(await repo.count({ search: "" })).toBe(2); // 빈 검색 = 필터 없음
    expect(await repo.count({ search: "   " })).toBe(2);

    await repo.markPaid(a, "pk_a");
    expect(await repo.count({ search: "민준", status: "PAID" })).toBe(1); // 교집합
    expect(await repo.count({ search: "서연", status: "PAID" })).toBe(0);
  });
});

describe("OrderListFilter.search (F090, Prisma where 계약)", () => {
  function countFakeDb(calls: { count: unknown[] }) {
    const order = {
      async count(args: unknown) {
        calls.count.push(args);
        return 0;
      },
    };
    return async () => ({ order }) as never;
  }

  it("OR [id 정확, buyerName/buyerEmail contains insensitive]; 공백뿐이면 where에 부재", async () => {
    const calls = { count: [] as unknown[] };
    const repo = createPrismaOrderRepo(countFakeDb(calls));
    await repo.count({ search: " ord_x1 " });
    expect(calls.count[0]).toEqual({
      where: {
        OR: [
          { id: "ord_x1" },
          { buyerName: { contains: "ord_x1", mode: "insensitive" } },
          { buyerEmail: { contains: "ord_x1", mode: "insensitive" } },
        ],
      },
    });
    await repo.count({ search: "   " });
    expect(calls.count[1]).toEqual({ where: {} });
    await repo.count({ search: "부모", status: "PAID" }); // 교집합: status와 OR 공존
    expect(calls.count[2]).toEqual({
      where: {
        status: "PAID",
        OR: [
          { id: "부모" },
          { buyerName: { contains: "부모", mode: "insensitive" } },
          { buyerEmail: { contains: "부모", mode: "insensitive" } },
        ],
      },
    });
  });
});
```

- [ ] **Step 3: 실패 확인** — Run: `pnpm test -- admin-search` → FAIL
- [ ] **Step 4: 구현** — `orders.ts` 수정 3곳:

(a) `OrderListFilter`에:

```ts
  /** F090 — trim 후 빈값 무시. id 정확 일치 OR buyerName/buyerEmail 부분 일치(case-insensitive).
   *  PII 주의: 검색어·매칭 대상 모두 렌더만 — 로그/트레이스 금지(E3). */
  search?: string;
```

(b) `matchesListFilter` 마지막 `return true;` 위에:

```ts
  if (opts.search !== undefined) {
    const raw = opts.search.trim();
    if (raw) {
      const q = raw.toLowerCase();
      const hit =
        o.id === raw ||
        o.buyerName.toLowerCase().includes(q) ||
        o.buyerEmail.toLowerCase().includes(q);
      if (!hit) return false;
    }
  }
```

(c) `OrderListWhere`에:

```ts
  OR?: Array<
    | { id: string }
    | { buyerName: { contains: string; mode: "insensitive" } }
    | { buyerEmail: { contains: string; mode: "insensitive" } }
  >;
```

`buildListWhere` 마지막 `return where;` 위에 (in-memory 술어의 미러):

```ts
  if (opts.search !== undefined) {
    const raw = opts.search.trim();
    if (raw) {
      where.OR = [
        { id: raw },
        { buyerName: { contains: raw, mode: "insensitive" } },
        { buyerEmail: { contains: raw, mode: "insensitive" } },
      ];
    }
  }
```

- [ ] **Step 5: 통과 + 회귀** — Run: `pnpm test -- admin-search admin-period cancel-queue dashboard-counts` → PASS
- [ ] **Step 6: Commit** — `feat(F090): OrderListFilter.search — id 정확 OR 이름/이메일 부분 일치 (양 백엔드)`

---

### Task 12: [F090] 검색 UI + 자체 E2E + DoD 마감

**Files:**
- Modify: `src/app/admin/orders/page.tsx`
- Create: `tests/e2e/admin-orders-search.spec.ts`
- Modify: `feature_list.json` (F090), `PROGRESS.md`

**Interfaces:**
- Consumes: Task 11 `search`, Task 9의 GET 폼(`admin-period-form`)
- Produces: testids `admin-search-input`, `admin-search-submit`

- [ ] **Step 1: page.tsx 수정 3곳**:

(a) `searchParams` 타입에 `q?: string;` 추가. (b) `listFilter`에 검색어 반영 + `keep`에 `q` 추가:

```ts
  const q = params.q?.trim() || undefined;
  const listFilter = {
    ...(cancelQueue ? { cancelRequested: true as const } : { status: filter }),
    ...period,
    ...(q ? { search: q } : {}),
  };
```

(`keep` 객체에 `q,` 한 줄 추가.)

(c) Task 9의 GET 폼 안, 종료일 label 뒤에:

```tsx
            <label className={styles.toolLabel}>
              검색
              <input
                type="search"
                name="q"
                defaultValue={q ?? ""}
                placeholder="주문번호·구매자명·이메일"
                className={styles.moveInput}
                data-testid="admin-search-input"
              />
            </label>
```

그리고 `적용` 버튼에 `data-testid="admin-search-submit"` 추가. 폼이 기간과 검색을 함께 제출하므로 range 활성 상태에서 검색하면 range를 hidden으로 보존한다 — hidden input 블록에 추가:

```tsx
            {params.range ? <input type="hidden" name="range" value={params.range} /> : null}
```

- [ ] **Step 2: E2E 작성** — `tests/e2e/admin-orders-search.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { completePaidOrder } from "./_helpers/tossMock";
import { loginAs } from "./_helpers/account";

// F090 — 검색. id는 전역 유일이라 q=<id>는 병렬 스위트에서도 정확히 1행(결정론);
// 이름 검색("김부모"는 공용 시드값)은 멤버십만 단언.

test.describe("admin orders search (F090)", () => {
  test("주문번호 정확 · 이메일/이름 부분(case-insensitive) · 교집합 · 0건", async ({ page }) => {
    const orderId = await completePaidOrder(page, { email: "f090-search@example.com" });
    await loginAs(page, "admin+f090search@example.com");

    // 검색 폼 경로: input → submit → q= 반영
    await page.goto("/admin/orders");
    await page.getByTestId("admin-search-input").fill(orderId);
    await page.getByTestId("admin-search-submit").click();
    await page.waitForURL(/q=/);
    await expect(page.getByTestId("admin-order-row")).toHaveCount(1); // id 유일 — 정확히 1행
    await expect(page.getByTestId("admin-order-row")).toContainText(orderId);

    // 이메일 부분 일치, 대소문자 무시
    await page.goto("/admin/orders?q=F090-SEARCH");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toBeVisible();

    // 구매자명 부분 일치 (멤버십만 — 김부모는 공용 시드)
    await page.goto("/admin/orders?q=부모");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: orderId })).toBeVisible();

    // 기존 필터와 교집합 — PAID 주문은 CANCELLED 필터 아래에선 검색돼도 0건
    await page.goto(`/admin/orders?status=CANCELLED&q=${orderId}`);
    await expect(page.getByTestId("admin-order-row")).toHaveCount(0);
    await expect(page.getByTestId("admin-orders-empty")).toBeVisible();

    // 0건 빈 상태
    await page.goto("/admin/orders?q=no-such-order-xyz-0090");
    await expect(page.getByTestId("admin-orders-empty")).toBeVisible();
  });
});
```

- [ ] **Step 3: 격리 실행** — Run: `pnpm test:e2e -- admin-orders-search.spec.ts` → PASS
- [ ] **Step 4: 전체 게이트** — Run: `pnpm check` 그린 + `pnpm test:e2e` 전체 그린 + `pnpm eval` 무회귀
- [ ] **Step 5: feature_list 마감** — F090 `passing`/`passes:true`/`evidence` (스텝 귀속: 폼 경로·멤버십·교집합·빈 상태=E2E, 술어 정밀 의미론(정확/부분/대소문자/trim/빈값)=유닛)
- [ ] **Step 6: 세션 마감 커밋** — `PROGRESS.md`(Handoff 포함) + `pnpm attempt F090 --reset` → commit: `feat(F090): 관리자 주문 검색 (passes:true)` → `docs/clean-state-checklist.md` 확인

---

## Self-Review 결과 (플랜 작성 시점)

- **스펙 커버리지**: 테이블/페이저(Task 2–5) · 기간/합계(Task 6–10) · 검색(Task 11–12) · feature_list 등록(Task 1) — 스펙의 URL 계약·PII 결정·testid 보존·컷 안내문 대체 모두 태스크에 반영. 커버리지 갭 없음.
- **의도된 비목표**: CSV·컬럼 정렬·매출 분해 패널 — 스펙 §비목표 그대로 제외.
- **주의(구현자가 확인)**: ① in-memory `create`는 같은 ms에 동일 `createdAt`을 찍을 수 있어 정렬이 비결정 — 순서 단언 유닛 금지(집합 단언만, Task 3 참조). ② 기존 유닛 `dashboard-counts.test.ts`가 `count` args를 `toEqual`로 고정 — `buildListWhere` 수정 후에도 단독 `gte` 형태가 보존되는지 회귀 실행 필수(Task 8 Step 4). ③ E2E 시드 API의 rate limit은 dev-auth 하에서만 바이패스 — E2E env 전제(기존 hermetic 설정 그대로면 충족).
