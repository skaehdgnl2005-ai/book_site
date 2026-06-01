---
doc_type: product_brief
title: "그림책 제작소 — Product Brief"
version: "2.0"
last_updated: "2026-06-01"
supersedes: "v1.0 — placeholder 'Storybook Shop' (generic catalog/cart/Stripe)"
source_brief: "web-brief-v1 (1).md (user-provided; this file is now canonical)"
companion_docs:
  build_guide: docs/method/harness_build_guide.md
  acceptance_rubric: docs/method/harness_engineering_rubric.md
  design_sot: DESIGN.md            # Atelier Sans — UI source of truth (ADR-0008)
target_rubric_status: READY        # 결제 + 아동 PII → 안전(E)·G-HITL·G-SANDBOX 하향 금지.
confirmation_log:                  # 확정 기록 (2026-06-01, ADR-0009)
  payment: "TossPayments 어댑터 1차 구현(test/sandbox). provider-무관 인터페이스 뒤. Stripe 스캐폴딩 교체."
  scope:   "사이트 = 커머스 + 개인화 입력 수집 + 주문관리 + 마이페이지. 책 '생성'(캐릭터/스토리)은 백스테이지(웹 범위 밖)."
  build_order: "엔트리 라인(기념일+첫 순간들) 구매 플로우 우선. 맞춤제작·QR·콘텐츠 페이지는 후순위."
  target:  "READY (overall ≥ 80)."
---

# ── machine-readable facts (빌드 가이드/스키마/feature_list가 직접 소비) ──
```yaml
stack:                               # → AGENTS.md, init.sh
  runtime: "Node 20 LTS / TypeScript 5"
  framework: "Next.js 15 (App Router) / React 19"
  db: "PostgreSQL 16 (Prisma 6)"     # 로컬 docker-compose; pnpm check는 DB 비의존(ADR-0002)
  payments: "TossPayments — dev/verify는 test/sandbox 전용. provider-무관 인터페이스 뒤. 라이브 키는 승인 후."
  design: "DESIGN.md (Atelier Sans) — UI 단일 진실 공급원, 토큰+가드레일로 강제(ADR-0008)"
  package_manager: "pnpm 10"
commands:
  install: "pnpm install"
  start:   "pnpm dev"
  verify:  "pnpm check"              # lint + typecheck + test + constraints
  e2e:     "pnpm test:e2e"           # Playwright — 엔트리 구매 흐름 검증
currency: "KRW (원) — 정수, minor-unit 없음. 코드/DB는 *Won 정수로 저장(센트 아님)."
autonomy_level: "medium"             # 비가역 행동만 승인, 나머지 자율 (G-HITL)
irreversible_actions:                # → 가드레일, scripts/approve.mjs, docs/SAFETY.md
  - "결제 승인/취소/환불 (TossPayments — 개발 중엔 test/sandbox만)"
  - "주문 확정 / 제작·배송(fulfillment) 트리거"
  - "아동 사진 등 민감 PII 저장·전송"
  - "거래/안내 이메일·알림 발송"
  - "상담 예약 확정(고객 대면 약속 생성)"
  - "프로덕션 배포 / 결제 라이브 키 전환"
domain_risk: "regulated"             # 결제 + 아동 PII(사진) → 안전 가중 ↑↑
sensitive_pii:                       # 로그/트레이스/E2E 픽스처에 평문 금지 (redact()/untrusted())
  ["아동 사진", "아동 이름·성별·생년월일", "받는분·배송지·연락처", "헌정/사연 텍스트"]
complexity: "moderate-high"          # 커머스 + 2단계 주문 + 맞춤제작(상담/폼) + 마이페이지 업로드
out_of_scope:                        # 이번 빌드의 웹 범위 밖 (백스테이지/별도 시스템)
  - "AI 책 생성 파이프라인(사진→캐릭터, 템플릿+변수→스토리 자동생성)"
  - "실시간 책 미리보기 렌더링"

product_lines:                       # 고객 노출은 3 카테고리뿐. 내부 라인은 entry / custom 둘.
  entry:                             # '기념일' + '첫 순간들' — 같은 가격·제작방식. 템플릿 = 상품.
    price_won: { soft: 43000, hard: 49000 }
    lead_time: "주문 후 일주일 이내"
    templates:                       # category, key, 추가변수(0~1)
      - { category: anniversary,  key: birth,         label: "탄생",      extra: birthdate }
      - { category: anniversary,  key: hundred_days,  label: "백일",      extra: null }
      - { category: anniversary,  key: first_birthday,label: "돌",        extra: null }          # 플래그십
      - { category: anniversary,  key: birthday,      label: "생일",      extra: age }
      - { category: anniversary,  key: admission,     label: "입학",      extra: school }
      - { category: first_moment, key: first_steps,   label: "첫 걸음마", extra: null }
      - { category: first_moment, key: first_word,    label: "첫 말",     extra: first_word }
      - { category: first_moment, key: became_sibling,label: "형아 된 날",extra: sibling_gender }  # 주인공 성별과 조합→호칭 자동
  custom:                            # '맞춤 제작' — 100% 풀 커스텀
    price_won: 119000
    lead_time: "양식 확정 또는 상담 완료 후 일주일 이내"
    paths: ["phone_booking(상담예약 무료 → 상담 후 결제)", "written_form(결제 → 6묶음 의뢰서 제출)"]

order_inputs_entry:                  # 이탈 최소화 = 2단계 분리
  pre_pay_required: ["아동 이름", "성별(남아/여아)"]            # 공통 필수 2개
  pre_pay_template_var: "위 templates[].extra 중 0~1개"
  pre_pay_optional: ["아동 사진 1장 (건너뛰기 가능 — 결제 막지 않음)"]
  cover_choice: ["soft 43000", "hard 49000"]
  base_included: ["자석 외함", "축하 카드"]
  paid_addon: ["QR 영상 인사 메시지 (기본 미포함)"]
  post_pay_mypage: ["아동 사진(건너뛴 경우)", "(선택)QR 영상", "(선택)헌정 문구/보내는 사람"]
```

