---
doc_type: product_brief_authoring_guide
title: "PRODUCT_BRIEF 작성 가이드 (How to Write a PRODUCT_BRIEF)"
version: "1.0"
last_updated: "2026-06-01"
language: "ko (technical terms, keys, code in en)"
audience: "PRODUCT_BRIEF.md를 작성하려는 개발자, 또는 그를 돕는 AI"
produces: "PRODUCT_BRIEF.md   # 빌드 가이드와 루브릭이 소비하는 입력 산출물"
companion_docs:
  build_guide: "harness_build_guide.md            # 이 브리프를 읽어 하네스를 구축한다"
  acceptance_rubric: "harness_engineering_rubric.md  # 구축물의 합격 기준(게이트 G-*, 카테고리 A-H)"
  examples_optional: "harness_examples.md          # (선택) 모범 하네스 예시 레퍼런스"
purpose: >
  배포 가능한 하네스 엔지니어링 문서 세트의 일부. 특정 제품의 브리프를 동봉하는 대신,
  사용자가 자기 제품에 맞는 PRODUCT_BRIEF.md를 시스템과 호환되게 작성하도록 안내한다.
source_policy: "작성 규칙의 근거는 동봉 문서들의 Tier-1 원칙(§7)에서 가져왔다."
---

# 0. 이 가이드 사용법

`PRODUCT_BRIEF.md`는 하네스 문서 세트의 **입력**이다. 빌드 가이드(절차)와 루브릭(기준)이 이 브리프를 읽어 너의 제품에 맞는 하네스를 만들고 채점한다. 이 가이드는 그 브리프를 **어떻게 작성하는지** 안내한다.

세 문서의 역할(혼동 금지):

| 문서 | 답하는 질문 | 누가/언제 |
|------|-------------|-----------|
| **PRODUCT_BRIEF** (네가 작성) | "무엇을 만드는가" | 제품마다 1회, 작성 후 상시 입력 |
| BUILD_GUIDE | "어떻게 하네스를 만드는가" | INITIALIZER가 그린필드에서 1회 |
| RUBRIC | "이 하네스가 합격인가" | 매 검증 루프 |

두 가지 작성 경로:
- **(A) 직접 작성** — §2 템플릿을 복사하고 §3 지침대로 채운다.
- **(B) AI 보조** — AI가 §5 인터뷰 프로토콜로 질문하고 초안을 만든 뒤, 네가 검토·확정한다.

작성 내내 지킬 3원칙:
1. **측정 가능성** — "성공"은 실행 가능한 검증으로 적는다("빠르다" ✗ → "p95 < 300ms" ✓).
2. **최소 고신호** — 에이전트가 *스스로 발견할 수 없는* 사실만. 짧게.
3. **정직한 복잡도** — 제품이 단순하면 단순하다고 적어라(과설계 방지, `G-SIMPLE`).

---

# 1. 무엇을 넣고, 무엇을 빼는가 (브리프의 경계)

브리프의 가치는 **포함만큼 배제**에서 나온다. 잘못 넣으면 컨텍스트가 비대해지고 역할이 섞인다.

| 정보 | 넣는다 | 향하는 곳 / 이유 |
|------|:---:|------|
| 제품 목표 · **측정 가능한** 성공 기준 | ✓ | `feature_list.json`, 게이트 `G-EVAL` |
| 스택 · **고정 버전** · 실행/검증 명령 | ✓ | `AGENTS.md`, `init.sh`, `Makefile` |
| **비가역·고위험** 행동 목록 | ✓ | 가드레일, 게이트 `G-HITL` |
| 자율 수준 · 사용자 · 상호작용 | ✓ | HITL 배치, 투명성(A4) |
| 비기능 제약(지연·비용·규모·컴플라이언스) | ✓ | 카테고리 H |
| 현재 상태(그린필드/브라운필드) | ✓ | 빌드 시작점 |
| 대표 작업 예시 2–3개(정전) | ✓ | `feature_list` 시드 |
| ── 빼야 할 것 ── | | |
| 모범 하네스 **예시** | ✗ | `harness_examples.md`로. 브리프에 넣으면 앵커링·비대화 + 역할 혼동 |
| **도구가 강제하는 규칙**(린트·타입·CI) | ✗ | "도구가 곧 제약". 재기술은 신호를 희석한다 |
| 엣지케이스 **전수 나열** | ✗ | 대표 예시로 대체(few-shot 원칙) |
| 아키텍처 장문 개요 | ✗ 또는 최소 | 효과 낮음. 상세는 `docs/ARCHITECTURE.md`로 |

> 기준 한 줄: **"에이전트가 저장소만 보고 알 수 없는 제품 사실"만 브리프에 넣는다.**

---

# 2. 완성 템플릿 (복사용)

앞부분은 기계 판독 블록(빌드 가이드가 직접 소비), 뒷부분은 서술 섹션이다. 각 항목의 작성법은 §3 참조.

````markdown
---
doc_type: product_brief
title: "<Product Name> — Product Brief"
version: "0.1"
companion_docs:
  build_guide: harness_build_guide.md
  acceptance_rubric: harness_engineering_rubric.md
