---
doc_type: product_brief
title: "Storybook Shop — Product Brief"
version: "1.0"
last_updated: "2026-06-01"
companion_docs:
  build_guide: docs/method/harness_build_guide.md
  acceptance_rubric: docs/method/harness_engineering_rubric.md
target_rubric_status: READY        # READY(≥80). 결제·PII 도메인 → 안전(E)·G-HITL·G-SANDBOX 하향 금지.
confirmation_log:                  # <확인> 항목 확정 기록 (2026-06-01, product_brief_guide §5)
  stack: "사용자: '네가 스스로 판단' → 제안 기본값 채택(Next.js 15/Prisma+Postgres/pnpm). ADR-0001 참조."
  payments: "Stripe. 실결제(라이브 키)는 이번 빌드 범위 밖 — 별도 승인 게이트(G-HITL)로 격리."
  target: "READY (overall ≥ 80)."
---

# ── machine-readable facts (빌드 가이드가 직접 소비) ──
```yaml
stack:                              # → AGENTS.md, init.sh
  runtime: "Node 20 LTS / TypeScript 5"   # 로컬 설치본은 Node 24까지 허용(engines >=20). .nvmrc=20
  framework: "Next.js 15 (App Router)"
  db: "PostgreSQL 16 (Prisma 6)"          # 로컬: docker-compose. make check는 DB 비의존(ADR-0002)
  payments: "Stripe — 개발/검증은 test mode 전용. 라이브 키는 별도 승인 후."
  package_manager: "pnpm 10"
commands:                           # → package.json scripts, init.sh, 게이트 G-EVAL
  install: "pnpm install"
  start:   "pnpm dev"
  verify:  "pnpm verify"            # = pnpm lint && pnpm typecheck && pnpm test  (make check 대체)
  e2e:     "pnpm test:e2e"          # Playwright로 구매 흐름 검증
autonomy_level: "medium"            # 비가역 행동만 승인, 나머지 자율 → HITL 배치 (G-HITL)
irreversible_actions:               # → 가드레일, scripts/approve.mjs, docs/SAFETY.md (G-HITL)
  - "실제 카드 청구·환불 (개발 중엔 Stripe test mode만)"
  - "주문 확정 / 배송·이행(fulfillment) 트리거"
  - "재고 차감 등 프로덕션 DB 쓰기"
  - "고객 PII 저장·전송, 거래/마케팅 이메일 발송"
  - "프로덕션 배포 / Stripe 라이브 키 전환"
domain_risk: "regulated"            # 결제 + 개인정보(PII) → 안전 가중 ↑
complexity: "moderate"              # 표준 커머스 흐름(트리비얼/극단 복잡 아님) → G-SIMPLE
```

## 1. 목표 & 성공 기준        # → feature_list.json, G-EVAL
- 한 문장 목표: **큐레이션된 고품질 일러스트 동화책을 판매하는 프리미엄 온라인 쇼핑몰**.
- 측정 가능한 성공 기준:
  - 탐색(홈/카탈로그) → 상품상세 → 장바구니 → 체크아웃 → (Stripe test) 결제 → 주문확인 전 과정이 **E2E로 통과**한다.
  - 카탈로그·상품상세·검색/필터·장바구니·체크아웃·주문내역·관리자 등록이 동작한다(각각 feature_list 항목 + verification 명령).
  - **모바일 반응형**으로 렌더되고, **p95 페이지 로드 < 2s**(H3 예산).
  - 결제는 test mode에서 **성공·실패·취소** 경로가 모두 처리된다(Stripe `pm_card_*` 테스트 카드).
- 실패/불가 기준(무엇이 일어나면 안 되나):
  - 결제·주문 확정이 **사용자 검증 없이** 또는 **승인 게이트 없이** 비가역적으로 실행되는 일.
  - 고객 PII가 **로그/트레이스/E2E 픽스처에 평문**으로 남는 일.
  - `make check`(=`pnpm verify`) 또는 E2E 스모크가 깨진 채 `passes:true`로 표시되는 일(거짓 완료).

## 2. 대표 작업 예시 (3개, 정전)   # → feature_list 시드. 엣지케이스 나열 금지
1. 방문자가 홈에서 추천 동화책을 보고 상세로 들어가 **장바구니에 담는다**.
2. 장바구니 → 체크아웃 → **(Stripe test) 결제** → **주문 확인 화면**을 받는다.
3. (관리자) 새 동화책(표지·소개·가격·재고)을 등록하면 **카탈로그에 노출**된다.

## 3. 액션 · 환경            # → Tools/Environment, G-SANDBOX
- 닿는 시스템/데이터: PostgreSQL(상품·주문·재고), **Stripe API(test mode)**, 객체 스토리지/정적 파일(표지 이미지), **고객 PII**(이름·이메일·배송지).
- 실행 환경: 로컬(Node/pnpm) + `docker-compose`(Postgres). CI는 컨테이너에서 `install → verify → e2e`.
- 샌드박스 제약: 비밀값은 env로만, Stripe는 **test 키만**, 외부 부수효과(이메일·결제 청구·배포)는 승인 게이트 뒤.

## 4. 사용자 · 상호작용      # → HITL, 투명성
- 사용자: 구매자(비기술, 모바일 다수) + 관리자(상품 등록). 개발 주체: AI 코딩 에이전트 + 사람 검토자.
- 형태: **다중 세션 장기 작업**(여러 기능을 세션을 나눠 구현) → 상태 서브시스템(PROGRESS/feature_list/handoff) 필요.

## 5. 비기능 제약            # → 카테고리 H
- 지연: 페이지 로드 p95 < 2s(인터랙티브). · 비용/토큰 예산: 기능당 step/cost 예산 추적(H3).
- 규모: 초기 카탈로그 수백 권 수준(극단 스케일 아님). · 컴플라이언스: **결제(PCI: 카드정보는 Stripe가 보관, 우리는 미저장) + 개인정보(PII 최소수집·로그 마스킹)**.

## 6. 리스크 프로파일        # → 카테고리 E·D
- 실수의 파급 범위: 잘못된 청구/환불·주문 오확정·재고 오차감·PII 유출 = **금전적·법적 비가역 피해**.
- 알려진 실패 모드: 결제 webhook 중복/누락(멱등성 필요), 재고 경쟁 상태, 체크아웃 중단(취소 경로), 주입을 통한 권한 우회.
- 비신뢰 입력(웹·파일·사용자) 노출: **yes** — 사용자 입력(검색어·배송지), 관리자 업로드(이미지·설명), Stripe webhook 페이로드. → 신뢰경계·주입 방어(E4) 필요.

## 7. 현재 상태             # → 빌드 시작점
- **그린필드**. 기존 스택·코드·이전 eval 없음. 본 하네스가 첫 산출물.
- 시작 시점에는 **기능 코드 0줄**(Phase 0) — 하네스 골격 + 부팅 가능한 최소 스켈레톤만.
