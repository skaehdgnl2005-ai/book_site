---
doc_type: agent_harness_success_rubric
title: "AI 에이전트/LLM 하네스 성공 기준표 (Harness Engineering Success Rubric)"
version: "1.0"
last_updated: "2026-06-01"
language: "ko (technical terms & machine keys in en)"
consumer: "harness-building AI agent"
purpose: >
  하네스 구조를 생성하는 AI가 이 문서를 평가 타깃으로 삼아
  build → self-score → patch 루프를 자동으로 돌리기 위한 기계 판독용 기준표.
scoring_model:
  criterion_scale: [0, 1, 2, 3]   # 0=부재, 1=부분, 2=적정, 3=강함
  category_weights_sum: 100
  hard_gates: true                # 게이트 1개라도 FAIL → status=NOT_READY
status_levels:
  NOT_READY: "게이트 실패 OR 카테고리 floor 미달 OR overall < 80"
  READY:     "모든 게이트 PASS AND 모든 카테고리 fraction ≥ 0.60 AND overall ≥ 80"
  ROBUST:    "READY 조건 충족 AND overall ≥ 90"
source_policy: "규범적(normative) 기준은 Tier-1 1차 엔지니어링 자료만 사용. §7 참조."
---

# 0. 사용 지침 (AI 에이전트가 먼저 읽을 것)

너는 "하네스(harness)"를 설계·구현하는 에이전트다. 하네스란 **모델을 감싸 에이전트로 동작하게 만드는 스캐폴딩** — 에이전트 루프, 도구/ACI, 컨텍스트 관리, 제어·종료, 안전, 평가, 관측성 — 을 말한다. 모델 가중치 학습은 이 범위 밖이다.

이 문서로 다음을 수행한다.

1. `task_spec`에 맞는 **최소 동작 하네스**를 만든다 (§1의 메타 공리, Gate `G-SIMPLE` 준수).
2. §2의 **HARD GATES**와 §3의 **가중 기준**으로 자신의 하네스를 채점한다 (§6 스코어카드 스키마에 출력).
3. §4 공식으로 점수를 계산하고 §5 **루프 프로토콜**대로 패치를 반복한다.
4. `status = READY` (또는 `ROBUST`)에 도달하거나 `max_loops` 소진 시 종료하고 결과·잔여 blocker를 보고한다.

규칙: 점수는 반드시 **증거(evidence)** 와 함께 매긴다(투명성). 게이트는 가중 점수와 무관하게 우선한다. 더 단순한 해법으로 충분하면 복잡도를 추가하지 않는다.

---

# 1. 정의 · 범위 · 메타 공리

**하네스 = f(loop, tools/ACI, context, control, safety, memory/state, eval, observability).**

설계 전 과정에 적용되는 5대 메타 공리 (위반 시 개별 기준 점수에 직접 반영):

| # | 메타 공리 | 출처 |
|---|-----------|------|
| M1 | **단순성**: 가장 단순한 해법에서 시작하고, 복잡도는 효과가 입증될 때만 추가한다. | T1-A |
| M2 | **투명성**: 에이전트의 계획·추론 단계를 명시적으로 노출해 검사 가능하게 한다. | T1-A |
| M3 | **ACI 우선**: 사람용 인터페이스(HCI)만큼 에이전트-컴퓨터 인터페이스(도구 정의·문서·테스트)에 투자한다. | T1-A |
| M4 | **컨텍스트=유한 자원**: attention budget을 의식하고 "원하는 결과를 낼 최소 고신호 토큰 집합"을 지향한다(컨텍스트 부패 회피). | T1-B |
| M5 | **eval 기반 반복**: 모든 변경은 측정 가능한 기준으로 검증하며, 더 나아질 때만 채택한다. | T1-A, T1-C |

---

# 2. HARD GATES (필수 통과 — 하나라도 FAIL이면 `NOT_READY`)

