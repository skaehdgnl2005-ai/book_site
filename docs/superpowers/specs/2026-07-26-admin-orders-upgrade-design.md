# 어드민 주문 목록 개선 (F088–F090) — 설계 스펙

- 날짜: 2026-07-26 · 상태: **설계 승인됨(구현 전)** · 관련: F059(목록·상세) F082(취소요청 큐) F083(대시보드)
- 스코프 합의: 사용자 선택 = 기간 필터+총금액 집계 · 테이블형 목록+페이지네이션 · 검색. 총금액 의미 = **필터 결과 합계줄**. 레이아웃 = **테이블**.

## 배경

`/admin/orders`는 최신순 50건 일렬 리스트 + 상태/취소요청 필터가 전부다. 기간 조회, 금액
집계, 검색, 페이지네이션이 없고 50건 컷은 안내문으로만 보완된다. 어드민 **액션**(상태 전이·
환불 승인·가상계좌 처리·맞춤의뢰 관리·감사 로그)은 이미 존재하므로, 이번 범위는 **목록
UX + 집계·필터**다.

## 목표 / 비목표

**목표** (feature_list 신규 3건, 구현 순서대로):
1. **F088** 테이블형 목록 + 페이지네이션 (레이아웃을 먼저 깔아 이후 UI 재작업 제거)
2. **F089** 기간 필터(프리셋+직접 지정) + 합계줄(건수·총금액)
3. **F090** 검색(주문번호·구매자명·이메일)

**비목표**: CSV 내보내기, 컬럼 클릭 정렬, 대시보드 매출 요약 패널(매출−환불 분해),
클라이언트 인터랙티브 테이블, `/admin/custom` 목록 개편. (필요해지면 별도 피처로.)

## 아키텍처 결정

**서버 렌더 + URL 파라미터 확장** — 기존 `?status=`·`?queue=` 패턴의 연장. 필터 상태가
URL이라 공유·북마크 가능하고 E2E도 기존 패턴 그대로. 신규 API 라우트 0, 신규 클라이언트
컴포넌트 0(기존 패널 제외). 클라이언트 테이블(신규 admin API + PII 노출 표면 증가)은 기각.

## 데이터 계층 — `src/app/api/payments/_lib/orders.ts` (양 백엔드 동형)

- `OrderListFilter` 확장 (기존 규약 유지: 모든 제약은 **교집합**):
  - `createdTo?: string` — **배타적** 상한 ISO instant (`createdAt < createdTo`).
    invalid 값은 `createdFrom`의 `parseCreatedFrom` 선례대로 양 백엔드 동형 fail-loud.
  - `search?: string` — trim 후 빈 문자열이면 무시. 매칭 = `id` **정확 일치** OR
    `buyerName` 부분 일치 OR `buyerEmail` 부분 일치(부분 일치는 case-insensitive).
    Prisma: `OR: [{id: q}, {buyerName: {contains, mode: "insensitive"}}, {buyerEmail: …}]`,
    in-memory: 동형 술어.
- `sumAmount(filter): Promise<number>` 신설 — `count()`와 **같은 필터 어휘, take 컷 없음**
  (F082 "정직한 전량" 원칙). Prisma `aggregate({_sum: {amountWon}})`(null→0), in-memory reduce.
- `listRecent`에 `skip?: number`(기본 0) — Prisma `skip`/`take`, in-memory `slice(skip, skip+take)`.

## URL 계약 — `/admin/orders` (전부 GET, 기존 `status`/`queue`와 교집합 조합)

| 파라미터 | 의미 |
|---|---|
| `range=today\|7d\|30d\|month` | KST 프리셋. today=오늘 00:00부터, 7d=오늘 포함 7 KST일(오늘−6일 00:00부터), 30d=오늘−29일 00:00부터, month=이번달 1일 00:00부터. 상한 없음(열린 구간). |
| `from=YYYY-MM-DD` | KST 해당일 00:00 **포함** 하한 |
| `to=YYYY-MM-DD` | KST 해당일 **전체 포함** = 익일 00:00 배타 상한으로 변환 |
| `q=<검색어>` | trim, 빈값 무시 |
| `page=N` | 1-기반. 정수 아님·<1 → 1. `skip=(page-1)*50` |

- `range`와 `from`/`to`가 동시에 오면 **`range` 우선**, `from`/`to` 무시(UI는 동시 생성 안 함).
- 형식 불일치(`YYYY-MM-DD` 아님)·역전(`from`>`to`)은 해당 파라미터 무시(기존 status 검증 스타일).
- 페이지 링크·프리셋 링크·검색/기간 폼은 **다른 파라미터를 전부 보존**한다(폼은 hidden input).
- 기간 해석은 순수 함수로 고립: `src/app/admin/orders/_lib/period.ts` —
  `resolvePeriod(params, nowMs): {createdFrom?, createdTo?}`. `kstDayStartIso` 재사용 +
  `YYYY-MM-DD`(KST) → instant 변환 유틸(`format.ts`에 추가, month 시작도 순수 산술). 유닛이 경계를 고정.

## UI — DESIGN.md 토큰만 (헤어라인·radius 0·잉크네이비, 신규 CSS는 `admin.module.css`에)

