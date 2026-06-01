---
doc_type: system_readme_index
title: "하네스 엔지니어링 문서 세트 — README / Index"
version: "1.0"
last_updated: "2026-06-01"
language: "ko (technical terms, keys, code in en)"
audience: "이 세트를 사용·배포하는 개발자 + 하네스를 구축하는 AI"
purpose: >
  AI 코딩 에이전트용 신뢰성 하네스를 빈 저장소에서 구축·검증하기 위한 4개 문서 세트의 진입점.
  각 문서의 역할·읽는 순서·상호 참조·근거를 한 장으로 안내한다.
documents:
  - "README.md                      # (이 문서) 진입 / 인덱스"
  - "product_brief_guide.md         # 입력 작성: 무엇을 만드나"
  - "harness_build_guide.md         # 구축 절차: 어떻게 만드나 (Phase 0–7)"
  - "harness_engineering_rubric.md  # 합격 기준: 잘 만들었나 (게이트 G-*, 카테고리 A–H)"
  - "harness_examples.md            # 패턴 레퍼런스: 좋은 예시 & 왜"
source_policy: "규범 기준은 Tier-1 1차 자료(OpenAI·Anthropic·AGENTS.md 표준)만 사용. 상세는 각 문서 §출처."
---

# 하네스 엔지니어링 문서 세트

## 이게 무엇인가

**모델 가중치를 제외한 모든 인프라**(에이전트 루프·도구·환경·상태·피드백)를 구조화해, **같은 모델의 실행 신뢰성을 끌어올리는** 4개 문서 세트입니다. 핵심 명제: *역량 ≠ 신뢰성 — 실패하면 모델이 아니라 하네스를 점검하라.*

이 세트는 AI 코딩 에이전트(Claude Code · Codex · Cursor 등)가 저장소에서 **빈 상태에서 시작해 다중 세션으로** 작업하는 하네스를 대상으로 합니다. (평가 하네스 `lm-evaluation-harness`·`SWE-bench`는 별도 범주입니다.)

## 문서와 역할

| 문서 | 역할 | 답하는 질문 | 읽는 시점 |
|------|------|-------------|-----------|
| **README.md** | 진입 / 인덱스 | "어디서 시작하나" | 가장 먼저 |
| **product_brief_guide.md** | 입력 작성 가이드 | "무엇을 만드나" | 제품마다 1회 |
| **harness_build_guide.md** | 구축 절차 | "어떻게 만드나" | 그린필드에서 1회(INITIALIZER) |
| **harness_engineering_rubric.md** | 합격 기준 | "잘 만들었나" | 매 검증 루프 |
| **harness_examples.md** | 패턴 레퍼런스 | "좋은 예시 & 왜" | 필요할 때 온디맨드 |

## 4-역할 멘탈 모델

**입력(BRIEF) · 절차(BUILD) · 기준(RUBRIC) · 레퍼런스(EXAMPLES).** 혼동하지 말 것 — 브리프는 *무엇을*, 빌드 가이드는 *어떻게*, 루브릭은 *합격인가*, 예시는 *패턴*을 답한다.

## 워크플로 (읽는 순서)

1. **(이 README)** 오리엔테이션.
2. **`product_brief_guide.md`** 로 `PRODUCT_BRIEF.md`를 작성한다 — 측정 가능한 성공 기준·비가역 행동·고정 버전·검증 명령을 확보(또는 AI에게 §5 인터뷰를 요청).
3. **`harness_build_guide.md`** 로 빈 저장소 → 하네스를 구축한다(Phase 0→7, 5개 하위 시스템). `harness_examples.md`는 패턴이 필요할 때만 참조하되 **복제하지 말고 적응**시킨다(adapt, don't clone).
4. **`harness_engineering_rubric.md`** 로 채점한다 — 모든 HARD GATE PASS + 카테고리 floor + overall ≥ 80(`READY`) / ≥ 90(`ROBUST`)까지 루프.
5. **코딩 루프 운영** — 출근/퇴근 루틴, WIP=1, 클린 상태로 종료.

## 상호 참조 맵

```
product_brief_guide.md  ──produces──▶  PRODUCT_BRIEF.md
harness_build_guide.md  ──consumes──▶  PRODUCT_BRIEF.md
harness_build_guide.md  ──targets────▶  harness_engineering_rubric.md   (= definition of done)
harness_build_guide.md  ──references─▶  harness_examples.md             (on-demand)
harness_engineering_rubric.md  ──scores──▶  build 산출물
```

각 문서는 ID로 맞물립니다: 루브릭의 게이트 `G-*`·카테고리 `A–H`, 빌드 가이드의 `Phase 0–7`·5개 하위 시스템, 예시의 DNA ↔ 시스템 매핑(§2)이 서로를 가리킵니다.

## 빠른 시작

1. 이 세트를 저장소 루트(또는 `docs/`)에 둔다.
2. `product_brief_guide.md` §2 템플릿으로 `PRODUCT_BRIEF.md`를 채운다(또는 AI에게 §5 인터뷰 요청).
3. **킥오프 프롬프트**(번들 상단에 포함)를 이 문서들과 함께 코딩 에이전트에 전달한다.
4. 에이전트가 구축 → 자가 채점하면 `READY`까지 결손을 보강한다.

## 유지보수

하네스도 코드처럼 부패한다 → **정기 감사 + 모델 향상 시 단순화**(비활성 구성요소 제거). 변경 시 각 문서의 `version`을 올려 관리한다.

## 근거 (Tier-1)

OpenAI *Harness Engineering*; Anthropic *Building Effective Agents* · *Effective Context Engineering* · *Writing Tools for AI Agents* · *Effective harnesses for long-running agents*; **AGENTS.md** 오픈 표준(Linux Foundation 산하 AAIF) + ETH 취리히 연구(과적재 컨텍스트는 성공률↓·비용↑). 문서별 상세 출처는 각 파일 하단 §출처 참조.
