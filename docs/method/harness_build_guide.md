---
doc_type: agent_harness_build_guide
title: "하네스 구축 가이드 (Greenfield Harness Build Guide)"
version: "1.0"
last_updated: "2026-06-01"
language: "ko (technical terms, keys, code in en)"
consumer: "harness-building AI agent (the INITIALIZER)"
purpose: >
  빈 저장소(greenfield)에서 AI 코딩 에이전트용 하네스를 처음부터 구축하기 위한
  기계 판독용 절차 + 모범 구조 + 템플릿. 구축이 끝나면 채점은 별도 루브릭에 위임한다.
companion_docs:
  acceptance_rubric: "harness_engineering_rubric.md   # 합격 기준(게이트 G-*, 카테고리 A-H). 이 빌드의 'definition of done'."
  product_brief: "PRODUCT_BRIEF.md                    # 만들 제품 정보(입력). 없으면 §0.2 최소 질문으로 수집."
  examples: "harness_examples.md                      # 우수 하네스 패턴 레퍼런스. 필요할 때만 온디맨드 참조(adapt, don't clone)."
  readme: "README.md                                  # 세트 진입점·워크플로·상호 참조 맵."
scope: "AI 코딩 에이전트(Codex / Claude Code / Cursor 등)가 저장소에서 다중 세션으로 작업하는 하네스."
source_policy: "규범 기준은 Tier-1 1차 자료(Anthropic·OpenAI·AGENTS.md 표준)만 사용. §8 참조."
---

# 0. 사용 지침 (AI가 가장 먼저 읽을 것)

너는 빈 저장소에서 하네스를 세우는 **INITIALIZER**다. 이 문서로 다음을 수행한다.

1. 입력으로 `PRODUCT_BRIEF.md`(제품 정보)를 받는다. 없으면 **§0.2의 최소 질문**으로 먼저 수집한다.
2. **§3 빌드 시퀀스(Phase 0→7)** 를 순서대로 실행해 5개 하위 시스템의 산출물을 만든다(**§4 템플릿** 사용).
3. **§7 부트스트랩 계약**을 충족하면, `harness_engineering_rubric.md`로 자신을 채점한다.
   - `status = READY`(게이트 전부 PASS, 모든 카테고리 floor 충족, overall ≥ 80)가 될 때까지 보강한다.
4. READY 도달 후 **§5 코딩 루프**로 전환해 기능을 하나씩 구현한다.

문서 3종의 역할 분리(혼동 금지):

| 문서 | 답하는 질문 | 읽는 시점 |
|------|-------------|-----------|
| **이 문서** (BUILD_GUIDE) | "어떻게 하네스를 만드는가" | 그린필드에서 1회 (초기화) |
| RUBRIC | "이 하네스가 좋은가 (합격인가)" | 매 검증 루프 |
| PRODUCT_BRIEF | "무엇을 만드는가" | 입력으로 상시 참조 |

## 0.1 이 문서가 존재하는 이유 (사용자의 통찰)

채점 루브릭만으로는 빈 파일에서 아무것도 만들지 못한다. 루브릭은 결과물을 *평가*할 뿐, *생성* 방법을 모른다. 그래서 모범 구조·템플릿·구축 순서를 담은 본 문서가 루브릭 **앞에** 필요하다. (build → verify 순서)

## 0.2 PRODUCT_BRIEF가 없을 때 최소 질문 (이 답 없이는 구축 불가)

1. 제품이 하는 일과 **측정 가능한 성공 기준**은? (→ feature_list 생성의 근거)
2. 기술 스택과 **고정 버전**은? (→ AGENTS.md, init.sh)
3. 어떤 행동이 **비가역·고위험**인가? (→ 가드레일, RUBRIC `G-HITL`)
4. **검증을 어떻게 실행**하는가(테스트·린트·타입·E2E 명령)? (→ RUBRIC `G-EVAL`)
5. 단발 작업인가 **다중 세션 장기 작업**인가? (→ 상태 서브시스템 깊이)

---

# 1. 정의 · 멘탈 모델

**하네스 = 모델 가중치를 제외한 엔지니어링 인프라 전체** — 에이전트가 안정적으로 동작하게 해주는 외골격. 한 줄로 "**모델 가중치가 아니면 모두 하네스**".

세 가지 공리:

