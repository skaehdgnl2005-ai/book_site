# Progress Log

## Handoff (resume here)   ← was session-handoff.md; consolidated to cut sync/drift (M4)
- Resume with: `./init.sh` → read this file + `git log --oneline -20` → pick top `passes:false`
  in `feature_list.json` (WIP=1) → `pnpm attempt <id>` before working it.
- **(2026-07-17, Wave B): F068 배송 알림 이메일 + 택배 조회 딥링크 DONE — 창업 체크리스트 갭 로드맵 Wave B/C 착수(F068~F071 append `fa3a64a`).**
  SHIPPED 전이(admin `advanceOrder`) 성공 시 order_shipped 이메일 발송 — EmailMessage kind 유니온 확장(주문번호·PII-free
  상품명·택배사 정규 표시명·운송장·조회 링크만; 아동 이름/헌정/주소는 메시지 타입에 필드가 없어 구조적 배제, order_confirmation
  규율 계승). `after()`+`redact()`, 전이의 조건부 쓰기가 exactly-once(승자만 발송·발송 실패는 배송 전이 불변). 순수
  `tracking.ts` 레지스트리(`resolveCarrier`/`trackingUrl`/`carrierDisplayName` — CJ대한통운·우체국·한진·롯데·로젠 별칭·부분
  이름 매칭, 운송장 숫자만, 미등록→null 정직한 텍스트 폴백) + 공용 `TrackingLink` 컴포넌트로 account/mypage/admin 3화면
  운송장을 딥링크로 승격. **worker≠checker(14에이전트/4렌즈 적대적 리뷰, refute-by-default): 7 confirmed → 3 수정**[①
  `setTracking`을 전이 승자 경로(res.ok 이후)로 이동 — 동시 SHIPPED 경합 시 패자가 운송장을 덮어써 이메일↔화면이 갈라지거나
  미배송 주문에 운송장이 남던 불일치 제거, ② `Carrier.name`을 `carrierDisplayName`로 실사용(지저분한 별칭이 구매자 화면/
  이메일에 노출되지 않게 정규화), ③ `trackingUrl` https:// 절대경로 유닛 단언], 2 문서화(advanceOrder 이메일 배선 유닛은
  refundOrder/order_confirmation과 동일 accepted 선례 — 구조적 exactly-once + composeEmail·resolveCarrier().name 유닛 +
  E2E로 커버), 2 무조치(app.json·.gitignore는 '남의 미커밋 파일' — 명시적 스테이징으로 오염 방지). **마이그레이션 0**(기존
  tracking 컬럼 재사용 — Wave A 배포로 스키마 최신, F068은 스키마 무변경이라 다음 배포에 코드만 실림). 검증: check green
  (유닛 298) + 비-perf E2E **153/153** + shipping-notify 2/2 + admin-transitions(F060) 2/2 무회귀 + eval S1–S11 1.0.
  perf.spec(F036)는 전체 스위트 동시부하에서 3경로 p95 스파이크(머신 부하 아티팩트 — 격리 재실행 3/3 green: 704·722·
  733ms; F068은 홈/카테고리 무접촉). `Next:` **F069** Toss 결제위젯 전환(간편결제 노출) — CheckoutView의
  `requestTossPayment`(payment().requestPayment method:CARD)를 `toss.widgets()`로, 서버 create/confirm/webhook 재사용,
  **E2E tossMock을 widgets() API(setAmount·renderPaymentMethods·renderAgreement·requestPayment)로 재작성이 최대 리스크**.
  이어서 F070 가상계좌·F071 리뷰. **배포 상태 양호**(Supabase restore 완료·Wave A 라이브·migrate 13/13 — 아래 배포 항목).
- **(2026-07-17, 배포): Wave A 프로덕션 배포 완료 — 라이브 @ storybook-shop.vercel.app (`dpl_BXbJVxQi…`, 515zfmoh8).**
  선행: **Supabase restore 사용자 완료** → 검증(스토리지 version/bucket/upload 200, `/orders/ord_nonexistent`
  500→**404** 회복). 절차: ① 로컬 `pnpm build` green ② `prisma migrate deploy` —
  `20260717120000_order_withdrawal_consent` 적용(13/13) ③ `pnpm approve deploy.production` —
  **사용자가 터미널에서 직접 승인**(에이전트 stdin 파이프는 분류기가 차단 — 의도된 HITL; 앞으로도
  사용자가 직접 실행) ④ `vercel deploy --prod` READY ⑤ 카나리: 11경로 정상(신규 /terms·/privacy·
  /refund-policy 200 포함, /admin·ord_nonexistent 404 은닉 계약 유지), 홈 푸터 법정 블록 렌더
  확인(미설정 7항목 = 〔등록 준비 중〕), **동의 게이트 라이브 400**(부작용 없는 카나리: 미동의
  create → "청약철회 제한 안내에 동의해 주세요"). **잔여 HITL**: BIZ_* 실값(Vercel env 채운 뒤
  재배포 필요 — env만 바꿔도 redeploy해야 반영), EMAIL_FROM 도메인, 카카오 앱(기존).
- **(2026-07-17): 법령 준수 Wave A (F064~F067) DONE — 창업 체크리스트 갭 로드맵 1차. `pnpm status` 56/56 product · 11/11 harness, E2E 154/154, eval S1–S11.**
  근거: 사용자 제공 '자사몰 창업 필수 체크리스트'와의 갭 감사(35항목 중 24 미비 — 법정 고지·표시
  레이어 전면 공백). 이 세션(순차 WIP=1): **F064** 푸터 법정 표시사항(전자상거래법 10조) —
  `src/lib/businessInfo.ts`(BIZ_* env 주입, 미설정=〔등록 준비 중〕, 공정위 링크는 10자리 검증) +
  Footer 루트 layout 전역화(개별 import 26파일 제거; 클라이언트 번들 유입 금지 — env 소실) →
  **F065** /terms(표준약관 15개조) → **F066** /privacy(실수집 항목만·아동 사진 특칙·위탁 4사) →
  **F067** /refund-policy(7일·3영업일·지연배상·주문제작 제한) + **결제 전 철회제한 동의**(entry
  체크아웃·custom written 양쪽, 클라이언트+서버 이중 게이트, `withdrawalConsentAt` 영속 —
  마이그레이션 `20260717120000_order_withdrawal_consent` **미배포 1건**).
  **⚠️ 운영 장애(HITL 필수)**: Supabase 프로젝트(`auuchvwgovypiueugmhm.supabase.co`)가 DNS에서
  소멸(ENOTFOUND — 무료 티어 유휴 일시정지/삭제 추정, 7/8 배포 후 유휴). **프로덕션 DB 실시간
  경로 500 확인**(`/orders/ord_nonexistent` → 500; 계약은 404. 홈·카테고리는 ISR 캐시로 200).
  주문 조회·결제 생성·로그인·admin이 라이브에서 죽어 있을 가능성 높음 → Supabase 대시보드에서
  restore(또는 신규 프로젝트 + env 교체 + `prisma migrate deploy` 7건) 후 카나리 재확인 필요.
  이 장애로 이번 세션 E2E가 베이스라인부터 깨져 있었음(사진 업로드 spec 2건) — playwright
  webServer env에서 SUPABASE_* 차단으로 **hermetic 복원**(storage.ts 설계 의도; 라이브 검증은
  eval S11 소관). 부수: 약관·방침·정책 문안은 표준약관/법정 기준 기반 **초안 — 시행 전 사업자
  최종 검토 필요**. 실값 대기: BIZ_*(대표자·주소·전화·이메일·사업자등록번호·통신판매업 신고번호·
  개인정보책임자 — `.env.example` 참조; Vercel prod env에 채우면 즉시 준수). `Next:` ① 사용자:
  Supabase restore + 사업자등록/통신판매업 신고 + BIZ_* 실값 ② 배포 체크포인트(migrate 1건 +
  BIZ_* env + 카나리) ③ 후속 갭 로드맵(결제위젯 간편결제 F068~, 배송 알림/조회 딥링크, 리뷰
  시스템+후기 정책 — 새 feature append로).