target_rubric_status: READY        # READY(≥80) | ROBUST(≥90) — 루프의 목표치
---

# ── machine-readable facts (빌드 가이드가 직접 소비) ──
```yaml
stack:                              # → AGENTS.md, init.sh
  runtime: ""                       #   예: "Python 3.12"
  framework: ""                     #   예: "FastAPI 0.115"
  package_manager: ""               #   예: "uv"
commands:                           # → Makefile, init.sh, 게이트 G-EVAL
  install: ""                       #   예: "uv sync"
  start: ""                         #   예: "uv run uvicorn app:app --reload"
  verify: ""                        #   예: "make check"  (lint+types+test)
  e2e: ""                           #   예: "pytest tests/e2e"
autonomy_level: ""                  # low | medium | high  → HITL 배치 (G-HITL)
irreversible_actions: []            # → 가드레일 (G-HITL). 예: ["결제 청구","프로덕션 DB 삭제","외부 이메일 발송","배포"]
domain_risk: ""                     # low | regulated(finance/health/...)  → 안전 가중
complexity: ""                      # simple | moderate | complex  → G-SIMPLE
```

## 1. 목표 & 성공 기준        # → feature_list, G-EVAL
- 한 문장 목표: <이 제품이 하는 일>
- 측정 가능한 성공 기준:
  - <예: 새 채팅 생성→응답까지 5단계 E2E 통과>
  - <예: p95 응답 < 300ms>
- 실패/불가 기준(무엇이 일어나면 안 되나): <...>

## 2. 대표 작업 예시 (2–3개, 정전)   # → feature_list 시드. 엣지케이스 나열 금지
1. <가장 흔한 핵심 흐름>
2. <대표적 변형 1개>

## 3. 액션 · 환경            # → Tools/Environment, G-SANDBOX
- 닿는 시스템/데이터: <DB·외부 API·파일시스템·민감 데이터>
- 실행 환경: <로컬·컨테이너·CI / 샌드박스 제약>

## 4. 사용자 · 상호작용      # → HITL, 투명성
- 사용자: <기술/비기술>
- 형태: <단발 | 다중 세션 장기 작업>

## 5. 비기능 제약            # → 카테고리 H
- 지연: <실시간 | 배치>   · 비용/토큰 예산: <...>   · 규모: <...>   · 컴플라이언스: <...>

## 6. 리스크 프로파일        # → 카테고리 E·D
- 실수의 파급 범위: <...>
- 알려진 실패 모드: <...>
- 비신뢰 입력(웹·파일·사용자) 노출: <yes/no>

## 7. 현재 상태             # → 빌드 시작점
- 그린필드 / 브라운필드: <...>   · 기존 스택·코드·이전 eval: <...>
````

---

# 3. 섹션별 작성 지침 (이 가이드의 핵심)

각 항목을 **무엇을 / 왜 / 좋은 예 vs 나쁜 예**로 안내한다.

**`stack` (고정 버전)** — *왜:* 버전을 안 적으면 에이전트는 학습데이터에서 가장 흔한 관행을 기본값으로 쓴다. *나쁨:* `"Python, React"` · *좋음:* `"Python 3.12 / Next.js 15 / pnpm"`.

**`commands`** — *왜:* `verify`는 게이트 `G-EVAL`의 합·불 판정과 `make check`로 직결된다. *나쁨:* `verify: "테스트 돌린다"`(실행 불가 서술) · *좋음:* `verify: "make check"` 또는 `"pnpm test && pnpm typecheck && pnpm lint"`. `e2e`도 반드시 실행 가능한 명령으로.

**`autonomy_level`** — *왜:* HITL 체크포인트 위치를 정한다. *기준:* `low`=모든 쓰기 행동 인간 승인 / `medium`=비가역 행동만 승인 / `high`=샌드박스 내 자율, 게이트만 통과.

**`irreversible_actions`** — *왜:* 게이트 `G-HITL`은 *네가 위험 행동을 알려줘야* 채점된다. AI는 네 파급 범위를 추론할 수 없다. *나쁨:* `[]`(비움) · *좋음:* `["결제 청구","프로덕션 DB 레코드 삭제","외부 이메일 발송","배포"]`. 하나라도 있으면 빈칸으로 두지 말 것.

**`domain_risk` / `complexity`** — *왜:* 안전 가중과 `G-SIMPLE`을 조정한다. `complexity`를 생략하면 AI가 정교한 루브릭을 보고 **과설계**한다. *좋음:* `complexity: "simple"`("CRUD + 인증, 단일 서비스") 또는 `"complex"`("다중 서비스 + 실시간 + 결제").

**1. 목표 & 성공 기준** — *왜:* 루프의 정지 타깃이자 `feature_list` 생성의 근거. *나쁨:* "앱이 빠르고 사용자가 만족한다" · *좋음:* "로그인 성공률 > 99.5%", "새 채팅 흐름 5단계가 E2E 통과". **측정 불가능하면 다시 써라.**