- **역량 ≠ 신뢰성.** 강력한 모델도 실제 저장소에서 반복 실패한다. 실패 시 첫 행동은 모델 교체가 아니라 **하네스 점검**이다.
- **저장소 = System of Record(SoR).** "에이전트가 볼 수 없는 것은 실질적으로 존재하지 않는다." 머릿속·Slack·위키의 지식은 에이전트에겐 **없는 것**이다 → 저장소 안으로 옮긴다.
- **상태 영속 > 큰 컨텍스트.** 에이전트는 세션마다 기억이 0인 "교대 근무 엔지니어"다. 다음 교대자가 즉시 이어받게 인계물을 남긴다.

## 1.1 하네스의 5개 하위 시스템 (구축 단위)

| 하위 시스템 | 책임 | 핵심 산출물 | RUBRIC 매핑 |
|-------------|------|-------------|-------------|
| **Instructions** (지시) | 무엇을·어떤 순서로 | `AGENTS.md` + 분산 문서 | C (컨텍스트) |
| **Tools** (도구) | 무엇을 할 수 있나 | 검증 체인, MCP, CLI | B (도구/ACI) |
| **Environment** (환경) | 어디서 돌고 어떻게 시작하나 | `init.sh`, 환경 명세 | E·H (안전·운영) |
| **State** (상태) | 무엇을 했고 어디까지 왔나 | `feature_list.json`, `PROGRESS.md`, git | A·F (루프·상태) |
| **Feedback** (피드백) | 동작했는지 어떻게 아나 | 테스트·E2E·worker/checker | D·G·H (복구·평가·관측) |

피드백 서브시스템이 보통 **최고 ROI**다(검증 없는 하네스는 거짓 완료를 막지 못한다).

---

# 2. 핵심 설계 원칙 (build-time)

구축 내내 적용한다. 각 원칙은 RUBRIC의 게이트·기준과 직접 연결된다.

1. **저장소 = SoR.** 에이전트가 알아야 할 모든 것을 버전 관리되는 파일로 둔다. 검증: *콜드 스타트 테스트* — 저장소만 보고 핵심 5문항에 답할 수 있어야 한다.
2. **기계 검증 가능한 완료.** "코드 작성됨"이 아니라 "**실행 가능한 검증이 통과됨**"이 완료다. (`make check` + E2E) → RUBRIC `G-EVAL`.
3. **제약하되 마이크로매니지 금지.** 단계별 지시 대신 **실행 가능한 가드레일**로 규칙을 강제한다.
4. **"도구가 곧 제약이다."** 린터·타입체커·훅·CI가 결정적으로 강제할 수 있는 규칙은 `AGENTS.md`에 **다시 적지 않는다**. 반복은 신호를 희석하고, 에이전트가 강제할 수 없는 짐을 지운다. (연구 근거: T1-D)
5. **Pink Elephant 회피.** "X 하지 마"는 토큰 X를 attention에 띄워 오히려 X를 부른다. **금지 대신 긍정 규칙**으로 적는다("Y를 사용하라"). (연구 근거: T1-D)
6. **최소 고신호.** `AGENTS.md`는 **라우터(50–200줄)** 이지 백과사전이 아니다. "에이전트가 스스로 발견할 수 없는 것"만 적는다. (아키텍처 개요 섹션은 효과가 낮으니 명령·제약·비표준 패턴 위주.) ⚠️ **사람이 큐레이션**하라 — LLM이 자동 생성한 컨텍스트 파일은 작업 성공률을 낮추고 비용을 20%↑ 시킨다(T1-D).
7. **초기화 ≠ 구현.** 초기화는 **기능 코드 0줄의 독립 첫 단계**다. 둘을 섞으면 둘 다 망가진다.
8. **WIP = 1.** 동시에 기능 하나만. "인증 추가" 같은 광범위 작업이 12파일·800줄인데 E2E 0개로 끝나는 실패를 막는다.
9. **worker ≠ checker.** 작업자는 자기 작업을 과신·칭찬한다(학생이 자기 시험을 채점하지 않는다). 완료 판단을 외부화한다. → RUBRIC G-카테고리.
10. **하네스도 부패한다.** 정기 감사 + 모델 향상 시 낡은 구성요소 제거(단순화). → RUBRIC M1/`G-SIMPLE`.

---

# 3. 빌드 시퀀스: 빈 저장소 → 동작 하네스 (THE BUILD)

순서대로 실행한다. 각 Phase 끝에 **충족하는 RUBRIC 게이트**를 표시했다.