## 1. 목표 & 성공 기준        # → feature_list.json, G-EVAL
- 한 문장: **한 아이만을 위한 초개인화 그림책(소장형 기념물)을 주문·결제하는 한국형 커머스 사이트.**
- 측정 가능한 성공 기준:
  - **엔트리 구매 흐름이 E2E로 통과**: 카테고리 → 템플릿 선택 → 최소입력(이름·성별 + 변수 0~1) →
    (선택)사진 올리기/건너뛰기 → 커버(소프트/하드) → **TossPayments(test) 결제** → 주문확인 → 마이페이지 마무리.
  - 결제는 test/sandbox에서 **성공·실패·취소** 경로가 모두 처리된다.
  - **모바일 우선** 반응형(구매 다수가 모바일), **p95 페이지 로드 < 2s**.
  - 맞춤 제작 두 경로(전화 예약 / 글 작성)가 **동일 질문 세트**로 의뢰를 수집한다.
  - UI는 전부 **DESIGN.md(Atelier Sans)** 를 따른다(토큰+R6/R7로 강제).
- 실패/불가 기준(일어나면 안 되는 것):
  - 결제·주문 확정이 **사용자 검증/승인 게이트 없이** 비가역 실행되는 일.
  - **아동 사진·이름 등 민감 PII가 로그/트레이스/E2E 픽스처에 평문**으로 남는 일.
  - `pnpm check`/엔트리 E2E가 깨진 채 `passes:true`로 표시되는 일(거짓 완료).
  - 재고/오버셀 로직을 넣는 일 — **made-to-order**라 재고 개념이 없다(불필요 복잡도, G-SIMPLE).

## 2. 대표 작업 예시 (3개, 정전)   # → feature_list 시드
1. (부모) 홈 → '첫 순간들 > 첫 걸음마' → 이름·성별 입력 → 사진 건너뛰기 → 하드커버 → **Toss 결제** → 마이페이지에서 사진 업로드.
2. (조부모) '기념일 > 돌' → 이름·성별 입력 → 사진 올리기 → 소프트커버 + QR 영상 옵션 → 결제 → 주문확인.
3. (의뢰인) '맞춤 제작' → "전화로 상담 예약" → 캘린더 슬롯 선택 → (상담 후) 결제 → 1:1 제작.

## 3. 액션 · 환경            # → Tools/Environment, G-SANDBOX
- 닿는 시스템/데이터: PostgreSQL(템플릿·주문·개인화·의뢰·상담·자산), **TossPayments(test)**,
  객체 스토리지(아동 사진·QR 영상 업로드), **민감 PII**(아동 사진/이름/생일, 배송지·연락처).
- 실행 환경: 로컬(Node/pnpm) + docker-compose(Postgres). CI는 컨테이너에서 install → check → e2e.
- 샌드박스 제약: 비밀값은 env로만, 결제는 **test/sandbox 키만**, 비가역 부수효과는 승인 게이트 뒤.

## 4. 사용자 · 상호작용      # → HITL, 투명성
- 사용자: **부모**(기록) + **조부모·가족**(선물) — 둘 다 "이 아이만을 위한 단 하나"를 원함. 비기술·모바일 다수.
- 운영자: 제작자(번역가 큐레이션, 백스테이지 제작) + AI 코딩 에이전트 + 사람 검토자.
- 형태: **다중 세션 장기 작업** → 상태 서브시스템(PROGRESS/feature_list/handoff) 필요.

## 5. 비기능 제약            # → 카테고리 H
- 지연: 페이지 로드 p95 < 2s. 비용/토큰: 기능당 step/cost 예산 추적.
- 규모: 초기 템플릿 8종 + 주문 수백 건 수준(극단 스케일 아님). 모바일 우선.
- 컴플라이언스: **결제(PG가 카드정보 보관, 우리는 미저장) + 개인정보(아동 PII 최소수집·접근통제·로그 마스킹).**

## 6. 리스크 프로파일        # → 카테고리 E·D
- 파급: 잘못된 청구/환불·주문 오확정·**아동 사진 유출** = 금전적·법적·평판 비가역 피해.
- 알려진 실패 모드: 결제 webhook 중복/누락(멱등성), 결제-중단(취소 경로), 업로드 악성/대용량 파일,
  맞춤제작 두 경로 인풋 불균질, 주입을 통한 권한 우회.
- 비신뢰 입력(폼·업로드·webhook): **yes** — 주문 폼/사진 업로드/Toss webhook/맞춤의뢰. → 신뢰경계·주입 방어(E4).

## 7. 현재 상태             # → 빌드 시작점
- 하네스 **엔진**(루프·게이트·안전·관측·DESIGN.md)은 구축 완료(`READY`). 본 브리프로 **내용물 교체**.
- 제품 기능은 대부분 미구현 — feature_list.json의 우선순위대로 코딩 루프에서 하나씩(WIP=1) 구현한다.
- 결제는 Stripe 스캐폴딩 → TossPayments로 교체 예정(feature). 아동 PII 업로드 안전은 신규 강화 항목.