| ID | 게이트 | PASS 조건 | 출처 |
|----|--------|-----------|------|
| `G-SIMPLE` | 불필요 복잡도 없음 | 더 단순한 워크플로/단일 LLM 호출로 충분하면 에이전트를 쓰지 않음. 채택한 구조에 근거가 있음. | T1-A |
| `G-GROUND` | 환경 ground-truth | 매 스텝 도구 결과/실행 결과 등 환경 피드백으로 진행을 판단함(허공 추론 아님). | T1-A |
| `G-TERM` | 종료 보장 | 명시적 완료 기준 + 반복/시간/비용 상한이 존재해 무한 루프가 불가능함. | T1-A |
| `G-ERR` | 복구 가능 오류 | 도구/실행 오류가 루프를 죽이지 않고 **모델 판독 가능한 형태**로 환류됨. | T1-C |
| `G-HITL` | 비가역 행동 보호 | 비가역·고영향 행동(결제·삭제·외부 발송 등) 전 인간 체크포인트 또는 명시적 승인이 강제됨. | T1-A |
| `G-SANDBOX` | 격리 실행 | 실행이 샌드박스 + 최소 권한(least privilege)으로 이루어짐. | T1-A |
| `G-EVAL` | 합·불 판정 가능 | 성공 기준이 정의되고, 합격/불합격을 판정하는 eval이 존재함. | T1-A, T1-C |
| `G-TRACE` | 사후 추적 가능 | 최소한 스텝·도구 호출 단위 트레이스가 남아 사후 디버깅이 가능함. | T2 |

---

# 3. 가중 평가 기준 (Categories A–H, 합계 100점)

각 기준은 0–3으로 채점한다. 표의 "0 / 3 기준선"이 채점 앵커다. 카테고리 floor는 fraction ≥ 0.60.

## A. 에이전트 루프 · 제어 흐름 — weight **15**

| ID | 기준 | 0 ↔ 3 앵커 | 출처 |
|----|------|-----------|------|
| `A1` | 루프 구조 | 0=1회성 호출, 관찰 없음 / 3=perceive→reason→act→observe 루프, 매 스텝 관찰·갱신 | T1-A |
| `A2` | 종료 조건 | 0=무한 루프 가능 / 3=완료 기준 + 반복·시간·비용 상한(다중) | T1-A |
| `A3` | 구조 적합성 | 0=불필요한 멀티에이전트/프레임워크 남용 / 3=작업에 맞는 최소 구조 + 선택 근거 | T1-A |
| `A4` | 투명성 | 0=블랙박스 / 3=계획·결정 단계가 로그/표시로 추적 가능 | T1-A |
| `A5` | 교착·무진전 감지 | 0=감지 없음 / 3=무진전·반복 감지 → 재계획·중단·에스컬레이션 | T1-A |

## B. 도구 · 에이전트-컴퓨터 인터페이스(ACI) — weight **16**

| ID | 기준 | 0 ↔ 3 앵커 | 출처 |
|----|------|-----------|------|
| `B1` | 고레버리지 선택 | 0=중복/얇은 API 래퍼 남발 / 3=역량을 실질 확장하는 핵심 도구만 | T1-C |
| `B2` | 네임스페이싱·비중복 | 0=기능 중복으로 선택 모호 / 3=경계 명확, 어떤 도구를 쓸지 일의적 | T1-C, T1-B |
| `B3` | 토큰 효율 반환 | 0=원시 대용량 덤프 / 3=고신호 핵심만 구조화 반환 | T1-C |
| `B4` | 스펙·설명 품질 | 0=빈약한 타입만(`start_date: string`) / 3=신입 온보딩 수준 docstring(필수/선택·포맷 예 `YYYY-MM-DD`·예시·경계) | T1-C, T1-A |
| `B5` | Poka-yoke(오류 방지) | 0=상대경로·취약 포맷 허용 / 3=인자 설계로 실수 차단(절대경로 강제 등), 모델이 쓰기 쉬운 포맷 | T1-A |
| `B6` | 도구 견고성 | 0=잘못된 호출 시 예외로 루프 중단 / 3=구조화된 복구 가능 오류 반환 | T1-C |

## C. 컨텍스트 엔지니어링 — weight **15**

| ID | 기준 | 0 ↔ 3 앵커 | 출처 |
|----|------|-----------|------|
| `C1` | 최소 고신호 토큰 | 0=무차별 채우기(context rot 유발) / 3=정제된 최소 고신호 집합 | T1-B |
| `C2` | 시스템 프롬프트 고도 | 0=하드코딩 if-else 또는 모호한 일반론 / 3=적정 고도 + 구조화 섹션(XML/마크다운 헤더) | T1-B |
| `C3` | 검색 전략 | 0=전부 사전 적재 또는 무전략 / 3=경량 식별자 기반 just-in-time 또는 하이브리드 | T1-B |
| `C4` | 장기 작업 관리 | 0=컨텍스트 한도 도달 시 붕괴 / 3=compaction·structured note-taking·sub-agent 중 적합 기법 적용 | T1-B |
| `C5` | 컨텍스트 정리 | 0=무한 누적 / 3=오래된 tool 결과 클리어 등 점진적 가지치기 | T1-B |
| `C6` | 예시 큐레이션 | 0=엣지케이스 나열 덤프 / 3=다양하고 정전(canonical)인 대표 예시 셋 | T1-B |