## Phase 0 — INITIALIZE (기능 코드 0줄)
- `git init` → 빈 저장소 확인(`pwd`).
- `PRODUCT_BRIEF`(또는 §0.2 답변)에서 스택·성공 기준·위험 행동·검증 명령을 추출.
- 이 단계에서 **제품 기능을 구현하지 않는다.** 오직 하네스 골격만 세운다.
- *충족 게이트:* `G-SIMPLE`(가장 단순한 골격부터).

## Phase 1 — Instructions: `AGENTS.md` 작성 (§4.1 템플릿)
- 루트에 `AGENTS.md` 생성(오픈 표준; Claude Code는 `CLAUDE.md`로 심볼릭 링크 가능: `ln -s AGENTS.md CLAUDE.md`).
- 50–200줄, 라우터 구조: 개요 / 고정 버전 스택 / **명령은 앞쪽에** / 완료의 정의 / 하드 제약(≤15, 긍정 프레이밍) / 파일 지도 / 세션 루틴.
- 상세 문서는 `docs/ARCHITECTURE.md`, `docs/CONSTRAINTS.md`로 분리하고 링크만(점진적 공개).
- 원칙 4·5·6 적용(도구가 제약·긍정 프레이밍·최소 고신호).
- *충족:* RUBRIC `C2`, `B4`.

## Phase 2 — Environment: `init.sh` + 환경 명세 (§4.3)
- `init.sh` 작성: `INSTALL_CMD` → **기준선 VERIFY_CMD(먼저 통과해야 함)** → `START_CMD`. 멱등하게.
- 환경 명세 고정: `pyproject.toml`/`package.json`, `.python-version`/`.nvmrc`, 필요 시 `Dockerfile`.
- 샌드박스/최소 권한으로 실행 가능하도록 구성. → RUBRIC `G-SANDBOX`.
- *충족:* `G-SANDBOX`, 세션 시작 효율.

## Phase 3 — Tools: 검증 체인 + 외부 도구 (§4.7)
- `Makefile`에 단일 진입점 `make check = lint + types + test`(예: `ruff check` + `mypy --strict` + `pytest`).
- 아키텍처 규칙은 **실행 가능한 검사**로(예: 금지 import를 `grep` → 실패 시 `exit 1`).
- E2E가 필요하면 브라우저 자동화 도구(예: Puppeteer MCP) 연결. (단위 테스트만으로는 거짓 완료를 못 막는다 — T1-A.)
- 도구는 고레버리지·비중복·고신호 반환으로. → RUBRIC `B1`~`B3`.
- *충족:* `G-EVAL`(검증 실행 가능), B-카테고리.

## Phase 4 — State: `feature_list.json` + 진행/결정 로그 + git (§4.2/4.4/4.5)
- `PRODUCT_BRIEF`의 목표를 **포괄적 기능 목록**으로 확장(작은 제품도 수십 개 권장; Anthropic 사례는 200+). 모두 `passes:false`로 시작.
- **JSON 사용**(모델이 Markdown보다 JSON을 덜 훼손함 — T1-A). 코딩 에이전트는 `passes` 필드만 바꾼다.
- `PROGRESS.md`(현재 *검증된* 상태 = 단일 진실 공급원), `DECISIONS.md`(ADR) 생성.
- *충족:* RUBRIC `F1`/`F2`, 'premature completion' 방지.

## Phase 5 — Feedback: 검증 게이트 + 역할 분리 + 관측성
- **완료 게이트**: 기능은 `make check` 녹색 **그리고** E2E 통과 후에만 `passes:true`.
- **3단계 종료 검사(fail-fast)**: 빌드 → 단위/통합 → E2E. 앞 단계 실패 시 즉시 중단.
- **worker/checker 분리**: 구현 에이전트와 **독립 검토 에이전트**(또는 별도 패스)를 둔다. 하네스 수준 채점은 `harness_engineering_rubric.md`에 위임.
- **계층화 관측성**: 런타임("무엇을") + 프로세스("왜"). 스텝·도구호출 트레이스를 남긴다. → RUBRIC `G-TRACE`, H-카테고리.
- *충족:* `G-ERR`, `G-EVAL`, `G-TRACE`, D·G·H.

## Phase 6 — 부트스트랩 계약 검증 + 첫 커밋
- **§7의 4조건**을 모두 만족하는지 확인.
- 초기 `git commit`(기준선). `init.sh` 실행 → 기준선 검증 통과 확인 → 스모크 테스트 통과.
- *충족:* `G-GROUND`(환경 기준선 확인), `G-TERM`(완료/상한 정의).