- **Latest (2026-07-08): 쇼핑몰 갭 로드맵(F052~F063) 프로덕션 배포 완료 — 라이브 @ storybook-shop.vercel.app.**
  사용자 지시("바로 배포 진행")로 배포 체크포인트 실행. 절차: ① 로컬 `pnpm build` 프로덕션 컴파일
  게이트(에러 0) ② `prisma migrate deploy` — **신규 6건 전부 적용**(contactEmail·shipZip·
  User/LoginOtp(RLS)·Order.userId FK·tracking·cancel) ③ Vercel prod env `ADMIN_EMAILS` 추가 —
  값은 안전 분류기가 에이전트 추정 이메일을 차단해 **사용자에게 직접 확인받아
  `skaehdgnl2005@gmail.com`(메이커의 Resend 가입 계정 — 현 onboarding@resend.dev 발신으로 OTP
  수신 가능한 유일 주소)** ④ `pnpm approve deploy.production`(사용자 명시 지시가 HITL 근거) →
  `vercel deploy --prod` → READY (`storybook-shop-fgq5dfimz…`). **카나리**: 10경로 200
  (신규 /login·/account·/custom/written 포함), 404 계약 유지(/admin·/admin/orders 비로그인 404
  은닉, /orders/ord_nonexistent·/order/unknown_key), 카카오 미설정 fail-closed
  (307→/login?error=kakao), `X-Vercel-Id: icn1::icn1`(서울 실행), **신규 검증 라이브 확인**
  (부작용 없는 400 카나리: 배송지 누락 "받는 분 이름을 입력해 주세요", 맞춤 이메일 누락 "올바른
  이메일을 입력해 주세요"). **사람 후속 카나리 권장**: 브라우저에서 ① 실 Toss TEST 결제 완주
  (엔트리+맞춤) ② `skaehdgnl2005@gmail.com`로 /login OTP 수신→/admin 진입 확인. **HITL 잔여**:
  EMAIL_FROM 정식 도메인(현재는 메이커 메일로만 발송 가능 — 구매자 확인 메일은 fail-closed),
  카카오 개발자 앱 등록(KAKAO_* env — 미설정 동안 카카오 버튼은 fail-closed 리다이렉트).
- **(2026-07-08): F063 환불 집행 DONE — 쇼핑몰 갭 로드맵(F052~F063) 12건 전체 완주. `pnpm status` 52/52 product · 11/11 harness.**
  `PaymentProvider.cancelPayment` + Toss `POST /v1/payments/{key}/cancel`(Basic auth, **전액 취소만**,
  `Idempotency-Key: refund-<orderId>`로 이중 집행 방어). **3중 잠금**: requireAdmin(신원) →
  `requireApproval("toss.refund.live", 토큰)`(HITL default-deny — `pnpm approve` 발급 토큰을 admin
  UI에 입력) → 게이트웨이 멱등 키. 성공 시 REFUNDED 조건부 전이(웹훅 경합 무해) + 환불 확인 메일
  (after, kind 유니온 확장). **웹훅 CANCELED 수렴**: 권위적 재조회가 CANCELED면 REFUNDED —
  Toss 대시보드 직접 취소도 주문 상태에 수렴; 전이가 실제로 안 일어나면 응답은 정직하게 IGNORED.
  주의: F045의 "PAID 절대 다운그레이드 불가" 유닛 불변식은 F063 의미로 **의도적 갱신** — 위조
  본문 방어(권위적 PAID면 본문만으로 불변)는 보존, 권위적 CANCELED는 이제 환불 수렴이 정답.
  sandbox transport가 `/cancel`을 CANCELED 승인(hermetic E2E). 검증: check green(유닛 278) +
  **E2E 138/138** + eval S1–S11.
  **로드맵 요약(모두 이 세션, 순차 WIP=1)**: F052 맞춤 결제 영속화(프로덕션 결함 수정) → F053
  배송지 → F054 상태 머신 → F055 확인 메일 → F056 회원(OTP 로그인+세션) → F057 주문 연결 →
  F058 카카오 → F059 admin 인증·주문 → F060 전이+운송장 → F061 맞춤 관리 → F062 취소 요청 →
  F063 환불. **배포 전 체크리스트(HITL)**: ① `prisma migrate deploy` — 신규 마이그레이션 6건
  (contactEmail·shipZip·User/LoginOtp(RLS)·userId FK·tracking·cancel) ② Vercel env: `ADMIN_EMAILS`
  (+선택 `KAKAO_REST_API_KEY/KAKAO_CLIENT_SECRET`) ③ `pnpm approve deploy.production` →
  `vercel --prod` → 카나리(엔트리 결제·맞춤 결제·로그인·admin 404/로그인·환불은 실 Toss 테스트
  결제로 왕복 확인) ④ 잔여: EMAIL_FROM 정식 도메인(메일 fail-closed 해제), 카카오 앱
  등록/account_email 검수. `Next:` 배포 체크포인트 실행(사람) 또는 후속 개선(주소검색 위젯,
  QR 애드온 가격, 부분환불 등)은 새 feature append로.
- **(2026-07-07, 밤): F062 구매자 취소 요청 DONE — Wave 5 시작.**
  `requestCancel` = **단일 조건부 쓰기**: `status ∈ {PAID, IN_PRODUCTION} && cancelRequestedAt IS
  NULL`일 때만 접수(중복·배송후·미결제는 정직한 no-op, 첫 사유 보존). 게이트는 F057의
  `hasOrderAccess` 재사용 — 게스트(capability 쿠키)와 회원(세션 소유) 양쪽에서 동일 액션.
  UI: `CancelRequestPanel` 공용 컴포넌트(account 상세 + mypage) — 접수됨 안내 / 사유 폼(제작
  착수 후 거부 가능 고지) / SHIPPED 이후 고객센터 안내 3분기. 관리자: 목록 취소요청 배지 +
  상세 사유(렌더만). 컬럼 `cancelRequestedAt/cancelReason`(`20260707150000_order_cancel_request`).
  검증: check green(유닛 273) + E2E 136/136(cancel 2 신규) + eval S1–S11. `Next:` F063 환불 집행
  (PaymentProvider.cancelPayment + requireApproval(toss.refund.live) + 웹훅 CANCELED 수렴) —
  로드맵 마지막 항목.
- **(2026-07-07, 밤): F061 관리자 맞춤 의뢰·상담 관리 DONE — Wave 4(관리자) 완료.**
  `/admin/custom` 목록(경로·상태 필터)·상세(6묶음 의뢰서 `CUSTOM_FORM_GROUPS` 재사용, 연락처
  PII 렌더만, F052 링크로 결제 주문 상세 왕복). 의뢰 상태는 `canTransitionCustom` 전이표
  (SUBMITTED→IN_REVIEW→IN_PRODUCTION→COMPLETED|CANCELLED; **PENDING_PAYMENT→SUBMITTED는
  settle 전용** — 관리자가 결제를 수동으로 넘길 수 없음, markPaid 원칙과 동형) + 조건부
  updateStatus(양 백엔드). **상담 확정 = requireApproval("consultation.book") 게이트**:
  `pnpm approve consultation.book` 발급 토큰을 admin UI에 입력해야 REQUESTED→CONFIRMED
  (default-deny; guardrails.ts 무수정 — 기존 액션명). 검증: check green(유닛 272 — 전이표
  36쌍 전수) + E2E 134/134(admin-custom 3 신규) + eval S1–S11. `Next:` Wave 5 F062(구매자
  취소 요청) → F063(환불 집행).
- **(2026-07-07, 밤): F060 관리자 상태 전이 + 운송장 DONE.**
  `advanceOrder` 서버 액션: **액션 내부 requireAdmin 재검증**(레이아웃 게이트만으로 POST는 안
  막힌다 — defense-in-depth) + `canTransition` 관측-상태 가드 + `repo.transition` 조건부 쓰기
  (관리자 2명 더블클릭 1회 적용, 패자는 정직한 에러). REFUNDED는 여기서 **의도적으로 도달 불가**
  (F063의 requireApproval 게이트 전용). SHIPPED 전이는 같은 제출에서 운송장(택배사·번호) 필수
  (`trackingCarrier/trackingNumber` 컬럼, `20260707140000_order_tracking`). 상세 페이지
  TransitionPanel은 현 상태에서 허용되는 한 가지 전이만 렌더(UX; 게이트는 서버). 노출: admin
  상세 + /account 상세("배송 조회") + mypage. 검증: check green(유닛 268) + E2E 131/131
  (transitions 2 신규 — 전 과정 완주 + 운송장 누락 거부) + eval S1–S11. `Next:` F061 관리자
  맞춤제작·상담 관리(consultation.book requireApproval 게이트 포함).
- **(2026-07-07, 밤): F059 관리자 인증 + 주문 관리 DONE — Wave 4 시작.**
  ADR-0024 실행: 별도 admin 인증 없음 — 전역 세션 + `ADMIN_EMAILS` allowlist(콤마·lowercase),
  실패는 `notFound()`(존재 은닉 404). 프로덕션 미설정 = 전면 deny(fail-closed); **비프로덕션 폴백은
  `admin(+<tag>)?@example.com` 패밀리** — fullyParallel E2E가 스펙별 고유 관리자 신원을 쓰게 해
  단일사용 OTP·시간당 발송캡의 크로스-스펙 경합을 구조적으로 제거(실제로 F059 E2E가 공유 계정
  경합으로 1회 실패 후 재설계). `/admin/orders` 목록(최신순 50·상태 필터 링크)·`/admin/orders/[id]`
  상세(구매자·배송지·아이 개인화·결제키 — **렌더만, 로그 0**, E3). `OrderRepo.listRecent` 양 백엔드.
  검증: check green(유닛 267) + E2E 129/129(admin 3 신규) + eval S1–S11. **배포 시 Vercel env
  `ADMIN_EMAILS` 설정 + 실 로그인 카나리(HITL)**. `Next:` F060 관리자 상태 전이 + 운송장.
- **(2026-07-07, 밤): F058 카카오 로그인 DONE — Wave 3(회원) 완료.**
  수동 OAuth 3콜(kauth authorize→token→kapi user/me) — injectable transport로 hermetic 유닛,
  비프로덕션은 **sandbox 라운드트립**(start가 state 쿠키 발급 후 자체 콜백으로 즉시 리다이렉트,
  `sbx_id/sbx_email` 쿼리가 프로필 결정 — isProductionRuntime 게이트로 프로덕션 도달 불가;
  customTossProvider 전례). state CSRF는 constant-time 비교, 실패는 전부 `/login?error=kakao`
  균일 낙착. **계정 결정표**: kakaoId 재로그인 → 카카오 검증(valid+verified) 이메일만 기존 계정
  자동 연결(+게스트 주문 claim; 이미 다른 kakaoId 보유 시 first-wins 유지) → 미검증/미동의는
  email=null 신규 + /account 배너에서 OTP로 이메일 attach(다른 계정 소유 이메일이면 거부 —
  병합 없음). env `KAKAO_REST_API_KEY/KAKAO_CLIENT_SECRET` optional(프로덕션 미설정 fail-closed).
  검증: check green(유닛 263) + E2E 126/126(kakao 4 신규) + eval S1–S11. **HITL 잔여: 카카오
  개발자 앱 등록**(REST 키·secret·redirect URI `…/api/auth/kakao/callback`·account_email 동의항목
  비즈 검수 — 검수 전 프로덕션 기본 동작은 미동의 폴백) → Vercel env. 실 왕복은 배포 후 수동
  카나리. `Next:` Wave 4 F059(관리자 인증+주문 목록) — Vercel env `ADMIN_EMAILS` 필요.
- **(2026-07-07, 밤): F057 게스트 주문 소급 연결 + 내 주문 DONE.**
  `Order.userId` FK(+index, `20260707130000_order_user_link`). 연결 경로 2개: ① 로그인 결제는
  create 라우트에서 세션 유저를 draft에 부착(+체크아웃 이메일 프리필 — /checkout이 서버 컴포넌트로
  세션 읽음), ② 게스트 주문은 이메일 소유 증명 시점(로그인 OTP 성공)에 `claimByEmail` 소급 연결
  (대소문자 무시, **미연결 행만** — 주문이 소유자를 바꾸는 일 없음, 멱등). `/account`에 내 주문
  목록(최신순), `/account/orders/[id]` 상세(엄격 소유 게이트 404; 소유자 본인 배송지 표시 —
  비인증 /orders/[id]의 PII 미노출 원칙은 그대로). **mypage 게이트 통일**: `hasOrderAccess` =
  capability 쿠키(게스트 OTP, 룩업 없이 우선 — 존재 오라클 규율 유지) OR 세션 소유 — 페이지·state
  라우트·finishing 액션 3곳 공용, 회원은 상세에서 OTP 없이 마무리 화면 직행. 검증: check green
  (유닛 251) + E2E 122/122(account-orders 3 신규) + eval S1–S11. `Next:` F058 카카오 로그인
  (프로덕션 활성화는 카카오 앱 등록 HITL 필요 — sandbox로 E2E 완주).
- **(2026-07-07, 밤): F056 회원 기반(이메일 OTP 로그인 + 전역 세션) DONE — Wave 3 시작.**
  ADR-0023 실행: passwordless 회원(로그인=가입 통합, 비밀번호 없음). **기존 스택 일반화 — 신규
  의존성 0**: 세션은 access.ts 패턴의 전역판(stateless HMAC 쿠키 `account_session`,
  `userId.epoch.exp.hmac`, TTL 30일, 시크릿은 `MYPAGE_ACCESS_SECRET` 재사용, `User.sessionEpoch`+1
  = 모든 기기 로그아웃), 로그인 OTP는 otp.ts 원자 코어(issue/verifyDebit/consume·mint-before-consume
  ·424242 결정 코드) 전량 재사용 — subject `login:<email>`, Prisma는 별도 `LoginOtp` 테이블(OtpCode
  불변). User·LoginOtp 마이그레이션 `20260707120000_user_login_otp`(**CREATE TABLE + RLS ENABLE —
  R10**). 라우트: `/login`(2단계, MypageLookup 클론) · `/account`(프로필·로그아웃·전기기 로그아웃).
  게스트 구매 경로 무변경(로그인은 순수 opt-in). 파일: `src/app/account/_lib/{users,session,
  sessionUser,loginOtp,actions}.ts`. 검증: check green(유닛 248) + **E2E 119/119**(account-login 6
  신규 + a11y `/login` 추가) + eval S1–S11. `Next:` F057 게스트 주문 소급 연결 + 내 주문 목록
  (Order.userId FK 마이그레이션 — 배포 시 migrate deploy 대상 누적 3건).
- **(2026-07-07, 밤): F055 주문 확인 이메일 DONE — Wave 2(배송·주문 기본기) 완료.**
  PAID 전이 시 구매자에게 확인 메일 정확히 1회. **진실원천 = `markPaid`의 원자적 조건부 쓰기**
  (`{order, transitioned}` 반환; Prisma updateMany count===1 ⟺ 이 호출이 전이) — confirm/webhook이
  경합해도 승자만 `SettlementNotifier`를 호출(주입식, checkout.ts 순수 유지). notifier는 라우트/페이지
  레이어에서 `after()`+catch+`redact()`(OTP 발송 관용구; 발송 실패가 결제 응답을 절대 막지 않음).
  `EmailMessage`를 kind 유니온으로 확장(`mypage_otp`|`order_confirmation`) — 확인 메일 본문은
  주문번호/PII-free 상품명/금액/마이페이지 안내만(아이 이름·헌정·주소는 **메시지 타입에 필드가 없어**
  구조적으로 배제). CUSTOM 정산(settle)도 동일 notifier 경유. 유닛 238(신규 order-confirmation 5:
  양방향 경합·FAILED·replay·CUSTOM) + 전체 E2E 112/112 + eval S1–S11. e2e_via F013.
  **참고**: F053의 375px 체크아웃 오버플로가 경계선상(간헐 1px)이었음이 이번 풀 E2E에서 드러나 확정
  수정(`eaeab0d` — shipRow 인풋 min-width:0). **prod 실발송은 EMAIL_FROM 도메인 프로비저닝 대기**
  (미설정 시 fail-closed, 결제 무영향 — HITL 잔여). `Next:` Wave 2 배포 체크포인트(마이그레이션
  contactEmail·shipZip 2건 `prisma migrate deploy` + `pnpm approve deploy.production` 사람 실행) 또는
  바로 Wave 3 F056(회원 기반) 착수.
- **(2026-07-07, 밤): F054 주문 상태 머신 7상태 확장 DONE.**
  앱 레이어 이진(CREATED|PAID)을 DB enum 기예약 7상태로 확장(마이그레이션 0). 신규
  `api/payments/_lib/status.ts`: `canTransition` 전이표(PAID→IN_PRODUCTION→SHIPPED→COMPLETED,
  PAID|IN_PRODUCTION→REFUNDED, CREATED→CANCELLED — **CREATED→PAID는 의도적으로 표에 없음**: 결제는
  markPaid 전용, 관리자 수동 전환 불가), `isPaidFamily`, 한글 라벨, `toOrderStatus`(방어적 read 매핑).
  `OrderRepo.transition(id, from[], to)` 양 백엔드(조건부 updateMany — 더블클릭 1회 적용).
  게이트 전수 교체: confirm 멱등 가드(정산군 200 short-circuit·CANCELLED/REFUNDED 402), mapOrderRow
  binary collapse 제거, orders/[id]·mypage/[orderId] paid 게이트, finishing 액션 2곳, settle 2곳.
  `checkout-success.spec`의 order-status "PAID" 표시 계약은 그대로(결제 직후 상태는 여전히 PAID).
  검증: pnpm check green(유닛 230 — 전이표 49쌍 전수 포함) + 전체 E2E 112/112 + eval S1–S11.
  자체 E2E 없음 → `e2e_via:["F060","F062"]` 선언(R8). `Next:` F055 주문 확인 이메일.
- **(2026-07-07, 밤): F053 체크아웃 배송지 수집 DONE (Wave 2 시작).**
  실물 기념물인데 이름+이메일만 받던 체크아웃에 배송지 블록 추가 — 받는 분 이름/연락처(숫자·하이픈
  9~13자)/우편번호(5자리)/주소(+상세주소 선택, 서버에서 ", "로 병합). `buildOrderDraft`가 ENTRY 주문
  필수 검증(400 + 한국어 안내), dormant `shipName/shipPhone/shipAddress` 활성 + `shipZip` 컬럼
  (`20260707110000_order_ship_zip` — ALTER, R10 미해당). CUSTOM 주문은 미수집(의뢰서 free-text 유지,
  draft 필드 optional). **비인증 /orders/[id]에는 배송지 미노출**(E2E가 수취인·주소 부재 단언).
  Daum postcode 위젯은 의도적 비도입(외부 CDN이 hermetic E2E 파괴 — 설계 스펙 §핵심결정 5).
  E2E 회귀 반경은 `fillBuyer()` 한 함수 확장으로 봉쇄(전 체크아웃 스펙 공용). 검증: pnpm check
  green(유닛 222/10 skip, 0위반) + **전체 E2E 112/112**(배송 필드·차단·미노출 +1) + eval S1–S11.
  `Next:` F054 주문 상태 머신 확장.
- **(2026-07-07, 밤): 쇼핑몰 갭 로드맵 착수(F052~F063 append) + F052 맞춤 결제 영속화 DONE.**
  메이커 요청 "로그인~장바구니 쇼핑몰 조건 갭 탐구+계획" → 플랜 승인(설계 스펙
  `docs/superpowers/specs/2026-07-07-shop-gaps-design.md`, ADR-0023 회원 도입/ADR-0024 관리자 웹 편입,
  feature_list에 F052~F063 12건 append — R9 0위반). **F052 (Wave 1, 결함 수정)**: WRITTEN 맞춤 결제가
  ① Order 레코드·paymentKey를 안 남기고(환불·대사 불가) ② 클라이언트 하드코딩 `test_pay_written`으로
  프로덕션 실 Toss에서 402(결제 불능)이던 것을 해소 — 인테이크 시 Order(kind=CUSTOM,
  id=tossOrderId=CustomRequest.id, CREATED) 생성, 성공 리다이렉트가 `/custom/complete/[id]?paymentKey`로
  착지하면 서버가 서버 보관 금액으로 confirm 후 markPaid+linkOrder+markSubmitted(`api/custom/_lib/settle.ts`,
  전 과정 멱등: replay 재확인 0회·webhook-first 게이트웨이 스킵·markPaid/linkOrder first-wins) → PRG
  리다이렉트로 쿼리 제거. WrittenForm은 기존 `requestTossPayment`(F044) 재사용 + 의뢰인 이메일 수집
  (Order.buyerEmail 필수 — 마이그레이션 `20260707100000_custom_contact_email`, ALTER라 R10 미해당).
  confirm 라우트는 settle 위임으로 유지(HTTP 재시도 표면). orders.ts에 kind("ENTRY"|"CUSTOM")·명시적
  draft.id 추가(기존 ENTRY 경로 무변경). 검증: pnpm check green(유닛 214/10 skip, R1–R10 0위반) +
  **전체 E2E 111/111**(신규 이메일 400 케이스 +1) + eval S1–S11 pass. `Next:` F053(체크아웃 배송지)부터
  Wave 2 계속; 웨이브 끝 배포 시 `prisma migrate deploy`(contactEmail 컬럼) 필요. 이메일 도메인 검증
  (EMAIL_FROM)은 여전히 잔여(F055 prod 발송 전제).
- **(2026-07-07): 카테고리 페이지 로딩 지연 — 조사 + 성능 수정 3건, 프로덕션 배포·카나리 완료.**
  사용자가 `pnpm approve deploy.production` 직접 실행(HITL) → `vercel --prod --yes` →
  `dpl_8N1jPFuRcFLn6r3RkEh9uSNJhiMf` READY. **카나리**: /anniversary `X-Vercel-Cache: PRERENDER`
  (엣지 프리렌더 서빙, 함수 미호출) TTFB 1.2~1.6s→**0.07~0.3s**; /order/birth(동적)
  `X-Vercel-Id: icn1::icn1`(**함수 서울 실행 확인**) TTFB **0.11~0.15s**; 404 계약 유지
  (/orders/ord_nonexistent·/order/unknown_key → 404); 스모크 7경로 전부 200. 상세는 아래 항목.
  사용자 보고 "기념일/첫순간들 클릭 시 로딩 지연" → 계통 조사: 프로덕션 TTFB 측정으로 재현
  (/anniversary·/first-moments **매 요청 1.2~1.6s** vs 정적 /·/custom 0.1~0.3s; 연속 8요청에도
  1.19s 하한 = 콜드스타트 아님), `X-Vercel-Id: icn1::iad1`로 **함수가 미국 동부(기본 리전)에서
  실행**되며 서울 Supabase까지 매 요청 왕복임을 확정(대조: 같은 쿼리를 한국에서 직접 실행 시
  콜드 313ms/웜 83ms — 쿼리 자체는 저렴). 수정: ① vercel.json `"regions":["icn1"]`(서울 고정 —
  카테고리뿐 아니라 주문·결제·mypage 전 동적 경로 혜택, **다음 배포부터 유효**); ② 카테고리
  2페이지 `force-dynamic` → `revalidate = 300`(ISR — 준정적 8행 카탈로그, 라이브 DB 반영 의도는
  5분 창으로 유지); ③ 카테고리 세그먼트 loading.tsx 2개 + globals `.loading-view`(클릭 즉시
  피드백; opacity-only 펄스, reduced-motion 전역 가드). **함정 기록: 루트 loading.tsx 금지** —
  전 라우트 위 Suspense 경계로 스트리밍이 켜져 notFound() 페이지가 셸을 HTTP 200으로 먼저
  흘려보냄 → F007/F014 unknown-id E2E 2건이 404→200 회귀로 잡아냄(세그먼트 스코프로 재설계해
  해소; 근거 주석 loading.tsx·globals.css에 남김). 검증: pnpm check 0위반 + **전체 E2E 110/110**
  + `pnpm build` 라우트 테이블에서 두 페이지 `○ … Revalidate 5m` 확인. feature_list 무변경(성능
  국소 수정). 배포 대행은 안전 분류기가 HITL 자가 주입으로 차단(정상) — 사람이 직접 approve
  실행 후 배포(위 Latest 항목). `Next:` 이메일 도메인 검증(EMAIL_FROM 정식 도메인) 등 직전
  핸드오프의 잔여 항목 그대로.
- **(2026-07-06, 밤): 프로덕션 배포 — UI 전면 개선(플랜 8개 WP) 라이브.**
  사용자 지시로 `pnpm approve deploy.production`(정확 확인 토큰 발급) → **비가역 배포 전 리스크
  차단으로 `pnpm build` 로컬 프로덕션 빌드 컴파일 확인**(전 라우트 에러 0) → `vercel --prod --yes`.
  배포 `dpl_GSXPwErUhWmSyn4a1zZedgc34gVF` READY, alias **https://storybook-shop.vercel.app**.
  배포 코드 = master `4aad4b6`(check 0위반·E2E 110/110·eval 11/11 green). 워킹트리의 비커밋
  2건(`.gitignore` +.env* / `app.json` Expo 설정)은 Next 빌드 무관. **카나리**: /, /anniversary,
  /order/birth, /cart, /mypage, /faq, /custom 전부 200 + 홈 HTML에 nav-bag(F049)·주문 조회 확인;
  라이브 스크린샷(모바일 주문 위저드 — BAG+햄버거·스텝 인디케이터·『탄생』 세리프·ChoiceChip·밑줄
  폼·필 1개 / 데스크톱 카테고리 — 활성 내비 네이비 밑줄·타이포 커버) 판독 + 콘솔 에러 0.
  이 배포로 F048(직전)~F049·F050·F051 + Wave 1~3 UI 개선 전부 첫 라이브. `Next:` 이메일 도메인
  검증(EMAIL_FROM 정식 도메인 — 현 onboarding@resend.dev는 메이커 계정 메일만 수신); 원하면
  디자인 '절제 완화' 방향(4갈래 레버, 현재 보류)을 다음에 재개.
- **(2026-07-06, 저녁): UI 개선 Wave 3 — WP7 모바일 글로벌 패스 DONE → UI 플랜 8개 WP 전체 완료.**
  전역 토큰을 만지는 단독 트랙(워크트리 병렬 불필요). impl 에이전트가 Fable 5 월 한도로 커밋
  직전 사망 → **모델 Opus로 전환해 미커밋 24파일 작업을 복구·검증·커밋**(임시 스크린샷 스펙 제거
  후 게이트 통과 확인). 내용: ① globals.css `--section` 모바일 하한 72→48px(DESIGN.md
  spacing+Layout 동기 갱신 — P6 히어로 과대 여백); ② 터치 타깃 ≥44px(.nav-link·워드마크·푸터
  링크에 padding+음수마진 상쇄 — 밀도 불변); ③ **한글 eyebrow 자간 전수 교정** — order의
  `.koEyebrow` 이중클래스 핵을 globals의 재사용 `.eyebrow--ko`로 승격, 전 페이지 적용; ④ 활성
  내비 — NavClient `usePathname`로 `aria-current="page"`(서브패스 포함) + DESIGN Nav 스펙
  네이비+7px 밑줄(오버레이는 on-dark); ⑤ FinishingClient 폼 키트 통일 — 파일 인풋→FileDrop,
  textarea→UnderlineTextarea, 아이템별 저장 `.cta` 필→TextAction(화면당 필 1개, testid 전부
  포워딩 보존); ⑥ `accent-color:var(--accent)` 전역(네이티브 컨트롤 시스템 파랑 제거). 적대적
  리뷰 design blocking 1건(orders 확인 페이지 `.meta` 한글 자간 0.04em — WP7이 놓친 퍼널 페이지)
  수정(`c111f70`), contract approve. 머지 충돌 0 → **통합 게이트: check 0위반 + 전체 E2E 110/110
  + eval S1–S11 pass + perf p95<2s**. 남은 nit(비차단): `.nav-link` 자간 0이 라틴 'BAG'의
  트래킹도 제거(사소), FinishingClient 화면에 primary 필 0개(아이템별 작업면이라 의도적).
  **`Next:` UI 플랜(docs/superpowers/specs/2026-07-05-ui-overhaul-plan-design.md) 8개 WP 전부
  완료 — 배포는 별도 승인 시(pnpm approve deploy.production). 배포 시 F049/F050/F051 + 전 UI
  개선이 함께 라이브.**
- **(2026-07-06, 오후): UI 개선 Wave 2 — 병렬 3트랙 구현·머지 DONE (WP2 폼 키트 · F050 위저드 리컴포지션 · F051 카트 삭제+폴리시 · WP8 콘텐츠).**
  Wave 1과 같은 멀티에이전트 패턴(워크트리 병렬 → E2E 직렬 → 적대적 리뷰 → 수정 라운드; 중간에
  세션 한도/크레딧 소진 2회로 resume + 슬림 마무리 워크플로우로 이어 완주). 내용: ① WP2 —
  `_components/form/` 키트 4종(UnderlineField·ChoiceChip·ToggleRow·FileDrop, input은 opacity:0
  오버레이로 Playwright/키보드 계약 보존) → 위저드·ContactForm·MypageLookup 적용(네이티브 컨트롤
  해소); ② **F050(passing)** — 스텝 인디케이터(aria-current)+컴팩트 퍼널 헤더(『탄생』 세리프
  강조)+데스크톱 7/5 sticky 요약 레일(타이포 커버+진행 요약)+모바일 sticky 하단 금액·CTA 바;
  ③ **F051(passing)** — 카트 라인 삭제(removeLine 재사용)+타이포 커버 썸네일+헤어라인 요약+모바일
  sticky 총액 바, 검증 중 실버그 2건 발견·수정(BAG 배지 stale → cart-changed 이벤트+NavClient
  구독, onRemove setState-in-render); ④ WP8 — brand-story/custom/reviews 4/8 비대칭 분할,
  FAQ +/– 아코디언 어포던스, 80% 스탯 탈박스, custom 경로 카드 → 어포던스. 리뷰 blocking 7건
  전부 수정(한글 자간 재발 chipSub, funnelTitle weight 700, 확인 스텝 데스크톱 빈 칼럼, dropHint
  대비 AA 미달, **모바일 fixed 바의 푸터 가림 → sticky 전환+390px 푸터 도달성 E2E 신설**, F051
  stale evidence 재게이트). 머지: funnel→content→cart, 충돌 2파일(feature_list F050/F051 append,
  order.module.css cart 구간 이전) 수동 해소 → **통합 게이트: 전체 E2E 110/110 + eval S1–S11
  pass + perf p95 유지**. `Next:` Wave 3 = WP7 모바일 글로벌 패스(전역 토큰이라 단독 트랙) +
  잔여 nit(FinishingClient 폼 키트 통일, 활성 내비 aria-current, 카테고리 eyebrow 한글 자간,
  콘텐츠 split 공용 컴포넌트화 후보). 이후 UI 플랜 8개 WP 전체 완료 — 배포는 별도 승인.
- **(2026-07-06): UI 개선 Wave 1 — 병렬 3트랙 구현·머지 DONE (WP1 CTA체계 · WP5 타이포 커버 · F049 내비 BAG+드로어).**
  UI 플랜(아래 항목)의 Wave 1을 트랙별 git worktree 병렬로 실행(멀티에이전트: 구현 3 ∥ →
  E2E 직렬(포트 3000) → 적대적 리뷰 6(design/contract) → 수정 3). 내용: ① WP1 —
  Button.tsx에 CtaPrimary/TextAction/BackAction 3종, 위저드 박스형 뒤로·건너뛰기를 텍스트
  액션으로 전폐(화면당 필 1개 원칙), ② WP5 — TypographicCover(세리프 책 제목 매트)로
  카테고리 8칸·갤러리 6칸의 빈 회색 매트 해소 + 모바일 1열 4:3, ③ **F049(신규 append,
  passing)** — 내비 BAG 진입점(카트 진입 UI 부재 해소) + 모바일 다크 드로어(햄버거,
  포커스 트랩·Escape·스크롤 락) + tests/e2e/nav.spec.ts 5케이스. 리뷰가 잡은 blocking 6건
  수정: 한글 양수 자간 2건(.cta 0.18em→0, 드로어 링크 0.04em→0 — DESIGN.md 철칙),
  F049 부분 게이트 승격→풀 게이트 재실행 후 evidence 재작성, 갤러리 세리프 오남용
  (variant="label"), InfoStep 전폭 CTA, 히어로 스크림 보강. 머지: 한 브랜치씩 + 매번
  `pnpm check`(전부 green, 충돌 0) → **통합 게이트: 전체 E2E 102/102 + eval S1–S11 pass
  + perf p95 유지(home 785ms)**. `Next:` Wave 2 병렬(퍼널 WP2 폼 키트→WP3 위저드
  리컴포지션(F050) ∥ WP6 카트 폴리시+라인 삭제(F051) ∥ WP8 콘텐츠 페이지) → Wave 3(WP7
  모바일 글로벌 패스). 남은 nit: BAG 카운트 storage 리스너, 활성 내비 aria-current,
  ContactForm 밑줄화(WP2에 편입), 모바일 4:3 결정의 DESIGN.md 반영.
- **(2026-07-05, 밤): 전 페이지 UI 디자이너 리뷰 → 개선 플랜 수립 (플랜만, 코드 무변경).**
  메이커 요청("일반 버튼 투성이, 모바일 계획 포함 전면 검토")으로 20개 라우트를 코드 +
  실물 스크린샷(1440/390, browse)으로 검토. 핵심 진단: CTA 체계 부재(P1)·네이티브 폼
  컨트롤(P2)·위저드에 상품 실종+진행표시 없음(P3)·**내비에 /cart 진입점 부재(P4)**·빈
  회색 매트(P5)·모바일 내비 랩+히어로 과대 여백(P6)·카트 라인 삭제 불가(P7). 플랜:
  `docs/superpowers/specs/2026-07-05-ui-overhaul-plan-design.md` — WP1(버튼/CTA 3종) →
  WP2(폼 키트) → WP3(위저드 리컴포지션†) → WP4(BAG+모바일 드로어†) → WP5(타이포 커버) →
  WP6(카트 폴리시+라인 삭제†) → WP7(모바일 패스) → WP8(콘텐츠 정리). †표시는 행동 추가라
  신규 feature row append 필요; 나머지는 F002 비주얼 폴리시 선례로 row 없이. `Next:`
  메이커가 플랜 승인/조정 → WP1부터 세션당 1개(WIP=1) 실행.
- **Latest (2026-07-05, 저녁 2): mypage 입구 결함 수정 + 프로덕션 배포 (F048 동승).** 메이커가
  라이브 카나리 중 발견: `/mypage`로 들어가는 UI가 사이트에 전무(내비 ✗, 푸터 ✗, 주문 완료 화면은
  "마이페이지에서 이어갈 수 있어요" **문구만** 있고 링크 ✗) — 구매자가 마무리(사진·헌정)에 도달 불가.
  수정(`c00bfad`, 2파일): Nav에 "주문 조회" 링크 + PAID 주문 확인 화면에 `마이페이지에서 마무리하기`
  CTA(`data-testid="order-finish-link"`). 검증: `pnpm check` green + 타깃 E2E 32/32
  (home·order-confirm·mypage-finish·a11y·checkout-success). **배포**: `pnpm approve deploy.production`
  → 클린 워크트리 @ `c00bfad`에서 `vercel --prod` — **직전에 정식 종료된 F048 커밋(`8663107`)도 이
  배포로 첫 라이브**. 카나리: /, /mypage, /anniversary, /faq 전부 200 + 홈 HTML에 "주문 조회" 링크
  확인. `Next:` 메이커의 F047 메일 카나리(테스트 주문 → 주문 조회 → OTP 수신)가 이제 UI로 가능.
- **Latest (2026-07-05, 저녁): F048 — 제품 설명 레이어 DONE + passing (신규 append, attempt 1/3 → reset).**
  신규 시장(초개인화 그림책) 첫 방문자를 위한 설명 계층 — 메이커 결정 3건 반영: **AI 언급 최소화**
  (히어로 아이브로우 "AI 초개인화 그림책" → "초개인화 그림책"; 고객 표면에서 AI 단어 0회, 카피는
  정직하되 기술을 명세하지 않음), **풀 패키지 범위**, **타이포 중심 비주얼**. 내용: ① 홈에 조용한
  편집 섹션 2개 — `ProcessSection`("이렇게 만들어집니다" 3단계, 히어로 직후) +
  `KitSection`("한 권에 담기는 것": 그림책·자석 외함·축하 카드 No.01–03 헤어라인 리스트 + QR
  정직 카피, 카테고리 섹션 뒤) — `src/app/_components/home/` 네임스페이스, 토큰만 사용(악센트는
  No. 숫자에만 — DESIGN.md 인가 용법); ② Footer에 콘텐츠 페이지 텍스트 링크 5개(브랜드
  스토리·갤러리·후기·FAQ·문의 — **기존 고아 페이지 전부 도달 가능해짐**, 모든 페이지 공통);
  ③ 주문 위저드 맥락 카피(템플릿 블럽 승계 + "자석 외함·축하 카드 기본 포함 — 주문 후 일주일
  이내 제작" + 사진 용도 힌트 + 커버 한 줄 설명); ④ FAQ 신규 2문항(어떻게 만들어지나요/책과 함께
  무엇이 오나요 — 기존 스펙의 `/주문 후 일주일 이내/` 유니크 매치 보존); ⑤ `layout.tsx` 한국어
  메타데이터(lang=ko, title/description/OG ko_KR — 카톡 링크 미리보기가 첫 설명 표면).
  정직성 가드: 리드타임·커버 선택 카피는 **기념일·첫 순간들 라인 한정**으로 명시(맞춤 제작의
  리드타임은 상담/양식 기준이라 홈에서 일반화하지 않음); KitSection 미디어는 실물 사진이 없으므로
  갤러리와 같은 기준의 정직한 `--panel` 매트("실물 사진 준비 중") — `kit-lifestyle.png`(4:5)
  생성 브리프를 포토 브리프 문서 2026-07-05 부록으로 추가, 도착 시 CategoryCard 패턴으로 교체.
  검증: `pnpm check` green(199 unit, R1–R10 0 — F048 append는 R9 append-only 허용 경로) +
  **E2E 전체 97/97**(home.spec F048 테스트 신설, faq/order-start 확장) + `pnpm eval` S1–S11
  전부 pass(퍼널 무회귀) + perf 예산 유지(home p95 813ms < 2s). `Next:` 메이커가
  `kit-lifestyle.png` 생성(브리프 부록) → KitSection 매트를 next/image로 교체하는 소품 폴리시;
  배포는 다음 승인 시 F048이 함께 실림.
- **Latest (2026-07-05): Home photo hero + category-card media (F002 visual polish — no new
  feature row, no feature_list edits).** Hero now follows DESIGN.md ## Components #2: full-bleed
  art-directed `<picture>` via `getImageProps` (16:9 `hero-desktop.png` ≥720px / 9:16
  `hero-mobile.png` below — phones never download the wide cut), rendered **outside `<main>`**
  so it full-bleeds without viewport-width hacks; `inkStrong` ground + `brightness(.92)` +
  top/bottom legibility gradients; on-dark text tokens; new `Nav overlay` variant (home only,
  transparent over the photo). Category cards mirror the TemplateCard media pattern (4:5 mat,
  `--panel` ground, hairline, hover scale 1.03 · 1.2s). Assets: `public/images/*.png` (5, art
  direction per `docs/superpowers/specs/2026-07-04-hero-category-photo-brief-design.md`).
  Verified: `pnpm check` green (199 unit, R1–R10 0) + E2E `home.spec` 2/2 + `perf.spec` 3/3
  (home p95 **646ms** < 2s budget — next/image optimization confirmed working) + visual
  screenshots desktop 1440 / mobile 390. Optional polish: recompress the 6–8MB PNG sources to
  smaller masters (runtime serving already optimized by next/image).
  - **DEPLOYED to production 2026-07-05** (user-instructed; `pnpm approve deploy.production` token
    issued): `vercel --prod` → `dpl_3D23xRW7uSuHTJ7dbVe6yEHtduGt`, aliased
    **https://storybook-shop.vercel.app** — this deploy also carries the previously-pending
    **F046+F047** master state. Canary: home/anniversary/first-moments/custom/mypage all **200**;
    live desktop screenshot shows photo hero + card media (no dev badge). **Still open:**
    `RESEND_API_KEY` + `EMAIL_FROM` are NOT in Vercel prod env (checked `vercel env ls`), so prod
    mypage OTP mail stays **fail-closed by design** (env.ts F047 — boots fine, adapter refuses).
    ~~`Next:` maker provisions both (Resend-verified domain) → redeploy → mail canary.~~
    **DONE 2026-07-05 (later same day):** maker provisioned `RESEND_API_KEY` + `EMAIL_FROM`
    (**temporary `onboarding@resend.dev` path — no domain yet**, so Resend only delivers to the
    maker's own Resend-account email; real customer mail still needs a verified domain later).
    Env-only redeploy shipped from a **clean worktree @ `e45bf90`** (`dpl_CGWkmntXrM9C7Xuv3vADijeHjbjv`,
    approved via `pnpm approve deploy.production`) — deliberately NOT the working tree, which held
    mid-flight **F048** (in_progress) edits; F048 ships when its own session closes green. Route
    canary 200 (/, /mypage, /anniversary). Mail canary handed to the maker (test order with the
    Resend-account email → mypage lookup → OTP). Swap `EMAIL_FROM` + redeploy once a domain is
    verified in Resend.
- **Latest (2026-06-11): F047 — real Resend transactional-email adapter DONE + passing (F046's paired
  follow-up, ADR-0022).** `resendEmailAdapter` (behind F046's `EmailAdapter`) sends the mypage OTP via
  Resend's HTTPS API (`POST https://api.resend.com/emails`, Bearer `RESEND_API_KEY`, `from=EMAIL_FROM`) with
  an **injectable transport** so `pnpm check` stays hermetic; a non-2xx **throws** (no silent no-op); the
  code/recipient never reach a log (status-only error). Factory picks Resend in prod **only when BOTH
  `RESEND_API_KEY` & `EMAIL_FROM` are set** — else F046 fail-closed (a half-config never half-sends);
  non-prod stays mock. `actions.ts` is **untouched** (F046's `after()` send is reused). `pnpm check` green
  (**199 unit**, R1–R9 0) + mypage-photo E2E **8/8** (interface via the mock). Independent worker≠checker
  (6-lens) caught **1 major PII regression** — the new `re_` redact rule ran before the email rule and
  stranded a `re_`-prefixed email's domain; **fixed** (`re_` mask now runs last + `(?<![A-Za-z0-9])` anchor
  + regression test). HONESTY: the real network send is **not** hermetically testable (F044/F045 precedent)
  → unit-tested with an injected transport; **live send = go-live manual canary**. **Deploy:** F047 was cut
  from **clean master (`8050b26`, post-F046-merge)**, so merging is a **clean append — NO conflict** (unlike
  F046's 3-way). The maker provisions `RESEND_API_KEY` + `EMAIL_FROM` (Resend-verified domain) in Vercel
  prod env, then a single `vercel --prod` carries **F046+F047 together**; canary: real mypage lookup → mail
  received → OTP → `/mypage/[orderId]`. **ADR-0022.**
  - **MERGED to master 2026-06-15 (`4bd068b`, `--no-ff`); `pnpm check` green post-merge (199 unit, R1–R9 0).
    Deploy still PENDING** — provision `RESEND_API_KEY`+`EMAIL_FROM` (Resend-verified domain) in Vercel prod,
    then a single `vercel --prod` carries **F046+F047 together** (canary as above). Leftover worktrees
    `c:\dev\gpcs-F046` & `c:\dev\gpcs-F047` (both now merged) are safe to `git worktree remove`.
- **Latest (2026-06-11): F045 — real Toss webhook verification scheme DONE + passing.** Replaced the
  self-HMAC seam (`signWebhook`) with the real Toss scheme (official docs: `PAYMENT_STATUS_CHANGED`
  webhooks are **unsigned** — only payout/seller events carry `tosspayments-webhook-signature`):
  `verifyWebhookToken` (shared URL token `?token=`=`TOSS_WEBHOOK_SECRET`, constant-time, first-line
  filter) + **re-query** `GET /v1/payments/{paymentKey}` (Basic auth) as the authoritative source —
  only authoritative `PAID` + matching amount + authoritative `orderId` marks PAID, so a forged body
  can't settle and the "approved-but-abandoned-before-redirect" gap is covered. Payload mapped to
  `{eventType,data:{paymentKey,orderId,status}}`; idempotency key `paymentKey:status` (no event id);
  `markPaid` idempotent → confirm + webhook converge. `TOSS_WEBHOOK_SECRET` now **boot-required in
  prod** (`env.ts`). Prior 10 webhook unit cases migrated to the real scheme (every invariant
  preserved) + security cases; +6 `lookupPayment` adapter tests; transient 5xx→503→Toss-retry. `pnpm
  check` green (**163 unit**, R1–R9 0) + **95 hermetic E2E** (incl. `checkout-success.spec.ts`, no
  regress). Independent worker≠checker (6-lens, 10 agents): 3 confirmed / 0 blocker / 0 code defect (2
  doc-drift fixed, 1 test gap closed). **ALL 45/45 features passing (product 34/34 · harness 11/11);
  `pnpm status` product 100%.** Decision: **ADR-0020**. **Deploy:** `vercel --prod`, then register the
  Toss dashboard webhook URL `https://storybook-shop.vercel.app/api/payments/webhook?token=<TOSS_WEBHOOK_SECRET>`
  and send a test event to verify PAID convergence (secret already set in Vercel prod).
- **Latest (2026-06-11): F046 — real buyer auth (email-OTP) implementation DONE; gates green; passes:true set this session after the worker≠checker review.** The mypage HMAC-cookie front door (order#+email string match) is replaced by an **email-OTP possession proof** + a durable **atomic** per-order `OtpCode` store (`DATABASE_URL ? Prisma : in-memory`; attempt-cap / send-throttle / single-use as atomic conditional writes — the markPaid idiom + one `INSERT…ON CONFLICT`). The HMAC capability cookie is **kept**, minted only after a correct OTP. `MYPAGE_ACCESS_SECRET` is now boot-validated on a hardened `isProductionRuntime` (VERCEL_ENV cross-check, so a mistyped APP_ENV on Vercel can't fail open). Email behind a provider-agnostic adapter (mock + fail-closed prod stub; the real **Resend** adapter is a paired follow-up ⇒ prod mypage **fail-closed-until-provisioned**). **ADR-0021** (ADR-0020 is F045's, merged). **Atomicity is a required gate** (hermetic `pnpm check` can't prove it): gated `otp-persistence-integration` is **4/4 against docker Postgres** (N=25 parallel verifies⇒exactly 5 debits, N=25 parallel issues⇒exactly 5 sends, parallel consume⇒single-use). Plus `pnpm check` green (165 unit, R1–R9 0) + **13/13 mypage E2E** (capability-cookie R1/R7/R9 invariants preserved verbatim; wrong-email strengthened to uniform-advance + no-access). F046-only files; `env.ts` is a known 3-way merge with F045's `TOSS_WEBHOOK_SECRET` block (keep both; `pnpm verify` post-merge gate). **Not deployed** — maker runs the single `vercel --prod` after F045+F046 land and provisions the email provider.
- **⚠️ F046 → master MERGE NOTE (do NOT lose F045's passing state) — flagged by the worker≠checker review.** This branch was cut from `cc9793f` (pre-F045), so its `feature_list.json` and `src/lib/env.ts` still carry the *baseline* F045 state; F045 was promoted to passing on master (`d841845`). A 3-way merge therefore **conflicts** in both files. Resolve by keeping master's side for F045 and adding F046: **(1) `feature_list.json`** — keep master's F045 entry verbatim (state:passing/passes:true/ADR-0020 evidence/E2E-gated verification) and append ONLY the F046 entry; **never `-X ours`/take-HEAD wholesale** (that silently reverts F045 to not_started → breaks R4). **(2) `src/lib/env.ts`** — keep **all three** prod-boot throws in order: F045's `TOSS_WEBHOOK_SECRET`, then F046's `VERCEL_ENV` backstop + `MYPAGE_ACCESS_SECRET`. Then `pnpm check` must be green. (Rebasing `feat/F046` onto master first makes `feature_list.json` a clean append; the `env.ts` conflict remains and is resolved the same way.)
- **Latest (2026-06-08): F044 — real Toss browser SDK payment DONE + passing.** The hermetic `/checkout/pay` sandbox
  stand-in is removed; `/api/payments/create` now returns `clientKey` (publishable test key) and the browser calls
  `loadTossPayments → payment(ANONYMOUS) → requestPayment` via the real Toss SDK. All 7 checkout/mypage E2E specs
  migrated from `PaySandbox` redirect pattern to `page.addInitScript` (injects `window.TossPayments` before the page
  script) — 95 hermetic E2E, no regressions. `pnpm check` green (147 unit + R1–R9 0). Independent worker≠checker:
  plan-review 19 findings + implementation 6-lens 12 findings, 0 blocker. **Prod is now ready to redeploy via
  `vercel --prod`** (env vars already set in Vercel); the remaining real-window verification is a manual canary
  round-trip post-deploy (the hermetic suite cannot open the actual Toss-hosted window). **F045** (Toss webhook real
  signature scheme + `TOSS_WEBHOOK_SECRET` boot guard) is registered as the next named seam. Decision: **ADR-0019**.
  **44/45 features passing (product 33/34 incl. F044, F045 not_started · harness 11/11); `pnpm status` product 97%.**
- **Latest (2026-06-03): F043 — production deploy plan & runbook DONE + passing.** `docs/DEPLOY.md` (13 sections,
  Vercel + Supabase): topology, a prominent PRE-LAUNCH REALITY CHECK (prod payment 503s, real Toss browser SDK not
  built, mypage HMAC ≠ real buyer auth), full env/secrets table, Supabase pooled(:6543)/direct(:5432) DB setup,
  `prisma migrate deploy` runbook, Vercel build config (`prisma generate && next build` gotcha), private `assets`
  Storage bucket, `deploy.production` approval-gate + live-key-boot-refusal go-live cutover, a **seam-closure
  checklist of future F-items**, post-deploy canary, forward-only-migration rollback, and a doc-drift flag
  (`ARCHITECTURE.md` stale). Built via a 12-agent workflow (6 file:line fact-sheets → draft → 5-dim refute-by-default
  review; env/migration/seam-accuracy = CLEAN; vercel-specifics 1 Major [Vercel's 4.5MB Function body cap vs
  `bodySizeLimit:25mb` → large-photo upload is a pre-launch blocker] + minors → ALL applied). Decision: **ADR-0017**.
  **ALL 43 features now passing (product 32/32 · harness 11/11);** `pnpm check` green, `pnpm status` READY.
- Next action (single): **ADR-0016 seam closure DONE** — durable DB persistence (Supabase Prisma adapters behind the
  orders/finishing/custom surfaces, gated on `DATABASE_URL`, no silent write-fallback), photo bytes → Supabase Storage
  (`src/lib/storage.ts`, env-gated), QR **option B** (flag + backstage notice, no web upload). Gates: `pnpm check` 145
  unit + 92 hermetic E2E + gated live-Supabase integration **4/4 (restart-survival)** + `pnpm eval` 0.909.
  **⤷ Maker step DONE:** the PRIVATE `assets` bucket + `SUPABASE_SERVICE_ROLE_KEY` are in place → photo-byte storage is
  LIVE and **eval S11 verified** (upload→read-back→cleanup), so **`pnpm eval` is now 1.0**. All seams closed. Prior work:
  **TRACK-POLISH (F036, F037, F039, F040, F042) DONE + passing** — the cross-cutting
  polish track closes the entry line. **F036** perf budget (`perf.spec.ts`: p95<2s on home + both categories, measured
  WARM steady-state via Navigation Timing, ~580–680ms / ≈3× headroom, each route's p95 emitted as a `kind:"metric"`
  trace). **F037** a11y (`a11y.spec.ts`: a hermetic in-browser DOM audit over 14 pages + a teeth self-test; found+fixed
  2 REAL defects — `PhotoStep`'s unlabelled file input + the order wizard's un-announced validation errors →
  `aria-labelledby`/`role="alert"`/`aria-invalid`/`aria-describedby`). **F039** ops metrics (`src/lib/metrics.ts`:
  error/failure rate + latency p50/p95 from the `traced()` stream, PII-safe via the redacted sink; `metrics.test.ts` +6).
  **F040** entry-line eval (`golden` re-pointed Stripe→Toss; `task_success_rate 0.9` with the durable-persistence seam
  honestly PENDING; **holdout untouched** per F041). **F042** worker≠checker protocol doc (`docs/WORKER_CHECKER.md`)
  applied LIVE this session: 4 adversarial sub-agents reviewed F036/F037/F039/F040 → **ALL ACCEPT, 0 code findings**.
  Decisions + scope-ratification (F037 touched TRACK-ORDER's `InfoStep`/`PhotoStep`, additive ARIA only): **ADR-0015**.
  **ALL 42 features were passing as of ADR-0016 (product 32/32 · harness 10/10); F043 added 2026-06-03 → 43/43 (see top).** **Next pick:** no open feature work — remaining items
  are named backstage/production seams (durable Postgres/Asset persistence, real Toss browser SDK, real buyer auth — all
  out of web scope) + the Stripe→Toss prose/CI residue cleanup follow-up below. mypage/custom routes still not Nav-wired
  (F002-owned, import-only).
- **TRACK-CHECKOUT decisions (ADR-0013 — read before mypage):** order persistence is a hermetic `globalThis`
  store + `ProcessedWebhook` ledger under `src/app/api/payments/_lib/` (Prisma adapter is the documented prod
  seam; hermetic items key by `templateKey`, prod resolves `templateKey`→`Template.id`). Amount is recomputed
  server-side from authoritative `Template` prices; `clearCart()` runs client-side ONLY after PAID. `/orders/[id]`
  renders NO PII (sequential ids, unauthenticated). The real Toss browser-SDK + boot-required `TOSS_WEBHOOK_SECRET`
  are flagged production seams (create route 503s in production).
- Broken / not done: **Mypage (F017/F018) DONE + passing** (this work). 맞춤 제작 (F020–F023) **merged + passing**
  (custom routes not yet wired into the global Nav — F002-owned/import-only; follow-up like content). F009 +
  mypage store still hold only the access-controlled photo/QR **descriptor** — durable object-storage of the
  bytes + the real `Asset`/`Personalization` DB rows remain a named backstage seam (ADR-0011/0014). Content pages static + not Nav-wired; real assets/founder-story/
  후기/전화·이메일/배송/환불 await maker input (code-flagged TODOs). A11y aria-live/aria-invalid + cart-line list
  semantics deferred to F037.
- **Follow-ups (TRACK-CAT, latent — no DB exists yet; tracked not silent, from the adversarial review):**
  (1) the live-DB branch of `getTemplatesByCategory` is exercised only by the injected-fake unit test, never by a
  gate (no Postgres in CI); (2) the `rows.length>0` guard falls back to the seed mirror on an empty-but-valid DB
  result — revisit once admin template-deactivation (`active:false`) ships; (3) `heroImageUrl` is rendered as
  `<img src>` with no allow-list — add same-origin/allow-list validation when real hero assets land (null today →
  honest panel mat); (4) the seed mirror duplicates `prisma/seed.ts` (E2E + unit drift-guard covers
  key/label/price/blurb) — extract a shared data-only module if drift becomes a concern.
- **Follow-up (F004):** `prisma db seed` runs the `.ts` seed via Node type-stripping, which needs
  **Node ≥ 22.6** (newer than the `>=20` engines floor; dev runtime is Node 24). Not on the `pnpm check`
  path, so no gate impact. Revisit when a track may touch deps/pins: add `tsx` or bump `.nvmrc`/`engines`.
- **Follow-up (Stripe→Toss residue) — DONE 2026-06-03 (ADR-0018):** cleaned up `.github/workflows/ci.yml`
  (now `TOSS_*` test placeholders), removed the dead `stripe` npm dep (+ lockfile), and re-pointed the prose
  docs `docs/SAFETY.md` (action-key table now == `guardrails.ts`, incl. the previously-missing
  `consultation.book`) / `docs/CONSTRAINTS.md` / `docs/ARCHITECTURE.md` (also fixed its stale Book/stock model
  + cents→KRW won) + `README.md`. Deliberately KEPT: the defence-in-depth legacy-Stripe regex in
  `check-constraints.mjs`/`env.ts` (+ its `smoke.test.ts` branch), the historical ADRs in `DECISIONS.md`, and
  `eval/holdout` (reserved — must never be tuned, F041/G4; `eval/golden` was already re-pointed under F040).
  Also deleted an empty stray folder whose name was a mangled Windows path (subagent-verified
  empty/untracked/unreferenced), and committed the previously-untracked `docs/DEPLOY.md` (F043).

## Current verified state   ← single source of truth
- Last green `pnpm check`: **2026-06-02** (lint + typecheck + **145 unit** + 0 constraint violations, incl.
  R4/R5/R8 invariants) — incl. ADR-0016 (DB persistence + storage + QR-B). The live-Supabase integration test
  (`persistence-integration.test.ts`) is **gated `skipIf(!DATABASE_URL)`** → skipped in hermetic check.
- E2E (`pnpm test:e2e`): **92 passed** (hermetic / in-memory; run with `.env.local` moved aside so Next doesn't load the DB env).
- Live-Supabase integration (`set -a; . .env.local; set +a; pnpm exec vitest run persistence-integration`): **6/6** —
  orders / finishing / custom round-trip AND **survive a restart** (fresh PrismaClient reads committed rows), PLUS
  **photo-byte storage** (Supabase Storage upload → read-back → cleanup); self-cleans, no pollution.
- Eval (`pnpm eval`): `task_success_rate` **1.0** — all 11 steps pass, incl. S10 durable **Postgres** persistence AND
  S11 durable object-storage of upload **bytes** (Supabase Storage, live-verified by the upload→read-back→cleanup round-trip).
- Boots via `./init.sh`: **yes** (install → check → ready, exit 0)
- **Two honest, separate numbers** (`pnpm status`):
  - **Harness readiness** (machinery, product-agnostic): 85.2/100 → READY (see `SCORECARD.md`)
  - **Product delivery** (그림책 제작소 store): **34 / 34 product features passing (100%)** — F001/F002 home, F003 payment, F004 DB+seed, F029 asset, F024–F028 content, F005/F006 catalog, F007–F011 + F019 order funnel, F020–F023 맞춤 제작, F012–F016 checkout, F017/F018 mypage finishing, F035 responsive (375px), F036 perf (p95<2s), F037 a11y, **F044 real Toss browser SDK**, **F045 real Toss webhook scheme**.
  - harness-track features passing: **11 / 11** (+F034 checkout verification, F039 ops metrics, F040 entry-line eval, F042 worker≠checker protocol, **F043 deploy plan**).
- Bootstrap contract (build_guide §7): **MET** — boots, verified tests exist, AGENTS.md router, feature_list aligned.

## Status
Harness **INITIALIZED + review-hardened + repurposed to 그림책 제작소**. Spec layer (brief/schema/
feature_list/router) now reflects the real product; DESIGN.md (Atelier Sans) wired + enforced. Coding loop next.

## Session log (newest first)
### 2026-06-11 — F047: real Resend transactional-email adapter (mypage OTP send)  [feat/F047]
- **What:** the paired follow-up to F046 (ADR-0021 D6b) — supplies the real provider behind F046's
  `EmailAdapter` so prod mypage OTP actually sends, closing the "fail-closed-until-provisioned" seam.
  `resendEmailAdapter` (`src/lib/email.ts`): `POST https://api.resend.com/emails`, `Authorization: Bearer
  RESEND_API_KEY`, `from=EMAIL_FROM`, `to`+OTP-code body. **Injectable transport** (`ResendConfig.transport`,
  default `fetch` — the `TossTransport` pattern) ⇒ hermetic unit tests, no network on `pnpm check`. Non-2xx
  **throws** (a security mail never silently no-ops); the error is **status-only** (no code/recipient — PII
  by-construction). Factory `emailAdapter()`: non-prod → mock (F046 unchanged); prod + **BOTH**
  `RESEND_API_KEY` & `EMAIL_FROM` → Resend; prod + either missing → F046 fail-closed stub (a half-config
  never half-sends). `env.ts`: both vars added to the zod schema as `optional()` — **NOT** a prod-boot
  requirement (only the send fail-closes); `redact()` masks `re_…` keys. **`actions.ts` untouched** (F046's
  `after()`/await send reused).
- **Process (ADR-0022): spec-lite → TDD → worker≠checker.** Design fixed by F046's interface (heavy
  brainstorm skipped, per instruction). TDD RED witnessed twice: (1) `resendEmailAdapter` undefined + the
  `re_` redact gap; (2) the review's PII-regression reproduced. Independent **6-lens worker≠checker**
  (refute-by-default): correctness / security-PII / F046-invariants **clean**; redact lens found **1 major
  PII regression** — the `re_` mask ran **before** the email rule and injected `*` that broke the email
  regex's local-part class, stranding a `re_`-prefixed email's *domain* (`re_user@x.com → re_***@x.com`).
  **Fixed:** `re_` mask now runs **last** + a `(?<![A-Za-z0-9])` left anchor (also masks a key after `_`,
  leaves `more_`/`pre_` intact), guarded by a regression test. + 1 minor (folded) + 1 nit (declined) + doc
  gaps (ADR-0022 authored; DEPLOY §4 lists updated).
- **Gates:** `pnpm check` green (lint+typecheck+**199 unit**+R1–R9 0) + **mypage-photo E2E 8/8** (interface
  via the mock; `APP_ENV≠production`). The real Resend HTTP send is **not** hermetically E2E-able (F044/F045
  precedent) → unit-only via injected transport; **live send = go-live manual canary**. F047 → `passing` +
  dated evidence; `pnpm attempt F047 --reset`. F047-only files (email.ts, env.ts, email.test.ts,
  feature_list append-only, docs); **no** actions.ts / payments / F045 / guardrails / check-constraints.
- **Deploy:** cut from **clean master (`8050b26`, post-F046-merge)** ⇒ merging is a **clean append, NO
  conflict** (unlike F046's 3-way). Maker provisions `RESEND_API_KEY` + `EMAIL_FROM` (Resend-verified
  domain) in Vercel prod env, then a single `vercel --prod` carries **F046+F047 together**; canary: real
  mypage lookup → mail received → OTP → `/mypage/[orderId]`.

### 2026-06-11 — F045: real Toss webhook verification (token + re-query)  [feat/F045-toss-webhook]
- Closed the webhook safety-net seam. Confirmed via official Toss docs that `PAYMENT_STATUS_CHANGED`
  webhooks are **unsigned** (the `tosspayments-webhook-signature` HMAC header is payout/seller-only),
  so the body is an untrusted notification. Replaced the self-HMAC (`signWebhook`/`verifyWebhookSignature`,
  removed) with: **(1)** `verifyWebhookToken` — shared URL token `?token=`=`TOSS_WEBHOOK_SECRET`,
  constant-time, first-line filter; **(2)** **re-query** `TossPaymentProvider.lookupPayment`
  (`GET /v1/payments/{paymentKey}`, Basic auth) as the authoritative source. Only authoritative
  `PAID` + matching `totalAmount` + authoritative `orderId` calls `markPaid`. Payload parsed as
  `{eventType,data:{paymentKey,orderId,status}}`; idempotency key `paymentKey:status` (no event id),
  recorded only after authoritative confirmation; `markPaid` idempotent (CREATED→PAID, no downgrade)
  → confirm + webhook converge. `lookupPayment` added to the provider-agnostic `PaymentProvider`
  interface (+`PaymentLookupResult`); sandbox transport handles the GET branch (hermetic).
- **Boot guard:** `env.ts` refuses prod boot without `TOSS_WEBHOOK_SECRET`. **Retry semantics:**
  transient re-query 5xx throws → route 503 → Toss retries (non-2xx, up to 7×/~3d19h); 404→null→200
  ack. Raw-body-first preserved (route reads `req.text()`, parse only inside `processWebhook`).
- **Spec (R9/R8):** F045 pre-existed in the baseline (commit 65a8c34) as a stub with a unit-only
  `verification`. Corrected it to also gate `checkout-success.spec.ts` in a **dedicated spec-correction
  commit** (so R9's HEAD baseline carries the strengthening change). Migrated the prior 10 webhook
  unit cases to the real scheme — every invariant preserved (constraint #2) — + added security cases
  (forged DONE body, amount-tamper, lookup-failed, authoritative-orderId, convergence) + 6
  `lookupPayment` adapter cases (incl. transient-5xx-throws, driven test-first).
- **Process:** docs-research → TDD (RED→GREEN watched for `verifyWebhookToken`, `processWebhook`,
  `lookupPayment`, the env guard) → worker≠checker (F042): a 6-lens refute-by-default workflow (10
  agents) → 4 findings, **3 confirmed, 0 blocker, 0 code defect** (2 doc-drift majors: SAFETY §4 +
  DEPLOY diagram/checklist → fixed; 1 minor: missing-`totalAmount` lookup test → added). Security,
  idempotency, retry, and harness-compliance lenses found nothing. Decision: **ADR-0020**.
- **Gates:** `pnpm check` green (lint + typecheck + **163 unit** + R1–R9 0 constraints); **95 hermetic
  E2E** (incl. `checkout-success.spec.ts`; no regressions); `pnpm attempt F045 --reset`. **ALL 45/45
  features passing: product 34/34 (100%) · harness 11/11.**
- Next: merge `feat/F045-toss-webhook` → master, `vercel --prod`, register the Toss dashboard webhook
  URL (`?token=`) and run the test-event canary (PAID convergence). The entry-line payment path —
  browser SDK (F044) + webhook safety-net (F045) — is now complete end-to-end.
### 2026-06-11 — F046: real buyer auth (email-OTP possession proof)  [feat/F046]
- Replaced the mypage HMAC-cookie front door with an **email-OTP possession proof**. Stage 1
  `requestAccessCode` (order#+email → on match issue+send a 6-digit OTP, **always** advance to verify =
  no existence oracle; send via `after()`; equal hash both paths); stage 2 `verifyAccessCode` (atomic
  `verifyDebit` → constant-time compare → **mint-before-consume** + null-guard → capability cookie →
  redirect; malformed input rejected before any debit). 2-stage `MypageLookup` (`useActionState`,
  mounted-gated submit per `PhoneForm`/`WrittenForm`). The HMAC capability cookie (`access.ts`) is unchanged.
- **Durable, atomic store** (`src/app/mypage/_lib/otp.ts`, new): `OtpCode` model (`DATABASE_URL ? Prisma :
  in-memory`). Every mutation is an **atomic conditional write** so it survives Vercel multi-instance:
  issue = one `INSERT…ON CONFLICT…WHERE` (insert / in-window-increment / window-reset / throttled=0-rows);
  verify = `updateMany` increment guarded `attempts<MAX`; consume = conditional `updateMany`. Plaintext code
  never stored (order-bound HMAC reusing `MYPAGE_ACCESS_SECRET` — no new secret). Provider-agnostic
  `EmailAdapter` (`src/lib/email.ts`, new): mock outbox (non-prod) + fail-closed prod stub (D4 boot/config
  gate, not per-send approval). `env.ts`: `MYPAGE_ACCESS_SECRET` required-in-prod + hardened
  `isProductionRuntime` (VERCEL_ENV cross-check).
- **Process (ADR-0021):** brainstorm → spec → plan → **PRE-build 6-dim design review (20/21 folded, 3
  concurrency blockers)** → TDD (RED witnessed for env/email/otp + the E2E) → **independent worker≠checker
  6-dim implementation review** (refute-by-default; the gated concurrency test executed independently).
- **Gates:** `pnpm check` green (lint+typecheck+**165 unit**+R1–R9 0) + **13/13 mypage E2E** + the gated
  `otp-persistence-integration` **4/4 on docker Postgres** (the REQUIRED atomicity proof — `pnpm check`
  skips the Prisma path). F046 → `passing` + dated evidence; `pnpm attempt F046 --reset`. F046-only files,
  no payments/F045/guardrails/check-constraints touched. **Not merged/deployed** (maker step).

### 2026-06-08 — F044: real TossPayments browser SDK payment  [feat/F044-toss-sdk]
- Replaced the hermetic `/checkout/pay` sandbox stand-in (ADR-0013 D1) with the real Toss browser SDK:
  `loadTossPayments → payment(ANONYMOUS) → requestPayment`. The production 503 gate on
  `/api/payments/create` is removed; the `Checkout` response gains `clientKey` (publishable test key,
  server-issued — not `NEXT_PUBLIC_`). A single client path now covers dev and prod with no `APP_ENV`
  branch in the app code.
- **Key decisions (ADR-0019):** server-issued `clientKey` + server-recomputed amount forwarded to
  `requestPayment`; `confirmPayment` already-PAID short-circuit (reload/webhook-first safety;
  `webhook.test.ts` verified); cancel → `failUrl code=PAY_PROCESS_CANCELED → /cart` (F016 contract
  frozen); mechanical E2E hermeticity via `playwright.config.ts` `webServer.env DATABASE_URL:""`
  (forces in-memory, no Supabase pollution); R10 `orderId` guard (`[A-Za-z0-9-_]{6,64}`, throws
  before write). Named seams: real hosted window opening = Vercel prod canary (post-deploy manual
  round-trip); webhook real-sig scheme = F045.
- **E2E migration:** all 7 checkout/mypage specs migrated from `PaySandbox` redirect to
  `page.addInitScript` (injects `window.TossPayments` test-side before the page script). 95 hermetic
  E2E passed, no regressions.
- **Process:** brainstorm → spec → plan → adversarial plan-review (19 findings, 0 blocker) →
  subagent-driven TDD → worker≠checker 6-lens impl review (12 findings, 0 blocker; majors =
  hermeticity, R10, evidence — all reflected). An earlier app-level prod-compromise was caught in
  review and reverted; test-side fixes used instead. Decision: **ADR-0019**.
- **Gates:** `pnpm check` green (lint + typecheck + **147 unit** + R1–R9 0 constraints); **95 hermetic
  E2E** (no regressions); `pnpm attempt F044 --reset`. **44/45 features passing: product 33/34 (97%) · harness 11/11 (F045 not_started).**
  Prod ready for `vercel --prod` redeploy; real-window canary is the remaining verification step. F045
  registered as the next named seam.

### 2026-06-02 — ADR-0016 seam closure: durable DB persistence + Supabase Storage + QR option B  [master]
- Post-"feature-complete" work, maker-directed (DB=Supabase, E2E hermetic, photo bytes durable, QR=option B), then
  finished autonomously (maker unavailable) plan→implement→adversarial-review→commit. **Full record: DECISIONS ADR-0016.**
- **DB persistence.** Prisma adapters behind the existing `OrderRepo`/`WebhookLedger` (`api/payments/_lib/orders.ts`),
  `FinishingStore` (`mypage/_lib/finishing.ts`), `customRequestStore` (`lib/customRequest.ts`) surfaces, gated on
  `DATABASE_URL`. **Writes never silently fall back** to in-memory (would lose data on restart); in-memory only when no
  DB (hermetic). Sync→async refactor of those surfaces + every consumer (`checkout.ts`, the payment/custom routes, the
  order/mypage pages, `state/route.ts`) awaited; `webhook.test.ts`/`custom-request.test.ts` updated. Supabase: pooled
  `DATABASE_URL` :6543 + `DIRECT_URL` :5432 (migrations). Migrations applied: `OrderItem.position` + `@@unique`,
  `CustomStatus.PENDING_PAYMENT`.
- **Photo bytes → Supabase Storage** (`src/lib/storage.ts`, TDD): `putObject` server-only `service_role` PUT, env-gated
  (unconfigured ⇒ no-op descriptor-only ⇒ hermetic E2E unaffected). Wired into pre-pay (`photo-action.ts`) + mypage
  (`actions.ts`). `next.config` `serverActions.bodySizeLimit:25mb`. **S11 byte round-trip LIVE-VERIFIED** against the
  private `assets` bucket (upload→read-back→cleanup) once the maker supplied the `service_role` key.
- **QR option B**: order keeps the `qrVideoAddon` flag; mypage shows a backstage notice, **no web upload**
  (`uploadQrVideo` + `FinishingStore` QR methods removed). F018 + `mypage-finish.spec.ts` re-spec'd.
- **worker≠checker** (4 refute-by-default sub-agents): **3 Major + 4 Minor/latent fixed** (slot boundary-validation;
  `setPhoto` upsert vs one-to-one collision; `redact()` now covers `service_role` JWT/`sb_secret_`; storageKey
  path-guard; finishing relative-import; `@@unique` invariant; stale comment). 1 pre-existing key-nondeterminism noted.
- **Gates:** `pnpm check` green (lint+typecheck+**145 unit**+constraints R1–R8 0); **92 hermetic E2E**; gated live-Supabase
  integration test (`persistence-integration.test.ts`) **6/6** (orders/finishing/custom restart-survival + photo-byte
  Storage round-trip); `pnpm eval` **1.0** (S10 Postgres + S11 object-storage bytes both verified). **All persistence
  seams closed** — the maker supplied the `service_role` key + `assets` bucket, so byte storage is live.

### 2026-06-02 — TRACK-POLISH (F036, F037, F039, F040, F042) cross-cutting polish + eval  [feat/polish]
- Closed the entry line with the cross-cutting polish track (F035 375px was already done). Each feature TDD
  (test-first, watched RED→GREEN), then ONE independent worker≠checker review before any `passes:true`.
- **F036 perf** (`tests/e2e/perf.spec.ts`): asserts **p95 < 2000ms** on `/` + `/anniversary` + `/first-moments`,
  measured as the browser's Navigation-Timing `duration` over **20 WARM loads** (2 unmeasured warmups absorb
  `next dev`'s on-demand per-route compile; nearest-rank p95 drops only the single worst sample). Observed
  ~580–680ms (≈3× headroom). Each route's p95 is emitted as a `kind:"metric"` line via the real
  `observability.emit()`, tying perf into the F039 stream / OBSERVABILITY.md H3. Honest scope: the budget targets
  steady-state serve latency (production proxy); a genuinely >2s page recurs on warm loads and fails (real teeth).
- **F037 a11y** (`tests/e2e/a11y.spec.ts`): a **hand-rolled in-browser DOM audit** (no axe dep → hermetic) over
  **14 pages** — heading order (first h1, no descending skips), every control accessibly named, every `<img>` has
  alt — plus a **teeth self-test** (broken fixture → all 3 violation classes flagged) and a **wizard deep-step
  audit** (the page sweep only sees initial render). Found + fixed **2 real defects**: `PhotoStep`'s file input had
  no accessible name (label was a bare `<p>`) → `aria-labelledby`; the order wizard was the only form whose
  validation errors weren't announced → `role="alert"` + `aria-invalid` + `aria-describedby` (`InfoStep`/`PhotoStep`).
  Additive ARIA only → order specs still 13/13 (no regression).
- **F039 ops metrics** (`src/lib/metrics.ts` + `tests/unit/metrics.test.ts` +6): `collectMetrics` /
  `collectMetricsBySession` / `createCollector` derive error rate, tool-call failure rate, and latency p50/p95/max
  from the `traced()` trace stream (per OBSERVABILITY.md H2). `createCollector` plugs into `traced()`'s sink and
  consumes **already-redacted** `emit()` lines, so PII can't reach metrics (proven by a test). Null-safe on empty.
- **F040 entry-line eval** (`eval/golden/purchase-flow.json`): re-pointed the Stripe-era golden to the real **Toss
  entry-line journey** (S1–S9 → real passing features + their actual E2E specs, `impl:true`; S10 durable-persistence
  seam `impl:false`). `pnpm eval` → `task_success_rate 0.9`, the seam reported **pending, not success**.
  **`eval/holdout/` untouched** (F041 boundary, G4).
- **F042 worker≠checker doc** (`docs/WORKER_CHECKER.md`): roles, 3-tier independence, refute-by-default stance,
  Accept/Revise/Block, 6 dimensions, recording-before-`passes:true` (tied to R4). `docs/EVAL.md` links it + the
  stale `F032`→`F042` reference fixed. **Applied instance = this session's review.**
- **Process (worker≠checker, ADR-0005/F042):** 4 parallel adversarial sub-agents (refute-by-default; barred from
  `pnpm test:e2e` to avoid port-3000 races since the suite was already green) reviewed F036/F037/F039/F040 →
  **ALL ACCEPT, zero blocker/major/minor code findings.** The only item was this ADR (process ratification of
  F037's additive-ARIA touch into TRACK-ORDER's `InfoStep`/`PhotoStep`). Decisions: **ADR-0015**.
- Gates: `pnpm check` green (lint+typecheck+**131 unit**+0 constraints R1–R8 incl. R4/R8) + **92 E2E** (71 prior +
  3 perf + 18 a11y, no regressions) + `pnpm eval` 0.9 (honest pending). F036/F037/F039/F040/F042 → `passing` +
  dated evidence (R4 holds). **Product delivery 30→32/32 (100%); harness-track 7→10/10 (100%). ALL 42 features passing.**
- Next: merge `feat/polish` → master (--no-ff), re-verify; the harness + entry-line product are complete. Remaining
  open items are named backstage/production seams (durable persistence, real Toss SDK, real buyer auth) + the
  Stripe→Toss prose/CI residue cleanup follow-up.

### 2026-06-02 — TRACK-MYPAGE (F017, F018) post-pay finishing (photo · dedication · QR)  [feat/mypage]
- Built 마이페이지 post-pay finishing, completing the entry-line buyer flow end-to-end. **F017**: `/mypage` order#
  + email lookup (verified vs `order.buyerEmail`, uniform error → no existence oracle) → an HMAC-signed, expiring,
  httpOnly per-order capability cookie → `/mypage/[orderId]` showing status + a child-photo upload **when skipped
  at checkout** (the REAL F029 `receiveUpload`→`storeAsset` path; opaque `storageKey`, no filename/childName in
  DOM/URL). **F018**: dedication (헌정 문구) saved + **prefilled** via the cookie-gated `no-store` `/state` route
  (buyer manages their own PII, guarded), and a QR video upload revealed **only** when `Order.qrVideoAddon` (full
  canonical honesty copy + 주문-전체 label). New track-owned: `src/app/mypage/{page,[orderId]/page,[orderId]/state/route}`,
  `mypage/_lib/{access,finishing,actions}.ts`, `_components/mypage/{MypageLookup,FinishingClient,mypage.module.css}`,
  `tests/e2e/mypage-{photo,finish}.spec.ts` (13).
- **Key design decisions (ADR-0014):** the checkout-owned `OrderRepo` is **read-only** (out of touch-scope); finishing
  data lives in a **mypage-owned hermetic store** (per-item photo/dedication, per-order QR — schema-faithful;
  Prisma seam). Access = order# + email + HMAC cookie (env-keyed, fail-closed in prod) standing in for real buyer
  auth. The `[orderId]` page **gates BEFORE any order lookup** so a guessable id is not an existence oracle; writes
  re-verify the cookie + require PAID. PII never enters the SSR document or logs; only the `no-store` `/state` route
  carries the dedication.
- **Process (brainstorm → adversarial design review → TDD → worker≠checker, ADR-0005/F042):** user-approved design
  (prefill over write-only; per-item/per-order split; HMAC cookie) → a **PRE-build 51-agent / 6-dim design review**
  (16/45 skeptic-verified findings folded into the spec — 2 MAJOR caught at design time: the enumeration-oracle gate
  ordering + Next-15 `await params`/`cookies()`) → TDD (2 E2E specs RED→GREEN; crypto expiry/tamper branches tested
  in-spec via `node:crypto`, staying in E2E scope) → a **POST-build 35-agent implementation review** (21/29 confirmed,
  **ALL minor/nit — zero blocker/major**; fixed: bfcache reload doc-align + PII-flash clear, order-scope QR label,
  file-input aria-labels, and real coverage for the CREATED/not-paid branch, shared-QR, QR persistence, lookup-page
  noindex, meaningful 375px). Spec + R1–R16: `docs/superpowers/specs/2026-06-02-track-mypage-design.md`.
- Gates: `pnpm check` green (lint+typecheck+**125 unit**+0 constraints R1–R8 incl. R4/R8) + **71 E2E** (58 prior +
  **13 mypage**; no regressions). F017/F018 → `passing` + dated evidence (R4 holds); attempt reset. Realizes F029's
  `e2e_via:[F009,F017,F018]` for real. Product delivery 28→**30/32** (94%). Scope deviations (read-only imports of
  `orderRepo`/`format`/`Nav`/`Footer`; co-located `mypage/_lib`; no sibling-file edits; no `tests/unit`) ratified in ADR-0014.
- Next: merge `feat/mypage` → master (--no-ff), re-verify; then **TRACK-POLISH** (F036 perf · F037 a11y · F039/F040/F042).

### 2026-06-02 — TRACK-CHECKOUT (F012–F016, F034) entry-line checkout → idempotent PAID  [feat/checkout]
- Built the entry-line checkout end-to-end: `/cart` 결제하기 → `/checkout` buyer step (new `Order.buyerName/
  buyerEmail`, NOT in the cart) → `POST /api/payments/create` (amount **recomputed server-side** from
  authoritative `Template` prices; client totals untrusted) → a hermetic **sandbox Toss stand-in** (`/checkout/
  pay`, the three outcome branches) → **F013** sync `confirm` + async **webhook** (RAW-body HMAC-SHA256 before
  any parse; idempotent via the `ProcessedWebhook` ledger) both converge **PAID** → **F014** `/orders/[id]`
  (PII-free; status-gated copy). **F015** failure → no PAID order; **F016** cancel → cart preserved (`clearCart()`
  client-side ONLY after PAID). New track-owned: `src/app/api/payments/{create,confirm,webhook}/route.ts` +
  `_lib/{orders,checkout}.ts` (hermetic store + domain core; Prisma prod seam), `src/app/checkout/**`,
  `src/app/orders/[id]/**`, `tests/unit/webhook.test.ts` (27), 5 `tests/e2e/checkout-*`+`order-confirm` specs (12).
- **Process: brainstorm-shaped design → PRE-build adversarial review → TDD → POST-build worker≠checker (ADR-0005/
  F042).** A **33-agent / 6-lens design review** (19 skeptic-verified findings folded into the spec BEFORE code —
  caught the raw-body-HMAC + client-side-clearCart bugs at design time). TDD: 27 unit RED→GREEN, then 5 E2E specs
  RED→GREEN. A **12-agent implementation review** → 4 skeptic-verified findings, all fixed + re-verified:
  production-checkout **503 gate** (was a silent 404 seam), `getTemplateByKey` **active-row rejection**
  (inactive→null, also closes TRACK-CAT follow-up #2 for the order path), tightened email regex.
- **Approval-gate decision (ADR-0013 D5, mirrors ADR-0012 D3):** NO `requireApproval("order.confirm")` on the
  buyer's TEST confirm — sandbox/reversible; real-money irreversibility stays gated at env (live keys refused at
  boot) + adapter. F034's gate is the recorded worker≠checker review, not a code gate.
- Gates: `pnpm check` green (lint+typecheck+**125 unit**+0 constraints R1–R8) + **58 E2E** (46 prior + 12, no
  regressions). F012–F016 + F034 → `passing` + dated evidence (R4 holds); **F035 completed** (checkout 375px — the
  coverage TRACK-ORDER deferred here). Product delivery 22→**28/32** (88%); harness-track 6→**7/10**.
- **Scope deviations (ratified, conflict-free — merged files, no concurrent writer; precedent ADR-0010/0011):**
  domain logic co-located under `api/payments/_lib/` (track grants no new `src/lib/*`); import `getTemplateByKey`
  (price SoR) + `formatWon`/`COVER_LABEL` + `untrusted()`; enable the `/cart` CTA (TRACK-ORDER's documented handoff
  point); the `getTemplateByKey` active-filter (1 line in merged `templates.ts`). Honest deferrals (named): real
  Toss browser SDK + Prisma persistence + Toss's exact webhook scheme (prod seams); boot-required
  `TOSS_WEBHOOK_SECRET` (env.ts out of file scope). Spec: `docs/superpowers/specs/2026-06-02-track-checkout-design.md`.
- Next: merge `feat/checkout` → master (--no-ff), re-verify; then TRACK-MYPAGE (F017/F018).

### 2026-06-02 — TRACK-ORDER (F007–F011, F019) entry-line order funnel  [feat/order]
- Built the full pre-pay funnel: `/order/[templateKey]` server route (hermetic `getTemplateByKey`, `notFound()` on
  unknown key) → client `OrderWizard` (`useReducer`) with 4 steps — **정보**(F008 validated form) → **사진**(F009
  optional, skip never blocks) → **커버&옵션**(F010 cover price + F019 QR toggle) → **확인**(F011) → `/cart`. New
  track-owned files: `src/lib/cart.ts` (pure model + localStorage adapter, zero upward imports), `src/app/_components/
  order/*` (OrderWizard, InfoStep/PhotoStep/CoverStep/ReviewStep, `personalization.ts` validator, `photo-action.ts`
  server action, `format.ts` client-safe formatWon+COVER_LABEL, CartView, order.module.css), `src/app/cart/page.tsx`.
- **Process: brainstorm → adversarial design review → plan → subagent-driven TDD.** Design hardened by a **32-agent
  adversarial review** (0 blockers; 6 majors folded in). Implemented via **subagent-driven-development**: a fresh
  implementer per task + two-stage (spec-compliance then code-quality) independent review per task, then an independent
  **whole-implementation worker≠checker pass → ACCEPT** (F042/ADR-0005). ADR-0011 records the decisions + deviations.
- **Key correctness wins from review (in the code, not just the spec):** `extraVar` threaded through the live-DB seam
  (`TemplateDelegate`+`mapRow`), not just the seed mirror, + a compile-time catalog↔seed enum-parity guard;
  `getTemplateByKey` reuses the hermetic DB-or-mirror fallback; photo upload is exception-safe + PII-safe (filename
  never in DOM/URL); `loadCart` filters untrusted/malformed persisted lines. **Bundling fix:** client components
  can't value-import `templates.ts` (its dynamic `@/lib/db` breaks the browser bundle) → client-safe `format.ts` twin
  (pinned to the catalog copy by a unit test).
- Gates: `pnpm check` green (lint+typecheck+**82 unit**+constraints R1–R8 0) + **35 E2E passed** (17 prior, no
  regressions; +18 order/cart). F007–F011/F019 → `passing` + dated evidence (R4 holds). **F035 advanced, not flipped**
  (order+cart 375px green; checkout 375px still pending → stays `in_progress`). Product delivery 12→**18/32** (~56%).
- Honesty-first deferrals (named, not silent): F009 stores only the access-controlled descriptor (durable bytes/Asset
  row → mypage F017/checkout); QR +0원 via `QR_ADDON_WON` constant (brief states no price); a11y aria-live/aria-invalid
  + cart-line list semantics → F037. Scope deviations (templates.ts edit, /cart route, new unit tests) ratified in ADR-0011.
- Next: **TRACK-CHECKOUT (F012–F016)** — imports `src/lib/cart` + `src/lib/payments`; read the cart.ts handoff notes
  above (buyer identity, server-side amount recompute, templateKey→id, clearCart-after-PAID).

### 2026-06-02 — TRACK-CUSTOM (F020–F023) 맞춤 제작 intake — merged into master  [feat/custom]
- Built the full 맞춤 제작 intake on an isolated `feat/custom` worktree (the main checkout held a concurrent
  track's WIP; per the runbook, each track gets its own worktree): **F020** `/custom` landing (two path cards →
  /custom/phone & /custom/written, 119,000원); **F021** WRITTEN (6-group 의뢰서 → Toss **test** pay → SUBMITTED);
  **F022** PHONE (server-computed booking calendar → Consultation **REQUESTED**, pay-after-call); **F023** the
  shared 6-group `CUSTOM_FORM_GROUPS` both paths normalize into → identical `CustomRequest.form` shape. Decisions
  in **ADR-0012** (D1 hermetic globalThis store, Prisma is the documented production seam; D2 PaymentProvider +
  injectable sandbox transport, impossible when APP_ENV=production; D3 REQUESTED ≠ the irreversible operator-side
  예약 확정 → no approval gate). Imports only `@/lib/payments` (+ `untrusted()`); input tagged at the boundary.
- TDD per feature; hydration-safe forms (uncontrolled + FormData + mounted-gated submit, the ContactForm pattern).
  **Worker≠checker review** (5-dim adversarial workflow, each finding skeptic-verified): **1 real bug fixed** — the
  confirmation page claimed "테스트 결제 완료" for any WRITTEN record without checking `rec.status`, so an unpaid
  PENDING_PAYMENT request showed a phantom payment-success (spec §5); now status-gated + a regression E2E. **2
  dismissed** (a confirm-route hardening nit; a double-counted heading). Env trap diagnosed: Playwright's webServer
  spawns a 2nd `next dev` in the worktree when :3000 is free, clobbering `.next` — fix is one dev server on :3000
  that Playwright reuses; `next build` compiles all routes cleanly.
- Merged `feat/custom` → master (--no-ff). Reconciled DECISIONS (ADR-0011 = TRACK-ORDER → renumbered mine to
  **ADR-0012**) + PROGRESS; `feature_list.json` auto-merged (disjoint entries). Docs:
  `docs/superpowers/specs|plans/2026-06-01-custom-track*`.

### 2026-06-01 — TRACK-CAT (F005 기념일 / F006 첫 순간들) catalog category pages  [feat/category]
- Built the two entry-line category pages as a DB-backed template card grid. New track-owned kit under
  `src/app/_components/catalog/`: `templates.ts` (data loader + canonical catalogue + `formatWon`),
  `TemplateCard.tsx`/`.module.css` (Atelier Sans Product Card — **명조 책 제목 only**, 1px hairlines, navy-only
  edition no.+dot, radius 0, `:focus-visible` ring), `CategoryView.tsx`/`.module.css` (shared scaffold + product
  grid). Pages `src/app/{anniversary,first-moments}/page.tsx`. Cards link to `/order/<key>` (contract; 404 until TRACK-ORDER).
- **Hermetic data access (the core decision):** CI/E2E run **no Postgres, no `prisma generate`, no DATABASE_URL**
  (confirmed in `ci.yml`/`playwright.config.ts`); `pnpm check` builds nothing, pages compile only under `next dev`
  on hit routes. So `getTemplatesByCategory` reads the live DB via `@/lib/db` **only when DATABASE_URL is set**
  (dynamic import → keeps `@prisma/client` out of the hermetic graph), else falls back to a canonical seed-mirror
  of `prisma/seed.ts` ENTRY_TEMPLATES. `readTemplatesFromDb` is an injection seam (db.ts/seed.ts pattern) so the
  DB map/order is unit-testable. `export const dynamic='force-dynamic'` so the live-DB read isn't baked at build.
- TDD: wrote `category-*.spec.ts` first (RED → 404), implemented, GREEN. Full gate: `pnpm check` green
  (lint+typecheck+**54 unit**+constraints R1–R8 0) + **17 E2E** (no regressions; nav 기념일/첫 순간들 links now
  resolve). Visual QA via headless browser: desktop 3-col + 375px 1-col, **0 console errors** (screenshots reviewed).
- **Adversarial worker≠checker review (F042 protocol):** 6-dimension workflow, **24 agents**, each finding
  independently verified (refute-by-default). 18 raw → **9 fixed**: Korean body line-height 1.75 (bodyKo token),
  price 0.92rem (price token), card `:focus-visible` navy ring (outline, not box-shadow → R6-safe),
  `<ul role=list>` (WebKit list semantics), `encodeURIComponent(key)` in the order href (path-traversal harden),
  per-card role-bound price assertion (was page-global `.first()`), and a DB-branch injection-seam unit test
  (the live-DB map/order was untested). **9 deferred/dismissed** with recorded rationale (latent — no DB today):
  empty-DB-result fallback semantics, heroImageUrl allow-list, aria-label title-first, active-on-mirror, blurb
  drift, media bounding-box; 2 dismissed (per-template price impossible by brief; F006 attempt-ledger nit).
- **Scope notes (justified, conflict-free — F003 precedent):** added co-located CSS modules + a loader/view in the
  track's own `_components/catalog/` namespace (contract literally named only TemplateCard.tsx), and
  `tests/unit/catalog.test.ts` (unowned by any sibling track) to cover the live-DB branch the review flagged.
  Imported the merged, import-only `@/lib/db`. Did NOT touch the shared `_components` root, `globals.css`, `db.ts`, `seed.ts`.
- F005/F006 `passing` + dated evidence (R4 holds); F035 evidence updated (category 375px green; order/checkout
  pending). Attempt reset. Merged `feat/category` → `master` (--no-ff); `pnpm check` + 17 E2E re-verified green on master.
- Next: TRACK-ORDER (F007–F011, F019) — stateful funnel, one session; TRACK-CUSTOM (F020–F023) parallel-OK.

### 2026-06-01 — F029 access-controlled Asset storage (child-photo / PII safety)  [feat/F029]
- Opaque random storageKey (no filename/child-name/byte leak), `untrusted()` trust-gate, kind↔contentType
  allowlist, PII-free traces asserted through the real observability `emit()` sink. vitest pii.test.ts 15/15.
- Adversarial multi-lens review fixed a prototype-chain allowlist bypass (untrusted contentType resolved
  inherited members like `toString`/`__proto__`) + regression test; opaque keys over content-addressing so
  identical photo bytes don't correlate. Touched only `src/lib/assets.ts` + `tests/unit/pii.test.ts`.
  `e2e_via` F009/F017/F018 (transitive E2E per R8).

### 2026-06-01 — F004 DB wrapper (Prisma singleton) + seed the 8 entry templates  [feat/F004]
- TDD: wrote `tests/unit/db.test.ts` first (singleton once-only + 8-template fidelity + idempotency),
  watched it fail, then implemented `src/lib/db.ts` + `prisma/seed.ts`. 10 tests green.
- **DB-/generate-independent (ADR-0002 / ADR-0006):** proved empirically that a static
  `import {PrismaClient}` breaks `tsc` (TS2305) AND throws at runtime (`@prisma/client` re-exports the
  ungenerated `.prisma/client`), and that `init.sh`/`pnpm check` never run `prisma generate`. So `db.ts`
  is a **lazy** singleton (dynamic import on first use, cached on `globalThis`) and `seed.ts` only touches
  `@prisma/client` inside a guarded `main()`. The test proves the singleton + idempotency via injection — no DB.
- Seeded the 8 entry templates (탄생·백일·돌·생일·입학·첫 걸음마·첫 말·형아 된 날) with exact
  category/key/label/extraVar per `PRODUCT_BRIEF`, 43,000/49,000원, idempotent `upsert` on the unique `key`.
- **Adversarially reviewed** (5-dimension workflow, each finding verified): fixed a singleton TOCTOU race
  (cache the in-flight promise, not the resolved value, so concurrent first-use builds one client) and
  added a stateful-fake idempotency test (two runs → exactly 8 rows). Dismissed 1 nit.
- Verified on an **isolated `feat/F004` worktree off `master`** (the shared checkout was on a sibling
  track's branch): full `pnpm check` green (typecheck + 19 tests + R1–R7 0 violations). Touched only the
  4 allowed files; `feature_list` F004 → `passing` (R4 holds); attempt reset.
- Next: F003 (Toss) / F029 (asset) land on their branches; then catalog F005/F006 read the seeded templates.

### 2026-06-01 — F003 payment provider abstraction + Stripe→Toss re-point (TRACK-PAY)
- Built `src/lib/payments/`: provider-agnostic `PaymentProvider` contract (`index.ts`) + TossPayments
  **test/sandbox** adapter (`toss.ts`). KRW won = integer (no minor unit), enforced. `confirm()` uses an
  **injectable transport** so `pnpm check` stays hermetic (no network — parallels the DB rule, ADR-0002);
  maps Toss `DONE→PAID`, error→`FAILED`, `CANCELED→CANCELED`. Adapter refuses live keys (defence in depth).
- Re-pointed Stripe→Toss across the safety machinery: `env.ts` refuses a live Toss key (`live_sk_`/`live_ck_`)
  outside production + redacts Toss keys; `check-constraints` **R1** now flags Toss live keys (grouped regex so
  the rule's own source can't self-match — empirically verified it stays clean AND fires on a planted live key);
  `guardrails` IRREVERSIBLE_ACTIONS → `toss.charge.live`/`toss.refund.live` + `consultation.book`, with
  `scripts/approve.mjs` kept in sync (so the error messages' `pnpm approve toss.charge.live` is real).
- TDD: payments.test.ts (13) RED→GREEN first; smoke.test.ts Toss assertions (10) RED→GREEN. `pnpm check`
  green (lint+type+unit+constraints). F003 `passing` (R4 holds); F030/F031 evidence refreshed to Toss. attempt reset.
- Worker≠checker (ADR-0005/F042): ran a 5-dimension adversarial review (each finding independently
  verified). 5 real findings, all addressed: re-pointed `.env.example` to the Toss env contract; added tests
  for `confirm()`'s KRW guard, the env client-key live branch, and the legacy-Stripe redact branch; fixed a
  stale "Stripe webhook" comment in guardrails.ts. 1 dismissed (CI STRIPE_* env — harmless, deferred).
- Scope note: completing the rename meant touching `scripts/approve.mjs` (approval gate must know the renamed
  actions) and `.env.example` (dev-facing env contract) — both beyond the literal track file list but unowned
  by any sibling Wave-0 track (zero merge-conflict risk).
- Next: remaining Wave 0 (F004 DB, F029 asset, content F024–F028).

### 2026-06-01 — TRACK-CONTENT (F024–F028) content pages [feat/content worktree]
- Built 5 static content pages on the Atelier Sans system, isolated in a `feat/content` worktree off
  master (other Wave-0 tracks' uncommitted WIP in the main checkout left untouched): **F024 브랜드 스토리**
  (grounded translator narrative + flagged founder-story TODO), **F025 갤러리** (honest placeholder tiles),
  **F026 후기** (honest empty state + framed beta 80% signal, no fabricated quotes), **F027 FAQ** (native
  `<details>` accordion, 5 topics incl. honest 환불 placeholder), **F028 문의** (전화/이메일 flagged
  placeholders + client form that tags input `untrusted()` and gives honest guidance, no fake receipt).
- Honesty-first (날조 금지): every unprovided datum (founder story / sample images / reviews / 전화·이메일 /
  배송 carrier·fee / 환불 policy) is a visible, code-flagged `TODO`, never fabricated.
- Styled without touching the off-limits `globals.css`: co-located **CSS Modules** consuming `:root` tokens;
  new shared sub-components under `_components/content/` (GalleryTile, FaqItem, ContactForm). The F002
  `_components` kit + `globals.css` were import-only.
- TDD per feature (spec first → page → `pnpm check` + that page's E2E). Full gate green: `pnpm check`
  (lint+typecheck+9 unit+constraints 0) + **13 E2E passed**. F024–F028 `passing` + dated evidence; attempts reset.
- Docs: `docs/superpowers/specs/2026-06-01-content-pages-design.md` + `…/plans/2026-06-01-content-pages.md`.
  Commits: 9b728e1 · d0129ea · fe6295e · 7580693 · ac2d815.
- Next: merge `feat/content` → master one branch at a time (`pnpm check` each) per the runbook merge prompt.

### 2026-06-01 — F002 branded home (pattern-setter) + runbook refinement
- Built the 그림책 제작소 branded home (hero + 3-category preview + primary CTA) and the reusable
  `src/app/_components/` kit (Nav, Footer, Button/CtaLink, SectionHeader, CategoryCard) — all styled
  from DESIGN.md tokens (component classes added to `globals.css`; R6/R7 clean).
- TDD: rewrote `home.spec.ts` first (brand/hero/3 cards/CTA + 375px). `pnpm check` green + E2E 2 passed
  → F002 `passing` (R4 holds), attempt reset.
- Refined `docs/SESSION_PROMPTS.md` per re-examination: default = single-session context-batch; subagent
  offload only for independent/mechanical tracks; stateful funnels stay in main (parallel sessions dropped).
- Next: Wave 0 (F003/F004/F029 + content F024–F028).

### 2026-06-01 — repurpose to 그림책 제작소 (spec layer) + DESIGN.md wiring
- Wired DESIGN.md (Atelier Sans) as UI SoR: tokens→`globals.css`, fonts→`layout.tsx`, refs (root +
  `src/app/AGENTS.md`), executable R6 (no box-shadow) / R7 (no pure #fff/#000). ADR-0008. Verified green.
- Replaced harness CONTENT, kept ENGINE: PRODUCT_BRIEF v2; schema (Template/Order/Personalization/
  CustomRequest/Consultation/Asset; KRW won; no inventory); feature_list (42 features, entry-line first);
  AGENTS.md router; ADR-0009.
- 3 decisions: TossPayments (provider-agnostic; Stripe swap scheduled as F003), web scope =
  commerce+intake+mypage (AI generation backstage / out of web scope), build order = entry line first.
- `src/` runtime untouched → `pnpm check` green (lint+typecheck+9 tests+constraints R1–R7 incl R4/R5 on 42 features).
- Next: coding loop. Foundations F004 ∥ F003 (parallel-safe), then F002 branded home.

### 2026-06-01 — review hardening (accepted design feedback)
- R4 invariant (`state:"passing"` ⟺ `passes:true`) + R5 executable termination (3 attempts → must be `blocked`)
  added to `pnpm constraints`; both tested (R5 fires + resets). Termination is now counted, not prose.
- `pnpm status`: honest dual metric (product delivery vs harness readiness) — anti-Goodhart.
- `feature_list.json` v2: every feature tagged `track: product|harness` (de-conflates store vs methodology).
- Consolidated `session-handoff.md` into this file (cut a per-session drift surface).
- `pnpm attempt <id>` ledger (`.harness/attempts.json`, committed) records attempts across sessions.

### 2026-06-01 — harness bootstrap (INITIALIZER)
- Done & verified: runnable Next.js 15 skeleton; `pnpm check` green; E2E home smoke 2 passed;
  tools (approve/constraints/eval); state + docs; fresh-clone typecheck robustness verified.
- Changed: whole repo (greenfield → harness). Broken: none (product features unimplemented by design).