## D. 오류 처리 · 복구 — weight **12**

| ID | 기준 | 0 ↔ 3 앵커 | 출처 |
|----|------|-----------|------|
| `D1` | 오류 캡처·환류 | 0=무처리/침묵 실패 / 3=오류를 잡아 모델 판독 형태로 루프에 환류 | T1-C, T2 |
| `D2` | 재시도·백오프·폴백 | 0=없음 / 3=정책화된 재시도 + 백오프 + 대체 경로 | T2 |
| `D3` | 자기수정 | 0=동일 실패 반복 / 3=환경 피드백으로 행동을 스스로 교정 | T1-A |
| `D4` | 캐스케이드 차단 | 0=오류가 후속 행동으로 전파 / 3=검증 게이트·영향 격리로 연쇄 차단 | T2, T1-A |

## E. 안전 · 가드레일 · 권한 — weight **12**

| ID | 기준 | 0 ↔ 3 앵커 | 출처 |
|----|------|-----------|------|
| `E1` | HITL 체크포인트 | 0=무승인 비가역 실행 / 3=비가역·고영향 행동 전 검토·승인 강제 | T1-A |
| `E2` | 샌드박스·최소권한 | 0=무제한 실행 / 3=실행 격리 + least privilege | T1-A |
| `E3` | 입·출력 가드레일 | 0=스크리닝 없음 / 3=부적절 입력/출력 스크리닝(가능 시 별도 모델 패스) | T1-A |
| `E4` | 신뢰경계·주입 방어 | 0=비신뢰 콘텐츠(도구·웹·파일) 지시를 사용자 지시와 혼동 / 3=경계 명시 + 프롬프트 인젝션 방어 | T2 |
| `E5` | 권한 범위 | 0=전권 / 3=행동 권한 화이트리스트·범위 한정 | T2 |

## F. 상태 · 메모리 · 재현성 — weight **8**

| ID | 기준 | 0 ↔ 3 앵커 | 출처 |
|----|------|-----------|------|
| `F1` | 영속 상태·체크포인트 | 0=중단 시 상태 손실 / 3=체크포인트 + 재개(resume) 가능 | T1-B |
| `F2` | 외부 메모리 | 0=없음 / 3=컨텍스트 밖 파일 기반 메모리 저장·검색 | T1-B |
| `F3` | 버전 고정 | 0=핀 없음 / 3=모델·프롬프트·도구 버전 고정으로 회귀 비교 가능 | T2 |

## G. 평가 · 피드백 루프 — weight **14**

| ID | 기준 | 0 ↔ 3 앵커 | 출처 |
|----|------|-----------|------|
| `G1` | Eval 하네스 | 0=평가 없음 또는 장난감 단일 프롬프트 / 3=현실적 다단계 작업을 agentic loop로 실행·평가 | T1-C, T2 |
| `G2` | 골든·회귀셋 | 0=없음 / 3=버전드 골든 데이터셋으로 행동 baseline·회귀 방지 | T2 |
| `G3` | 에이전트 지표 | 0=무지표 / 3=task success, tool correctness, argument correctness, step efficiency, plan adherence/quality 측정 | T2 |
| `G4` | 과적합 방지 | 0=개발셋으로 튜닝·평가 동시 / 3=예약(holdout) 테스트셋 분리 | T1-C |
| `G5` | 채점 방식 | 0=임의/없음 / 3=LLM-as-judge 루브릭 + 필요한 곳 인간 검토 | T2 |
| `G6` | 실패 클러스터링 | 0=일회성 수정 / 3=실패를 범주화해 카테고리 단위로 근본 개선 | T2 |

## H. 관측성 · 운영(비용·지연) — weight **8**