## Phase 7 — 핸드오프 → 코딩 루프
- `harness_engineering_rubric.md`로 자가 채점. `READY` 미만이면 결손 카테고리를 보강(루브릭 §5 루프).
- `READY` 도달 시 **§5 코딩 루프**로 전환. INITIALIZER 역할 종료.
- *충족:* 전체 게이트 + overall ≥ 80.

---

# 4. 산출물 카탈로그 + 복사용 템플릿

핵심 4종부터 시작: `AGENTS.md`, `init.sh`, `feature_list.json`, `PROGRESS.md`. 나머지는 필요 시 확장(맹목 복사 말고 제품에 맞게 조정).

## 4.1 `AGENTS.md` (진입 파일 / 라우터, 50–200줄)

```markdown
# <Project Name> — Agent Guide
> README for agents. 사람용은 README.md. 편집 파일에 가장 가까운 AGENTS.md가 우선한다.

## Overview
<1–3문장: 이 프로젝트가 무엇이고 목적이 무엇인지.>

## Tech stack (pinned)   # 버전 미고정 시 에이전트는 학습데이터 관행으로 기본값 선택
- Runtime: <Python 3.12 | Node 20>
- Framework: <FastAPI 0.115 | Next.js 15>
- Package manager: <uv | pnpm>

## Commands (앞쪽 배치 — 반복 참조됨)
- Setup / boot: `./init.sh`
- Run dev server: `<start cmd>`
- Verify everything: `make check`        # lint + types + tests
- Focused test: `<one-test cmd>`

## Definition of done
기능은 (1) feature_list.json의 `passes`가 true가 되고 (2) `make check`가 녹색이며
(3) 사용자 관점 end-to-end 검증을 통과해야만 완료다. 단위 테스트 통과 ≠ 완료.

## Hard constraints (≤15, 긍정 프레이밍)
- feature_list.json은 `passes` 필드만 변경한다. 항목 삭제/이름변경 금지.
- 한 번에 기능 하나만 작업한다(WIP=1). 끝낸 뒤 다음으로.
- 매 세션 종료 시 서술형 메시지로 git commit 한다.
- 비밀값은 env로만 다룬다.
# (린터/타입체커/CI가 강제하는 규칙은 여기 다시 적지 않는다 — 도구가 제약이다.)

## Map (지도일 뿐, 백과사전 아님)
- Source: `src/` — <1줄>
- Tests: `tests/` — <1줄>
- State: `feature_list.json`, `PROGRESS.md`, `DECISIONS.md`
- Deep docs (필요 시 읽기): `docs/ARCHITECTURE.md`, `docs/CONSTRAINTS.md`

## Session routine
시작: `pwd` → `PROGRESS.md` + `git log --oneline -20` 읽기 → `feature_list.json`에서
최우선 `passes:false` 선택 → `./init.sh` → 스모크 테스트.
종료: `make check` 녹색 → commit → `PROGRESS.md` 갱신 → `session-handoff.md` 작성.
```

## 4.2 `feature_list.json` (기계 판독형 프리미티브 — JSON 고정)

```json
{
  "schema": "harness.feature_list/v1",
  "wip_limit": 1,
  "features": [
    {
      "id": "F001",
      "category": "functional",
      "priority": 1,
      "description": "User can create a new chat and receive a response",
      "steps": [
        "Navigate to main interface",
        "Click 'New Chat'",
        "Type a query and press Enter",
        "Verify an AI response appears",
        "Verify the conversation appears in the sidebar"
      ],
      "verification": "<e.g. npm run test:e2e -- new-chat>",
      "state": "not_started",
      "passes": false,
      "evidence": null
    }
  ]
}
```
규칙: 코딩 에이전트는 `state`/`passes`/`evidence`만 갱신. `state ∈ {not_started, in_progress(WIP=1), blocked, passing}`. **삭제·테스트 약화 금지**("미통과=0"이 객관적 완료 신호 — 역압력).

## 4.3 `init.sh` (멱등 초기화 — 매 세션 boot)

```bash
#!/usr/bin/env bash
set -euo pipefail
# init.sh — install → verify baseline → start. 매 세션 처음에 안전하게 재실행 가능.

INSTALL_CMD="<uv sync | pnpm install>"
VERIFY_CMD="<make check | pnpm test>"     # 새 작업 전에 반드시 통과해야 하는 기준선
START_CMD="<uv run uvicorn app:app --reload | pnpm dev>"

echo "==> Installing";  eval "$INSTALL_CMD"
echo "==> Verifying baseline (must pass before new work)"; eval "$VERIFY_CMD"
echo "==> Starting dev server"; eval "$START_CMD"
```
(`chmod +x init.sh`)