**2. 대표 작업 예시** — *왜:* LLM에게 예시는 강한 신호지만, 많이 넣으면 앵커링과 비대화를 부른다. *나쁨:* 엣지케이스 50개 나열 · *좋음:* 핵심 흐름 1개 + 대표 변형 1개 = 2–3개 정전 예시.

**3. 액션·환경** — 민감 데이터·외부 부수효과를 명시하면 빌드 가이드가 샌드박스/권한(`G-SANDBOX`, E5)을 정확히 세운다.

**6. 리스크 프로파일** — 비신뢰 입력에 노출되면 빌드 가이드가 프롬프트 인젝션 방어(E4)를 추가한다. 알려진 실패 모드는 진단 루프(BUILD_GUIDE §6)의 출발점이 된다.

---

# 4. 완료 체크리스트 (브리프를 넘기기 전에)

다음을 모두 만족하면 브리프가 준비된 것이다.

- [ ] 모든 성공 기준이 **측정 가능**하다(실행 가능한 검증/지표).
- [ ] `commands.verify`와 `e2e`가 **실행 가능한 명령**이다.
- [ ] `stack`의 **버전이 고정**돼 있다.
- [ ] `irreversible_actions`가 채워졌다(없으면 명시적으로 "none").
- [ ] `complexity`와 `domain_risk`가 **정직하게** 적혔다.
- [ ] 대표 예시가 **2–3개**다(엣지케이스 덤프 아님).
- [ ] 도구가 강제하는 규칙(린트·타입·CI)을 **재기술하지 않았다**.
- [ ] 모범 하네스 예시를 브리프에 **넣지 않았다**(→ `harness_examples.md`).
- [ ] `target_rubric_status`(READY/ROBUST)를 정했다.

---

# 5. AI 보조 작성 프로토콜 (AI가 도울 때)

AI가 브리프 작성을 도울 경우 다음 루프를 따른다.

**인터뷰 질문** (모호한 답은 측정 가능해질 때까지 되묻는다):
1. 한 문장으로, 이 제품은 무엇을 하나?
2. "완료/성공"을 **무엇으로 측정**하나? (지표·검증으로 답하게 유도)
3. 스택과 버전은? 설치·실행·검증·E2E 명령은?
4. 어떤 행동이 **비가역·고위험**인가?
5. 누가 쓰고, 단발인가 장기인가? 자율을 어디까지 허용하나?
6. 지연·비용·규모·컴플라이언스 제약은?
7. 그린필드인가, 기존 코드/스택이 있나?
8. 솔직히, 이건 단순한가 복잡한가?

**루프:** 인터뷰 → §2 템플릿으로 초안 작성 → 사용자 검토(§4 체크리스트로 측정 가능성·위험 누락 점검) → 확정.

⚠️ **사람이 큐레이션하라.** LLM이 완전 자동으로 생성한 컨텍스트 파일은 작업 성공률을 낮추고 비용을 올린다는 연구가 있다(§7 T-D). AI는 초안만, 최종 판단은 사람이.

---

# 6. 안티패턴 (이런 브리프는 실패한다)

- **모호한 목표** — "좋은 앱"처럼 검증 불가. → 측정 가능한 기준으로.
- **기능 덤프** — 수십 개 엣지케이스 나열로 컨텍스트 폭증·앵커링. → 정전 예시 2–3개.
- **위험 행동 누락** — `irreversible_actions` 비움 → `G-HITL` 무력화. → 반드시 열거.
- **도구 규칙 재기술** — 린터가 잡는 규칙을 또 적어 신호 희석. → 생략(도구가 제약).
- **예시 하네스 오염** — 모범 하네스를 브리프에 붙여 역할 혼동·비대화. → 별도 레퍼런스로.
- **복잡도 침묵** — 단순 제품인데 안 적어 AI가 과설계. → `complexity` 명시.

---

# 7. 출처 · 일관성 노트

이 작성 규칙들은 동봉 문서 세트가 따르는 Tier-1 원칙에서 나왔다.
- **T-A** Anthropic, *Effective harnesses for long-running agents* — feature_list가 성공 기준을 정의, 기계 검증 가능한 완료, init.sh/실행 명령.
- **T-B** Anthropic, *Effective Context Engineering for AI Agents* — 최소 고신호 토큰, few-shot은 정전 예시로(엣지케이스 덤프 금지).
- **T-C** Anthropic, *Building Effective Agents* — 단순성(`G-SIMPLE`), 비가역 행동 전 인간 체크포인트(`G-HITL`).
- **T-D** AGENTS.md 오픈 표준 + ETH 취리히 연구(Gloaguen et al., 2026) — "도구가 곧 제약", 고정 버전, 사람 큐레이션(LLM 자동 생성 컨텍스트 파일은 성공률↓·비용 20%↑), Context Anchoring 회피.

이 가이드는 위 문서들과 동일한 front-matter 관례·ID 교차참조(`G-*`, `A-H`, Phase)·한국어+영문키 스타일을 따른다. 산출물 `PRODUCT_BRIEF.md`는 `harness_build_guide.md`가 입력으로 참조한다.