| ID | 기준 | 0 ↔ 3 앵커 | 출처 |
|----|------|-----------|------|
| `H1` | 트레이싱 | 0=관측 불가 / 3=세션·스텝·함수 레벨 end-to-end 트레이스(도구 호출·sub-agent 포함) | T2 |
| `H2` | 운영 지표 | 0=없음 / 3=latency·token usage·cost·error rate·tool-call failure rate 수집 | T2 |
| `H3` | 비용·지연 예산 | 0=무예산 / 3=작업당 토큰·비용·스텝 예산 설정·추적 + 모델 라우팅·캐싱·안전 병렬화 | T1-A |

---

# 4. 점수 계산 (scoring algorithm)

```
# 입력: 각 criterion score ∈ {0,1,2,3}, gate ∈ {PASS, FAIL}
for each category C:
    C.fraction = sum(score in C) / (3 * count(criteria in C))   # 0.0 .. 1.0
    C.points   = C.fraction * C.weight
    C.floor_ok = (C.fraction >= 0.60)

overall = sum(C.points for all C)            # 0 .. 100
gates_ok = all(gate == PASS)

if   not gates_ok:                 status = NOT_READY
elif not all(C.floor_ok):          status = NOT_READY
elif overall <  80:                status = NOT_READY
elif overall >= 90:                status = ROBUST
else:                              status = READY
```

기준 점수 가이드: **0** 해당 요소 부재 · **1** 흔적만/불완전 · **2** 실무 적정 · **3** 모범적·견고.

---

# 5. 하네스 제작 루프 프로토콜 (build → score → patch)

```
INPUT  : task_spec, environment, max_loops (기본 5)
OUTPUT : harness, scorecard, status, blockers

state.harness = build_minimal(task_spec)        # M1 / G-SIMPLE: 가장 단순한 동작본
for n in 1..max_loops:
    scorecard = self_assess(state.harness)      # §6 스키마로 출력 (gates + 38개 criteria, 각각 evidence)
    compute(scorecard)                          # §4 공식 → fraction, points, overall, status

    if scorecard.status in {READY, ROBUST}:
        return state.harness, scorecard, status, blockers=[]

    # 우선순위: 게이트 실패 = 최우선(무한대), 그 외 = weight_share * (target - score)
    deficits = []
    for g in gates where FAIL:      deficits.add(priority=INF, fix=g)
    for c in criteria where score < target(=2 for floor, 3 for robust):
        deficits.add(priority = c.category_weight/100 * (target - c.score), fix=c)
    sort deficits by priority desc

    apply_patches(top_k(deficits, k=3))          # 루프당 최대 3개 집중 패치 (과도한 변경 금지)
    log_diff_and_rationale()                      # M2: 변경 내용·근거 기록

# 소진 시: 미해결 게이트/플로어를 blocker로 보고
return state.harness, scorecard, status=NOT_READY, blockers=unmet(gates, floors)
```

목표 점수(target): floor 통과를 위해 각 기준 ≥ 2, `ROBUST` 지향 시 핵심 기준 = 3.
한 번에 3개 이하만 패치하고 재채점한다(변경-측정 인과를 명확히 유지, M5).

---

# 6. 기계 판독용 스코어카드 스키마 (에이전트가 매 루프 출력)