## 4.4 `PROGRESS.md` (현재 검증된 상태 = 단일 진실 공급원)

```markdown
# Progress Log
## Current verified state   ← single source of truth
- Last green `make check`: <date / commit>
- Boots via ./init.sh: yes/no
- Features passing: <n>/<total>

## Session log (newest first)
### <date> — <session id>
- Done & verified: <feature ids>
- Changed: <files/areas>
- Broken / known issues: <...>
- Next action (single): <...>
```

## 4.5 `DECISIONS.md` (ADR-lite)
```markdown
# Decision Log
## <date> — <title>
- Decision: <무엇을 선택했나>
- Why: <이유>
- Rejected: <기각한 대안>
```

## 4.6 `session-handoff.md` (세션 인계)
```markdown
# Session Handoff
- Verified working: <...>
- Changed this session: <...>
- Broken / not done: <...>
- Next action (single): <...>
- Resume with: `./init.sh` then `<...>`
```

## 4.7 `Makefile` (표준화된 검증 체인)
```makefile
.PHONY: check test types lint
check: lint types test      ## 단일 명령 = 전체 기계 검증
test:
	<pytest -q | pnpm test>
types:
	<mypy --strict . | pnpm typecheck>
lint:
	<ruff check . | pnpm lint>
```

## 4.8 `clean-state-checklist.md` (종료 전, 5차원)
```markdown
# Clean-State Checklist (매 세션 종료 전)
- [ ] Build: ./init.sh로 무오류 부팅
- [ ] Test: `make check` 녹색
- [ ] Progress: PROGRESS.md가 현재 검증된 상태 반영
- [ ] Artifacts: 잔여/임시 파일 없음, feature_list 상태 정확
- [ ] Startup: 다음 세션이 init.sh + handoff만으로 재개 가능
```
> "'나중에 정리'는 절대 정리하지 않는다는 뜻이다." 엔트로피 누적(예: 12주차 빌드 통과율 100%→68%)을 막는다.

## 4.9 평가/검토 (worker/checker)
하네스 **수준** 채점은 `harness_engineering_rubric.md`에 위임한다. 산출물(기능) **수준** 검토는 구현자와 분리된 독립 패스로 수행하고, 결과를 Accept / Revise / Block으로 판정한다.

---

# 5. 코딩 루프 (구축 후, 매 세션 운영)

```
# 출근 루틴
pwd
read PROGRESS.md ; git log --oneline -20
read feature_list.json → 최우선 passes:false 1개 선택   # WIP=1
./init.sh → 스모크 테스트(기존 기능 깨졌으면 새 작업 전에 먼저 고친다)

# 구현
선택한 feature 1개만 구현 → state=in_progress

# 완료 판정 (외부화)
make check 녹색 AND E2E 통과 → 그때만 passes=true, evidence 기록
(검증 전 리팩터 금지: 완료 우선 제약)

# 퇴근 루틴
clean-state-checklist 5차원 통과 → git commit(서술형) → PROGRESS.md 갱신 → session-handoff.md

# 컨텍스트 관리
컨텍스트 60%↑면 핸드오프 착수: Sonnet 계열=리셋, Opus 계열=컴팩션
```

---

# 6. 진단 & 자기개선 루프 (5 실패 레이어)

실패 시 모델을 의심하지 말고 **레이어에 귀속**시켜 고친다(실행→실패→귀속→수정→재실행, 로그로 정량화해 병목부터).

| # | 실패 레이어 | 하위 시스템 | 증상 | 수정 |
|---|-------------|-------------|------|------|
| 1 | 작업 명세 | Instructions | 모호한 지시, 완료 정의 부재 | AGENTS.md 명료화, feature_list로 기계 판독 범위화 |
| 2 | 컨텍스트 제공 | Instructions/State | SoR 격차(저장소에 없는 지식) | 콜드 스타트 테스트, 지식을 저장소로 이동(가시성 격차 <10%) |
| 3 | 실행 환경 | Environment | 못 돌리거나 못 테스트함 | init.sh, 버전 고정, 샌드박스 |
| 4 | 검증 피드백 | Feedback | E2E 부재, 거짓 완료 | make check + E2E + worker/checker |
| 5 | 상태 관리 | State | 세션 간 연속성·"왜" 상실, 드리프트 | PROGRESS + git 체크포인트 + handoff |

