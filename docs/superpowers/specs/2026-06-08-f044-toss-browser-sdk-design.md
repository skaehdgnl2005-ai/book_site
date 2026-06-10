# F044 — 실 TossPayments 브라우저 SDK 결제 (설계 스펙)

> Status: **DESIGN — awaiting user review** · Date: 2026-06-08 · Track: product · Category: checkout
> Decision record (at implementation): **ADR-0019**. Supersedes the F012/ADR-0013 D1 "hermetic sandbox stand-in" seam.

## 1. 문제 / 맥락

그림책 제작소는 Vercel + Supabase 로 라이브(`https://storybook-shop.vercel.app`)지만 prod 에서
`POST /api/payments/create` 가 **503** 을 반환해 실제 결제가 불가능하다. 이는 의도된 미완 seam 이다:

- ADR-0013 D1 — 실제 Toss 호스티드 결제창은 헤르메틱 E2E(서버 1개·DB 없음·네트워크 없음)에서 열 수 없어,
  비-prod 에서는 `/checkout/pay` 내부 페이지(sandbox stand-in)로 대체했다.
- [create/route.ts:19-21](../../../src/app/api/payments/create/route.ts#L19-L21) — `APP_ENV==="production"` 이면 503.
- DEPLOY.md §10 #1 — "Real Toss browser SDK (highest-priority blocker)": `@tosspayments/tosspayments-sdk` 의
  `requestPayment` 연동 → success 콜백 → `/api/payments/confirm` → 503 제거.

서버 측 결제 처리(`confirmPayment`, 서버 권위 금액 재계산, 멱등 `markPaid`, 주문 영속화)는 **이미 완성**돼 있다.
F044 가 새로 만드는 것은 **브라우저 SDK 호출 + success 콜백 페이지**뿐이며, 마지막에 503 게이트를 제거한다.

근거: DEPLOY.md §10 #1, ADR-0013(named seam: 서버 confirm + 금액 재계산), ADR-0016(durable persistence).

## 2. 목표 / 비목표

**목표**
- prod 에서 실제 TossPayments **테스트(샌드박스)** 결제창을 브라우저 SDK 로 연다.
- 성공 → 기존 `/api/payments/confirm` 로 `PAID`. 실패/취소를 명확히 처리.
- prod/test **단일 클라이언트 코드 경로**(APP_ENV 분기 없음)로 통합. `/checkout/pay` sandbox 제거.
- 503 게이트 제거.

**비목표 (명시적 제외 — 별도 F-item)**
- **Webhook 강화(F045 신규 등록):** 실제 Toss 서명 스킴 매핑 + boot-required `TOSS_WEBHOOK_SECRET`.
  F044 의 PAID 경로는 success-콜백 confirm 하나이며, 이는 webhook seam 과 **정합성상 한 쌍**이다(§9 한계 참조).
  TEST 키 환경에서는 현재 무해하므로 분리한다(DEPLOY §10 #2).
- 라이브 키 결제(별도 F-item; `assertTestKey` 완화 + `pnpm approve toss.charge.live`). F044 는 **건드리지 않음**.
- 사진 업로드 4.5MB 캡(DEPLOY §10), 실 buyer 인증(DEPLOY §10 #3) — 무관.

## 3. 결정 — 통합 단일 SDK 경로 (사용자 승인됨)

핵심 원칙: **prod 와 test 가 동일한 클라이언트 코드**를 실행한다. 유일한 차이는 "런타임에 로드되는 SDK 가
진짜(prod)냐, Playwright 가 미리 심은 가짜(E2E)냐"이며, **prod 코드에는 테스트 전용 훅이 0줄**이다.

대안(병행: sandbox 유지 + prod 분기)은 거부 — 클라이언트 2경로 공존(유지보수 비용) + prod 경로가 신규 스펙
1개로만 커버되는 회귀 취약성 때문. (§13 거부안 참조)

## 4. 아키텍처 & end-to-end 흐름

```
/cart → /checkout (CheckoutView: buyer 이름·이메일)
   │  결제하기 클릭 → POST /api/payments/create
   ▼  서버: untrusted(body) → buildOrderDraft(금액 서버 재계산) → orderRepo.create (CREATED)
   │       응답 = createCheckout() 의 공개 필드(현재는 버려짐)
   ▼  200 { orderId, clientKey, amount, orderName, successUrl, failUrl }   ← 503 제거
클라이언트 requestTossPayment(checkout):
   loadTossPayments(clientKey)
     .payment({ customerKey: ANONYMOUS })
     .requestPayment({ method:"CARD", amount:{currency:"KRW", value: <create응답.amount 그대로>},
                       orderId, orderName, successUrl, failUrl })
   │  → 실제 Toss 호스티드 결제창 오픈
   ├─ 성공 → successUrl = /checkout/success?paymentKey&orderId&amount
   │     /checkout/success (신규, 서버 컴포넌트 — searchParams prop 으로 paymentKey/orderId 수신):
   │        서버에서 confirmPayment(orderRepo(), checkoutProvider(), {orderId, paymentKey})  ← amount 쿼리는 무시(변조 무력화)
   │           confirmPayment: order.status==="PAID"면 단락(B2) / 아니면 provider.confirm → markPaid
   │        → PAID: client 자식 ClearCartRedirect 가 clearCart() → /orders/[id] (기존 확인 페이지, 무변경)
   │        → 비-PAID: 서버 redirect("/checkout/failed?code=CONFIRM_FAILED")
   └─ 실패/취소 → failUrl = /checkout/failed?code&message&orderId
         /checkout/failed:
            code==="PAY_PROCESS_CANCELED" → redirect /cart (F016 계약 보존, 장바구니 자연 보존)
            그 외 → 실패 메시지 표시(F015), 장바구니 보존
```

서버(`confirmPayment`/`orderRepo`/금액 재계산)는 재사용. 신규는 클라이언트 SDK 호출 + success/failed 페이지뿐.

## 5. 컴포넌트 / 파일

**신규**
- `src/app/checkout/_lib/tossClient.ts` — `requestTossPayment(checkout)`: `loadTossPayments`→`payment({customerKey: ANONYMOUS})`→`requestPayment`.
  SDK 경계를 한 함수로 격리(테스트·교체·에러처리 단일 지점).
- `src/app/checkout/success/page.tsx` (+ `ClearCartRedirect.tsx`) — **서버 컴포넌트**: Toss success 리다이렉트를
  `searchParams` prop 으로 받아 서버에서 `confirmPayment` 직접 호출(HTTP fetch 없음). PAID 시 작은 client 자식
  `ClearCartRedirect` 가 `clearCart()` 후 `/orders/[id]` 이동, 비-PAID 시 서버 `redirect("/checkout/failed?code=CONFIRM_FAILED")`.
  (서버가 searchParams 를 읽으므로 `useSearchParams`/`<Suspense>` 불필요 — Next 15 표준.)
- `tests/e2e/_helpers/tossMock.ts` — 공통 목 헬퍼(§7).
- `tests/e2e/checkout-toss-sdk.spec.ts` — F044 자체 E2E.

**수정**
- [create/route.ts](../../../src/app/api/payments/create/route.ts) — 503 게이트 **제거**; 응답을
  `{orderId, payUrl}` → `{orderId, clientKey, amount, orderName, successUrl, failUrl}`(=`createCheckout()` 결과 활용).
  successUrl=`${origin}/checkout/success`, failUrl=`${origin}/checkout/failed`.
- [CheckoutView.tsx](../../../src/app/checkout/CheckoutView.tsx) — `router.push(payUrl)` → `requestTossPayment(응답)`.
  try/catch 로 SDK 로드/요청 실패 시 에러 표시 + 장바구니 보존(submitting 해제).
- [checkout/failed/page.tsx](../../../src/app/checkout/failed/page.tsx) — `code` 쿼리 읽어 `PAY_PROCESS_CANCELED`→`/cart`
  리다이렉트, 그 외 실패 메시지.
- [_lib/checkout.ts](../../../src/app/api/payments/_lib/checkout.ts) `confirmPayment` — PAID 단락 추가(§8 B2).
- `package.json` — `@tosspayments/tosspayments-sdk` 추가(설치 시점 최신 — 현재 2.7.x; param/타입은 2.5↔2.7 동일).

**제거**
- `src/app/checkout/pay/page.tsx` + `src/app/checkout/pay/PaySandbox.tsx` — sandbox stand-in.

## 6. 영향받는 기존 E2E 스펙 (7개 — 실측 인벤토리)

`/checkout/pay` 경유로 깨지는 스펙(공통 헬퍼로 일괄 이전):

| 스펙 | 피처 | 현재 의존 | 이전 방식 |
|---|---|---|---|
| checkout-start.spec.ts | F012 | `toHaveURL(/\/checkout\/pay\?order=ord_/)` + pay-amount/pay-order-name | 결제하기 → 목 success 리다이렉트 검증 |
| checkout-success.spec.ts | F013 | `/checkout/pay` + `pay-approve` | `completePaidOrder()` → /orders PAID |
| order-confirm.spec.ts | F014 | reachPay → `/checkout/pay` → /orders | `completePaidOrder()` |
| checkout-failed.spec.ts | F015 | reachPay → `pay-fail` | `payFail()` → /checkout/failed 메시지 |
| checkout-cancel.spec.ts | F016 | reachPay → `pay-cancel` → /cart | `payCancel()` → /cart 보존(계약 동일) |
| mypage-photo.spec.ts | F017 | `/checkout/pay` → /orders (PAID 도달) | `completePaidOrder()` |
| mypage-finish.spec.ts | F018 | `/checkout/pay` → /orders (PAID 도달) | `completePaidOrder()` |

내부만 재작성; **스펙 파일명 불변** → 각 피처의 `verification` 필드 유효 유지.

## 7. 검증 전략 (핵심)

### 7a. 헤르메틱 E2E — `addInitScript` 전역 주입 (실측 근거)

설치 SDK `@tosspayments/tosspayments-sdk` 소스 실측(어드버서리얼 리뷰가 2.7.0 tarball `dist/index.esm.js` 로 확인):
- thin 로더가 런타임에 `<script src="https://js.tosspayments.com/v2/standard">` 주입(`SCRIPT_URL` 상수).
- **로드 전에 `if (getNamespace('TossPayments') != null) return resolve(...)`** — `window.TossPayments` 가 이미
  있으면 **CDN fetch 없이 즉시 그 전역을 반환**.

→ 가장 견고한 목: **`page.addInitScript`로 페이지 스크립트보다 먼저 `window.TossPayments` 를 심는다.** 로더가
단락되어 CDN 을 건드리지 않으므로 (1) 라우트 가로채기 의존 없음 (2) 래퍼 내부 폴링/무결성 로직 의존 없음
(3) prod 코드 테스트 훅 0줄(목은 전적으로 Playwright 측). 보강: `page.route('https://js.tosspayments.com/**', r=>r.abort())`
로 전역 누락 시 실제 CDN 으로 새지 않고 즉시 실패.

가짜 전역의 형태(설치 SDK 타입 실측 기준):
```js
// tossMock.ts (개념)
window.TossPayments = (_clientKey) => ({
  payment: (_initParams) => ({
    requestPayment: async (o) => {
      const outcome = "<test가 주입한 success|cancel|fail>";
      if (outcome === "success")
        location.assign(`${o.successUrl}?paymentKey=test_pk_${o.orderId}&orderId=${o.orderId}&amount=${o.amount.value}`);
      else if (outcome === "cancel")
        location.assign(`${o.failUrl}?code=PAY_PROCESS_CANCELED&message=${encodeURIComponent("사용자가 취소했습니다")}`);
      else
        location.assign(`${o.failUrl}?code=PAY_PROCESS_ABORTED&message=${encodeURIComponent("결제에 실패했습니다")}`);
    },
  }),
});
```
→ **실제 prod 클라이언트 코드가 전부 실행**(loadTossPayments 호출·requestPayment 인자 구성·success 콜백·confirm
fetch·clearCart). 헬퍼 API: `installTossMock(page, outcome)`, `completePaidOrder(page): Promise<orderId>`,
`payCancel(page)`, `payFail(page)`.

> 구현 1단계(필수 spike): 설치 후 실제 `loadTossPayments` 가 요청하는 src 를 네트워크로 재확인하고
> `route('**/js.tosspayments.com/**')` 글롭이 일치하는지 검증. (소스상 `/v2/standard` 이나 버전별 변동 대비.)

### 7b. SDK 타입 실측 (설치 버전 기준 구현 시 재검증)
- `loadTossPayments(clientKey, {src?}): Promise<TossPaymentsSDK>`
- `ANONYMOUS = "@@ANONYMOUS"` export → `payment({ customerKey: ANONYMOUS })`(게스트)
- `requestPayment({ method:"CARD", amount:{value:number, currency:string}, orderId, orderName, successUrl?, failUrl?, customerEmail?, customerName? })` — `card` 중첩 불필요(optional). PII 필드 생략.

### 7c. 실제 결제창 — Vercel prod 카나리 수동 라운드트립
헤르메틱 E2E 로는 실제 호스티드 창 오픈을 증명할 수 없으므로(=F012 sandbox 가 존재한 이유), prod 에서 수동 검증:
- **prod 도 Toss TEST 키 → 실제 돈 0** ⇒ prod-direct + 카나리가 안전(별도 preview env 셋업 불요).
- `vercel --prod` 재배포(시크릿은 이미 세팅됨; 하니스가 시크릿 주입을 차단하므로 사용자가 실행) 후:
  1. `/api/payments/create` 가 200(`orderId`+`clientKey`) 반환(503 해소) 확인.
  2. 실제 checkout → **실 Toss 테스트 결제창 오픈** → 테스트 카드 라운드트립 → `/orders/[id]` PAID 확인.
  3. evidence(스크린샷/HAR) 캡처. (브라우저 도구로 구동 또는 사용자 수행.)

## 8. 엣지 케이스 / 함정 (리뷰 반영)

- **B2 — reload 재confirm:** 실 Toss `/v1/payments/confirm` 은 처리완료 paymentKey 재confirm 을 거부(`res.ok=false`
  → `mapStatus=FAILED` → 402). markPaid 멱등성은 우리 DB 만 보호. → `confirmPayment` 가 `provider.confirm` 호출
  **전에** `order.status==="PAID"` 면 단락 반환. success 페이지 reload 안전 + webhook-우선 레이스도 동시 해결.
- **B5 — 클라 amount:** `requestPayment` 의 amount 는 **create 응답의 amount 를 그대로 forward**. confirm 의 서버
  `order.amountWon` 과 1원이라도 다르면 Toss 가 confirm 거부. `grandTotalWon(cart)`([CheckoutView.tsx:123](../../../src/app/checkout/CheckoutView.tsx#L123)) **재계산 금지**(표시 전용).
- **B6 — orderId 제약:** Toss orderId = 6–64자 `[A-Za-z0-9-_]`. 현재 id 충족(헤르메틱 `ord_XXXX` base36;
  prod `randomUUID()` 36자, 하이픈 허용). 스펙·테스트에 제약 명문화 → id 포맷 변경 시 조용히 깨짐 방지.
- **#7 — success 페이지:** **서버 컴포넌트**가 `searchParams` prop 으로 paymentKey/orderId 수신(→ `useSearchParams`/
  `<Suspense>` 불필요). confirm 엔 `{orderId, paymentKey}` 만 전달, **amount 쿼리 무시**(변조 무력화). clearCart 는 client 자식.
- **#8 — SDK 실패:** `loadTossPayments`/`requestPayment` try/catch → 에러 표시 + 장바구니 보존.
- **금액 불일치 success:** Toss 가 confirm 단에서 거부(서버 confirm = 진실의 원천) → 402 → failed 처리.

## 9. 한계 (명시) — webhook 정합성 커플링

F044 의 PAID 도달 경로는 success-콜백 confirm **하나**다. 사용자가 Toss 승인 후 리다이렉트 전에 브라우저를
닫거나 네트워크가 끊기면 **실제 결제됐는데 주문은 CREATED 로 남는다**. 이 갭의 안전망이 webhook 이며, F044 는
구조적으로 webhook seam 과 한 쌍이다. F044 범위에서는 제외하되(§2) **F045 즉시 후속**으로 등록하고, 이 한계를
PROGRESS/DECISIONS 에 기록한다. TEST 키 환경에서는 현재 무해.

## 10. 보안 / PII / 키

- **clientKey:** create 응답으로 전달(서버 권위, `createCheckout().clientKey` [toss.ts:100](../../../src/lib/payments/toss.ts#L100)). 빌드시 `NEXT_PUBLIC` 의존 불필요.
- **customerKey:** `ANONYMOUS`(buyer 인증 없음).
- **PII 최소화:** `requestPayment` 에 `customerName/customerEmail` 생략(주문이 서버에 보유; SDK 로 미전송).
- **금액 위변조:** 클라→Toss amount 는 SDK 용; 권위 검증은 서버 confirm(`order.amountWon`). 이미 그러함.
- **라이브 키 차단:** `assertTestKey`([toss.ts:45](../../../src/lib/payments/toss.ts#L45))가 prod 에서도 항상 live 거부 → F044 는 구조적 test-only. **건드리지 않음.**
- **로그/트레이스:** PII redact 유지(AGENTS #5). create/confirm/success 경로에 buyer/child PII 미로깅.

## 11. feature_list & 거버넌스

- **F044 신규 추가**(구현 착수 시, R9 append-only):
  ```json
  { "id":"F044", "category":"checkout", "track":"product", "priority":1,
    "description":"실 TossPayments 브라우저 SDK 로 결제창을 열고(prod), 성공 콜백이 주문을 PAID 로 확정",
    "steps":["/checkout 에서 결제하기","loadTossPayments→requestPayment 로 Toss 결제창 오픈","성공 콜백 → /api/payments/confirm → PAID → /orders/[id]"],
    "verification":"pnpm test:e2e -- checkout-toss-sdk.spec.ts",
    "state":"in_progress", "passes":false, "evidence":"" }
  ```
  buyer-facing 자체 E2E 보유 → `e2e_via` 불필요(R8).
- **F045 신규 등록**(not_started): "Toss webhook 실 서명 스킴 + TOSS_WEBHOOK_SECRET boot 검증".
- **F012–F018:** `state`/`passes` 불변(계속 passing), **`evidence` 만** "sandbox stand-in → 실 SDK + addInitScript 목으로
  재검증" 갱신. `verification`/`steps`/`description` **불변**(constraint #2 / R9).
- **F016 계약 보존:** 새 동작이 동결 steps("Return to /cart")와 **일치**(cancel code → /cart 리다이렉트) → 드리프트 0.

## 12. Definition of Done & 게이트

F044 `passes:true` 조건(전부 충족 후):
1. `pnpm check` green (lint + typecheck + unit + constraints R1–R9, 특히 R4).
2. E2E green: `checkout-toss-sdk.spec.ts`(신규) + 이전된 7개 스펙 무회귀.
3. confirmPayment PAID 단락 단위테스트 추가(`webhook.test.ts` 또는 신규).
4. 독립 worker≠checker 리뷰(F042 프로토콜, refute-by-default) → 0 blocker/major.
5. Vercel prod 카나리 수동 라운드트립 evidence(§7c).
6. PROGRESS/DECISIONS(ADR-0019) 기록, attempt 리셋.

## 13. 거부안

- **병행(sandbox 유지 + prod 분기):** 클라이언트 2경로 공존(유지보수), prod 경로가 신규 스펙 1개로만 커버(회귀 취약).
- **앱 레벨 로더 주입(window 훅):** prod 코드에 테스트 전용 훅 흔적(원칙 위반) 또는 APP_ENV 게이팅 시 prod 경로 미검증.
- **라우트 가로채기 우선(addInitScript 없이):** 래퍼 내부 fetch/무결성 로직 의존 — 실측상 전역 단락이 더 견고.
- **cancel→failed 페이지에 취소 카피(원안 §4):** F016 동결 steps 와 영구 드리프트 → cancel→/cart 로 계약 보존이 우월.
- **webhook 을 F044 에 포함:** WIP=1 + DEPLOY §10 #2 분리. 한계 명시 + F045 후속으로 처리.

## 14. 요구사항 (테스트 가능, 번호화)

- **R1** prod 에서 `POST /api/payments/create` 가 200 + `{orderId, clientKey, amount, orderName, successUrl, failUrl}` 반환(503 제거).
- **R2** 금액은 서버에서 재계산(`buildOrderDraft`); 클라 totals 무시. clientKey 는 서버 발급.
- **R3** 클라이언트가 `loadTossPayments(clientKey).payment({customerKey:ANONYMOUS}).requestPayment(...)` 호출, amount 는 create 응답값 forward.
- **R4** 성공 콜백(`/checkout/success`)이 `{orderId, paymentKey}`(amount 쿼리 무시)로 confirm → PAID → clearCart → `/orders/[id]`.
- **R5** `confirmPayment` 가 이미 PAID 인 주문은 `provider.confirm` 없이 PAID 반환(reload/레이스 안전).
- **R6** 실패 → `/checkout/failed` 메시지, 주문 CREATED 유지(PAID 없음), 장바구니 보존.
- **R7** 취소(`code=PAY_PROCESS_CANCELED`) → `/cart` 리다이렉트, 장바구니 보존(F016 계약).
- **R8** SDK 로드/요청 실패 → 에러 표시 + 장바구니 보존, PAID 주문 생성 안 됨.
- **R9** 헤르메틱 E2E 가 `addInitScript` 로 SDK 를 목하여 실 클라이언트 경로 전체 실행, CDN 네트워크 누수 0.
- **R10** orderId 가 Toss 제약(6–64 `[A-Za-z0-9-_]`) 충족(가드/테스트).
- **R11** prod 코드에 테스트 전용 훅 0줄. 라이브 키 차단(`assertTestKey`) 불변.
- **R12** F012–F018 무회귀; F016 동작이 동결 steps 와 일치.