```yaml
harness_id: "<string>"
loop_iteration: <int>
task_spec_ref: "<string>"

gates:                       # 8개 전부 평가
  G-SIMPLE:  { status: PASS|FAIL, evidence: "" }
  G-GROUND:  { status: PASS|FAIL, evidence: "" }
  G-TERM:    { status: PASS|FAIL, evidence: "" }
  G-ERR:     { status: PASS|FAIL, evidence: "" }
  G-HITL:    { status: PASS|FAIL, evidence: "" }
  G-SANDBOX: { status: PASS|FAIL, evidence: "" }
  G-EVAL:    { status: PASS|FAIL, evidence: "" }
  G-TRACE:   { status: PASS|FAIL, evidence: "" }

categories:
  A_loop_control:        { weight: 15, scores: {A1:0, A2:0, A3:0, A4:0, A5:0},        fraction: 0.0, points: 0.0, floor_ok: false }
  B_tools_aci:           { weight: 16, scores: {B1:0, B2:0, B3:0, B4:0, B5:0, B6:0},  fraction: 0.0, points: 0.0, floor_ok: false }
  C_context_eng:         { weight: 15, scores: {C1:0, C2:0, C3:0, C4:0, C5:0, C6:0},  fraction: 0.0, points: 0.0, floor_ok: false }
  D_error_recovery:      { weight: 12, scores: {D1:0, D2:0, D3:0, D4:0},              fraction: 0.0, points: 0.0, floor_ok: false }
  E_safety_guardrails:   { weight: 12, scores: {E1:0, E2:0, E3:0, E4:0, E5:0},        fraction: 0.0, points: 0.0, floor_ok: false }
  F_state_memory:        { weight: 8,  scores: {F1:0, F2:0, F3:0},                    fraction: 0.0, points: 0.0, floor_ok: false }
  G_evaluation:          { weight: 14, scores: {G1:0, G2:0, G3:0, G4:0, G5:0, G6:0},  fraction: 0.0, points: 0.0, floor_ok: false }
  H_observability_ops:   { weight: 8,  scores: {H1:0, H2:0, H3:0},                    fraction: 0.0, points: 0.0, floor_ok: false }

overall_score: 0.0          # 0..100
status: NOT_READY           # NOT_READY | READY | ROBUST
top_deficits:               # 이번 루프에서 패치할 항목(우선순위순)
  - { id: "", reason: "", planned_patch: "" }
evidence_notes: ""          # 채점 근거 요약 (투명성)
```

---

# 7. 출처 · 신뢰성 등급 (provenance)

규범적 기준은 **Tier-1(1차 엔지니어링 자료)** 만 사용했고, 측정·운영 세부는 **Tier-2(검증된 도구·실무 자료)** 로 보강했다. 저신뢰 SEO·재게시물은 규범 근거에서 제외.

**Tier-1 — 1차 엔지니어링 자료 (가장 높은 신뢰성)**
- **T1-A** Anthropic, *Building Effective Agents* (Engineering, 2024-12-19) — 에이전트 정의(도구를 루프에서 쓰는 LLM), 단순성·투명성·ACI 3원칙, 정지 조건, 인간 체크포인트, 샌드박스, 워크플로 vs 에이전트 패턴, 도구 프롬프트 엔지니어링(Appendix 2).
- **T1-B** Anthropic, *Effective Context Engineering for AI Agents* (Engineering, 2025-09-29) — attention budget·context rot, 최소 고신호 토큰, 시스템 프롬프트 고도, just-in-time/하이브리드 검색, compaction·structured note-taking·sub-agent.
- **T1-C** Anthropic, *Writing Effective Tools for AI Agents* (Engineering, 2025-09) — 도구 5원칙(고레버리지 선택·네임스페이싱·고신호 반환·토큰 효율·설명=프롬프트), Prototype→Evaluate→Collaborate 반복, 예약 테스트셋으로 과적합 방지.
- (참고) Anthropic, *How we built our multi-agent research system* — 서브에이전트로 컨텍스트 격리, 복합 리서치에서 단일 에이전트 대비 향상.

**Tier-2 — 검증된 도구·실무 자료 (보강용, 평균 이상 신뢰성)**
- **T2-LangChain** *Production monitoring* — tool-call failure rate, run count by tool, 비즈니스+기술 지표 병행.
- **T2-MLflow** *LLM observability* — 관측성 3기둥(tracing, metrics, evaluations), 스텝·도구 호출 단위 트레이싱.
- **T2-DeepEval / Confident AI** — 에이전트 지표(tool/argument correctness, step efficiency, plan adherence/quality), 골든셋·회귀, CI 통합.
- (참고) Chroma Research *context rot*; S. Willison의 에이전트 정의("LLMs autonomously using tools in a loop").

> 검증 메모: 모든 규범 기준은 Tier-1 원문 전체를 직접 확인해 작성. Tier-2는 동일 주장이 복수 독립 출처에서 일치하는 항목만 채택.

---

# 8. 주의 · 운용 노트

- 본 기준표는 **모델 능력 향상에 따라 더 적은 규제로 수렴**한다(T1-B). 모델이 강해지면 일부 기준의 target은 완화될 수 있으니 `version`을 올려 관리할 것.
- 가중치·임계값은 도메인 위험도에 맞게 조정 가능하나, **HARD GATES와 안전(E) 카테고리는 하향 금지**.
- "통과를 위한 통과"를 경계한다 — 점수는 항상 실제 작업 성공(G1 eval)과 함께 해석한다.