하네스 부패 대응: 월 1회 단순화(비활성 구성요소 → 벤치마크 → 제거). 규칙을 추가하기 전에 항상 "**전용 주제 문서가 더 낫지 않나?**"를 먼저 묻는다.

---

# 7. 부트스트랩 계약 (그린필드 완료 정의) → 루브릭 연결

INITIALIZER는 아래 **4조건**을 모두 만족시키면 구축을 멈춘다.

1. **시작 가능** — `./init.sh`로 깨끗이 부팅된다.
2. **검증된 테스트 존재** — `make check`가 녹색이고 최소 1개 E2E 스모크가 통과한다.
3. **문서** — `AGENTS.md`가 라우터로서 명령·완료정의·제약·지도를 담는다.
4. **정렬된 태스크** — `feature_list.json`이 우선순위와 함께 모두 `passes:false`로 준비됐다.

→ 이 시점에서 **`harness_engineering_rubric.md`로 채점**한다. 모든 HARD GATE가 PASS이고 카테고리 floor를 충족하며 overall ≥ 80(`READY`)이면 §5 코딩 루프를 시작한다. 아니면 결손 카테고리를 보강 후 재채점.

---

# 8. 출처 · 신뢰성 등급 (provenance)

규범 기준은 **Tier-1 1차 자료**로만 세웠고, 종합·운영 세부는 Tier-2로 보강했다. 저신뢰 재게시물은 규범 근거에서 제외.

**Tier-1 — 1차 자료 (최상 신뢰성)**
- **T1-A** Anthropic, *Effective harnesses for long-running agents* (Engineering, 2025-11-26) — initializer/coding 이중 구조(동일 하네스, 다른 첫 프롬프트), feature_list.json(JSON이 MD보다 덜 훼손), init.sh, progress 파일 + git, 세션 출근 루틴, E2E(브라우저 자동화) 필요성, clean state 정의.
- **T1-B** Anthropic, *Building Effective Agents* (2024-12) — 도구를 루프에서 쓰는 LLM, 단순성·투명성·ACI, 정지 조건·인간 체크포인트·샌드박스.
- **T1-C** Anthropic, *Effective Context Engineering for AI Agents* (2025-09) — 최소 고신호 토큰, 시스템 프롬프트 고도, compaction·노트테이킹·서브에이전트.
- **T1-D** AGENTS.md 오픈 표준 — agents.md (Linux Foundation 산하 Agentic AI Foundation 관리, 60,000+ 저장소) + ETH 취리히 연구(Gloaguen et al., 2026, arXiv 2601.20404; 138개 저장소): LLM 자동 생성 컨텍스트 파일은 성공률↓·비용 20%↑, "도구가 제약"·Context Anchoring(Pink Elephant)·명령 앞배치·고정 버전.
- **T1-E** OpenAI, *Harness engineering: leveraging Codex in an agent-first world* — 아키텍처 제약·저장소 로컬 지시·브라우저 검증·텔레메트리로 대규모 앱 구축(백만 줄 실험).

**Tier-2 — 종합·실무 자료 (보강)**
- **T2** WalkingLabs *Learn Harness Engineering* 강의(5개 하위 시스템·12강·산출물·체크리스트의 종합 출처) — 사용자가 제공한 다이제스트의 출처. LangChain(*Deep Agents* 평가/하네스), OpenHands(*Learning to Verify AI-Generated Code*), Thoughtworks(*Harness Engineering*), Inngest(*Your Agent Needs a Harness, Not a Framework*).

> 사용자 제공 다이제스트는 위 Tier-1을 종합한 T2 강의의 요약이며, 본 가이드는 그 구조(5 하위 시스템·산출물·체크리스트)를 채택하되 모든 규범 진술을 Tier-1 원문으로 검증·정정했다.

---

# 9. 주의 · 운용 노트

- 본 가이드는 **풀스택 웹앱**을 1차 대상으로 한 Tier-1 사례에 기반한다. 과학·금융 등 다른 도메인엔 검증 방식(E2E의 의미)을 도메인에 맞게 치환하라.
- **사람 큐레이션 우선** — 이 문서로 산출물을 만들되, 자동 생성물을 그대로 두지 말고 제품 사실로 다듬어라(T1-D).
- 모델이 강해질수록 일부 절차는 단순화된다. 정기 감사로 낡은 구성요소를 제거하고 `version`을 올려 관리하라.
- 구축 후에는 반드시 `harness_engineering_rubric.md`로 합격 여부를 판정한다 — 이 가이드는 "만드는 법", 루브릭은 "잘 만들었는가"다.