**테이블 (F088)** — 시맨틱 `<table>`, `overflow-x: auto` 래퍼(모바일).
```
주문일    주문(주문명 · 구매자 / 보조줄: ID)    상태                 금액
─────────────────────────────────────────────────────────────────────
07-25    겨울잠 자러 가는 곰 · 김민준           제작중              49,000원
07-24    [맞춤] 우리 가족 이야기 · 이서연        취소요청 · 결제완료  119,000원
```
- 주문 셀이 상세 링크. `[맞춤]` 프리픽스·취소요청 배지 유지. 금액 우측 정렬(tabular-nums).
- 기존 `data-testid` **보존**: `admin-orders`(테이블), `admin-order-row`(행),
  `admin-order-link`, `admin-cancel-badge`, `admin-orders-empty` — 기존 E2E 무회귀를 마크업
  교체에도 testid 계약으로 지킨다.

**페이지네이션 (F088)** — 목록 하단 `← 이전 · {page} / {totalPages} · 다음 →`
(`totalPages = ceil(count/50)`, 1페이지면 미표시). 범위 밖 `page`는 빈 목록 정직 렌더
(클램프·리다이렉트 없음), 링크는 유효 페이지만 제공. F082의 컷 안내문(`admin-queue-cut-note`)은
페이지네이션이 대체하므로 **제거**(전량 접근 가능해짐; 배지 전량 카운트는 무변경. 기존 E2E에
해당 testid 단언 없음 — grep 실측).

**합계줄 (F089)** — 목록 위 `총 {count}건 · {formatWon(sum)}`
(`data-testid="admin-orders-summary"`). 현재 필터+기간의 **전량** 기준(50건 컷 아님).
의미: 잡힌 주문들의 결제 금액 합계 — 상태 필터와 조합해 해석한다(예: REFUNDED 필터 시 환불건
합계). 순매출 분해는 비목표. 라벨은 "합계"로 정직하게.

**기간 UI (F089)** — 프리셋 링크 줄(전체 · 오늘 · 7일 · 30일 · 이번달, active 표시 기존
`filterActive` 스타일 재사용) + GET 폼(시작일·종료일 `<input type="date">` + 적용 버튼).

**검색 (F090)** — 같은 GET 폼 영역에 `q` input(placeholder: 주문번호·구매자명·이메일) +
검색 버튼. 0건이면 기존 empty 문구 경로 재사용.

## PII 결정 (명시적 트레이드오프)

- `q`는 GET 파라미터 — 구매자명 검색 시 이름이 URL 쿼리에 실린다. **앱** 로그/트레이스에는
  안 남는다(어드민 경로 로깅 0 유지, E3·R13 무변경). 단 Vercel 인프라 요청 로그에는 남을 수
  있음 — 어드민 전용 화면이므로 수용하고, 주문번호 위주 운영을 권장. POST 대안은 공유·
  페이지네이션이 깨져 기각.
- 신규 코드 경로 어디에도 `buyerName`/`buyerEmail`/검색어를 로그·트레이스에 기록하지 않는다.

## 피처 분해 (feature_list.json에 append-only 추가 — R9 합치, 초기 `state:"todo"` · `passes:false`)

공통: `category:"admin"`, `track:"product"`, WIP=1로 순서대로. 각 피처는
`pnpm attempt` → 유닛+자체 E2E → `pnpm check` 그린 → `passes:true`+evidence의 기존 DoD.

**F088 — 관리자 주문 목록 테이블 + 페이지네이션** (`admin-orders-table.spec.ts`)
1. `/admin/orders`가 테이블(주문일·주문·상태·금액)로 렌더되고 행 링크로 상세에 진입한다
2. 51건 이상일 때 페이지 링크로 다음 페이지 주문을 볼 수 있고, 페이지 링크는 기존 필터를 보존한다
3. 기존 상태·취소요청 필터/배지 계약 무회귀 (컷 안내문은 페이지네이션으로 대체)

**F089 — 기간 필터 + 합계줄** (`admin-orders-period.spec.ts`)
1. 프리셋(오늘/7일/30일/이번달) 클릭 시 해당 KST 기간의 주문만 보인다 — 경계는 유닛이 고정
2. 시작일·종료일 직접 지정이 반영된다(종료일 포함)
3. 합계줄의 건수·총금액은 필터 전량 기준이다(50건 컷 아님 — 전량성은 유닛 소관)
4. 상태 필터와 기간 필터가 교집합으로 조합된다

**F090 — 주문 검색** (`admin-orders-search.spec.ts`)
1. 주문번호 정확 일치 검색이 된다
2. 구매자명/이메일 부분 일치(case-insensitive) 검색이 된다
3. 기존 필터와 조합되고, 0건이면 빈 상태 문구가 보인다

**유닛 대상**: `resolvePeriod` KST 경계(프리셋 4종·from/to 변환·역전/invalid), `search` 술어
양 백엔드 동형, `sumAmount` 전량·no-take·Prisma aggregate 계약(fake delegate),
`skip` 페이징 슬라이스. **E2E 주의**: 전량 카운트·합계는 fullyParallel 전역 상태라 정확값
단언은 유닛 소관, E2E는 멤버십·형식 단언(F082/F083 확립 패턴).

## 리스크

- 병렬 E2E 비결정론 → 위 단언-귀속 패턴으로 회피.
- Prisma `aggregate`는 fake delegate 계약 테스트 수준(hermetic 스위트는 in-memory —
  `orders-prisma.test` 선례와 동일 정직 고지).
- 테이블 마크업 교체가 기존 어드민 E2E를 건드릴 위험 → `data-testid` 계약 보존으로 설계;
  불가피한 최소 단언 수정은 해당 피처 evidence에 기록.
