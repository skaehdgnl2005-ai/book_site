# 쇼핑몰 표준 기능 갭 로드맵 — F052~F063 설계 (2026-07-07)

메이커 요청 "로그인부터 장바구니까지 쇼핑몰 조건이 안 갖춰져 있다 — 갭을 탐구해 계획하라"의 승인된 설계.
플랜 원본: `~/.claude/plans/serene-dancing-stonebraker.md` (플랜 모드 승인 완료). 의사결정 SoR:
**ADR-0023**(회원 도입 — ADR-0021 D1 번복), **ADR-0024**(관리자 백오피스 웹 편입).

## 갭 분석 결론

| 항목 | 현황 | 결정 |
|---|---|---|
| 장바구니 | **이미 있음** (F011/F049/F051, localStorage) | 현행 유지, 무변경 |
| 회원/로그인 | 전무 (의도적 — ADR-0021) | **도입**: 이메일 OTP + 카카오, 비밀번호 없음 (F056–F058) |
| 배송지 수집 | 없음 (체크아웃 = 이름+이메일만; ship* 컬럼 dormant) | F053 |
| 주문 상태 | 앱 레이어 CREATED/PAID 이진 (DB enum은 7상태 기예약) | F054 (앱 레이어만 확장) |
| 주문 확인 이메일 | 없음 (Resend 어댑터는 OTP 전용) | F055 |
| 내 주문 목록 | 없음 (주문번호 단건 조회만) | F057 |
| 관리자 | 없음 (백스테이지가 웹 밖) | F059–F061 |
| 취소·환불 | 없음 | F062–F063 |
| 맞춤 결제 | **프로덕션 결함**: Order(kind=CUSTOM)·paymentKey 미저장 + 클라이언트 하드코딩 `test_pay_written`(프로덕션 실 Toss에서 402 → 결제 불능) | F052 최우선 |

※ 맞춤제작 **DB 영속화 자체는 이미 구현돼 있음**(`createPrismaBackend`, customRequest.ts) — 파일 상단
낡은 주석이 "in-memory 전용"이라 오기. F052에서 주석 정정.

## 웨이브 / 의존

- **Wave 1 (결함)**: F052 맞춤 결제 영속화 + 실 Toss SDK
- **Wave 2 (배송·주문 기본기)**: F053 배송지 → F054 상태 머신 → F055 확인 이메일
- **Wave 3 (회원)**: F056 User+OTP 로그인+세션 → F057 주문 연결 → F058 카카오
- **Wave 4 (관리자)**: F059 인증+목록 → F060 전이+운송장 → F061 맞춤 관리
- **Wave 5 (취소·환불)**: F062 취소 요청 → F063 환불 집행

각 웨이브 끝 = 배포 체크포인트(`prisma migrate deploy` → `pnpm approve deploy.production`(HITL) →
`vercel --prod` → 카나리). 기능별 상세 steps/verification은 `feature_list.json` F052~F063 항목이 SoR.

## 핵심 설계 결정 (요약 — 상세는 ADR)

1. **인증은 자체 스택 확장** (Auth.js/lucia 미도입): stateless HMAC 세션 쿠키 `account_session`
   (`MYPAGE_ACCESS_SECRET` 재사용, TTL 30일, sessionEpoch 무효화), LoginOtp 테이블(otp.ts 코어 재사용),
   카카오 OAuth 수동 3콜(injectable transport, 비프로덕션 sandbox). — ADR-0023
2. **게스트 경로 영구 유지**: 로그인은 opt-in. mypage `requireAccess` = capability 쿠키 OR 세션 소유.
   소급 연결은 이메일 소유 증명 시점의 멱등 updateMany.
3. **주문 상태는 DB enum 기예약분을 앱 레이어로만 확장**, `canTransition` 전이표 + 조건부 updateMany
   `repo.transition`. "DELIVERED"는 기존 enum 값 `COMPLETED`로 매핑.
4. **확인 이메일 멱등의 진실원천 = markPaid의 원자적 `transitioned` 반환** (confirm/webhook 경합에도
   정확히 1회). 어댑터 메서드명 `send()` 유지(R3-safe), prod 미프로비저닝 시 fail-closed(결제 무영향).
5. **Daum postcode 위젯 비도입**(v1): 외부 CDN이 hermetic E2E를 깬다 — 수동 3필드(우편번호/주소/상세).
6. **관리자 = 전역 세션 + ADMIN_EMAILS allowlist**, 실패 404 은닉. PII는 렌더만, 로그 금지. — ADR-0024
7. **환불 = requireApproval(toss.refund.live) 게이트** + Toss cancel(Idempotency-Key) + 전액 취소만
   (부분환불 스코프 아웃). 웹훅 CANCELED 재조회 수렴.
8. **hermetic 유지**: 모든 신규 스토어는 Prisma + in-memory 이중 백엔드. 신규 테이블(User·LoginOtp)
   마이그레이션에 RLS ENABLE(R10).

## HITL (사람 작업)

| 시점 | 작업 |
|---|---|
| Wave 2 배포 전 | Resend 정식 도메인 + `EMAIL_FROM` (미프로비저닝 시 prod 메일 fail-closed — 결제 무영향) |
| Wave 3 배포 전 | 카카오 개발자 앱 등록(REST 키·secret·redirect URI·`account_email` 동의항목 비즈 검수) → Vercel env |
| Wave 4 배포 시 | Vercel env `ADMIN_EMAILS` + 관리자 실 로그인 카나리 |
| 각 웨이브 배포 | `pnpm approve deploy.production` 직접 실행 |
| 운영 매 건 | `pnpm approve toss.refund.live` / `consultation.book` |

## 회귀 방어

- 체크아웃 폼 확장의 E2E 폭발 반경은 `tests/e2e/_helpers/tossMock.ts`의 `fillBuyer()` 한 함수로 봉쇄.
- F054의 "PAID" 리터럴 수정 지점 전수: checkout.ts:148·152, orders.ts:46·259·280·316,
  orders/[id]/page.tsx:23, mypage actions.ts:134·150, mypage/[orderId]/page.tsx:56.
  `checkout-success.spec`의 `toHaveText("PAID")`는 표시 문자열 유지로 무회귀.
- 원자성이 근거인 곳(F055 멱등 발송·F056 LoginOtp·F063 이중 집행)은 docker Postgres gated 통합 테스트를
  evidence에 포함(otp-persistence-integration 전례).
- 기능마다 full `pnpm test:e2e`(부분 실행 금지) + 구매 플로우 접점(F052/F053/F054/F055/F063)은 `pnpm eval`.
