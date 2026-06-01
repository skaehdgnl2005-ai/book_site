---
doc_type: harness_examples_reference
title: "하네스 예시 레퍼런스 (Good Harnesses & Why)"
version: "1.0"
last_updated: "2026-06-01"
language: "ko (technical terms, keys, code in en)"
consumer: "harness-building AI agent + 사람 학습자"
usage: progressive_disclosure   # §1 DNA 요약은 항상, §3 7개 심화는 온디맨드
companion_docs:
  build_guide: "harness_build_guide.md            # 이 레퍼런스를 온디맨드로 링크 참조"
  acceptance_rubric: "harness_engineering_rubric.md  # 게이트 G-*, 카테고리 A-H"
  product_brief_guide: "product_brief_guide.md     # 입력(PRODUCT_BRIEF) 작성 가이드"
purpose: >
  검증된 우수 코딩-에이전트 하네스의 구조·핵심 패턴·"좋은 이유"를 한 문서에 압축한 레퍼런스.
  각 저장소를 직접 열지 않고도 핵심을 파악하게 한다. 빌드 가이드가 필요할 때 참조한다.
  목적은 복제가 아니라 패턴 추출이다(§0).
scope: "에이전트(코딩) 하네스. 평가 하네스(lm-evaluation-harness·SWE-bench)는 별도 범주."
source_policy: "저장소·수치는 2026-06 기준 검증. 변동성 큰 값(버전·org·API)은 링크에서 재확인."
---

# 0. 사용 지침 (consumption guide) — AI가 가장 먼저 읽을 것

이건 **레퍼런스 라이브러리**다. 통째로 컨텍스트에 싣지 마라(분량 자체가 앵커링·토큰 낭비를 부른다).

- **항상 내재화:** §1 **공통 DNA 체크리스트** — 이 문서의 정식 고신호 요약(약 한 화면).
- **온디맨드로만:** §3 개별 심화 7개 — *지금 필요한 패턴 하나*만 펼쳐 본다.
- **세트 결속:** §2 매핑으로 각 DNA를 루브릭 게이트/카테고리·빌드 가이드 5개 하위 시스템과 연결한다.
- **대조 학습:** §4 안티패턴 — "왜 실패하나"가 "왜 좋은가"만큼 가르친다.

> ⚠️ **ADAPT, DON'T CLONE.** 특정 하네스의 스택·파일 구조·기능 형태를 베끼지 마라. 추출 대상은 *패턴*이지 인스턴스가 아니다. 예시의 구체값(예: tree-sitter·PageRank·Electron)이 컨텍스트에 떠 있으면 모델이 그쪽으로 끌린다(Context Anchoring). 너의 `PRODUCT_BRIEF`에 맞게 패턴만 가져와라.

**빌드 중 흐름:** PRODUCT_BRIEF로 *무엇을* 만들지 정함 → 이 DNA로 *어떤 패턴*을 쓸지 선택 → BUILD_GUIDE로 *구축* → RUBRIC로 *채점*.

> 코드 블록은 원본 그대로가 아니라 **핵심 제어 흐름만 단순화한 의사코드**다. 정확한 구현·최신 상태는 각 링크에서 확인.

---

# 1. 우수한 하네스의 공통 DNA (= 이 문서의 정식 고신호 요약)

7개 사례를 관통하는 설계 척추. **AI는 이 10개만 항상 내재화하고**, 세부가 필요하면 괄호의 사례를 §3에서 펼쳐 본다.

1. **에이전트 루프 골격** — *컨텍스트 수집 → 행동 → 검증 → 반복.* (전 사례 공통; Claude SDK가 가장 명시적)
2. **컨텍스트 엔지니어링** — 토큰 예산 의식(Aider PageRank), 관찰 압축·접기(SWE-agent), 서브에이전트 격리(Claude SDK·goose·OpenHands).
3. **도구·인터페이스 설계** — LM 전용 ACI(SWE-agent) vs 코드 액션(smolagents) vs bash-only(mini). *모델 역량에 맞춰* 선택.
4. **경계 있는 I/O** — 모든 출력의 크기·형태 제한(SWE-agent: 무제한 cat·grep 금지).
5. **가드레일·자기 교정** — lint-on-edit·문법 사전검사(SWE-agent), 권한·injection 탐지·adversary reviewer(goose), 실패 롤백(Aider git).
6. **상태·재현성** — 런타임이 상태 소유(SWE-agent 커서), 이벤트 소싱으로 트레이스 보존(OpenHands) → 리플레이·디버깅.
7. **샌드박싱** — Docker·E2B 등으로 임의 코드 실행을 안전 격리(OpenHands·smolagents·mini).
8. **확장성·표준** — MCP(goose·Claude SDK), 모델 무관 litellm(mini·smolagents), 플러그인 → 락인 회피.
9. **적정 복잡도** — *복잡도는 비용*(mini-swe-agent). 모델이 좋아질수록 덜어낼 부분을 점검.
10. **관측성** — OpenTelemetry·trajectory 저장(smolagents·mini)으로 행동을 검사 가능하게.

---

# 2. DNA ↔ 시스템 매핑 (세트 결속)

각 DNA가 루브릭의 무엇을 충족하고 빌드 가이드의 어느 하위 시스템에 속하는지.

| DNA | RUBRIC 게이트·카테고리 | BUILD_GUIDE 하위 시스템 |
|-----|------------------------|--------------------------|
| 1 루프 골격 | `G-GROUND`·`G-TERM` · A | Feedback/State (루프) |
| 2 컨텍스트 | C | Instructions/State |
| 3 도구·인터페이스 | B | Tools |
| 4 경계 I/O | B3 | Tools |
| 5 가드레일·자기교정 | E · D | Tools/Feedback |
| 6 상태·재현성 | F · A | State |
| 7 샌드박싱 | `G-SANDBOX` · E2 | Environment |
| 8 확장성·표준 | B1 | Tools/Environment |
| 9 적정 복잡도 | M1 · `G-SIMPLE` | (전반) |
| 10 관측성 | `G-TRACE` · H | Feedback |

---

# 3. 심화: 7개 우수 사례 (온디맨드 참조)

## 3.0 한눈에 비교

| # | 프로젝트 | 언어 | 핵심 파일 | 이 사례에서 배울 핵심 |
|---|----------|------|-----------|----------------------|
| 1 | **SWE-agent** | Python | `sweagent/agent/agents.py`, `config/*.yaml` | LM 전용 인터페이스(ACI)를 *config로* 설계 |
| 2 | **mini-swe-agent** | Python | `agents/default.py` (~100줄) | 적정 복잡도 / 프롬프트=에이전트 |
| 3 | **OpenHands** | Python | `controller/agent_controller.py`, `events/` | 이벤트 스트림 + 멀티 에이전트 |
| 4 | **Aider** | Python | `repomap.py`, `coders/` | 컨텍스트 엔지니어링(PageRank) |
| 5 | **smolagents** | Python | `agents.py`, `local_python_executor.py` | 코드-as-액션 |
| 6 | **goose** | Rust | `crates/goose/` | MCP 확장성 / 가드레일 / 거버넌스 |
| 7 | **Claude Agent SDK** | Python·TS | `query()` 진입점 | 투명한 루프 / 서브에이전트 격리 |

---

## 3.1 SWE-agent — LM을 위한 인터페이스를 *config로* 설계

- **GitHub:** <https://github.com/SWE-agent/SWE-agent> · **문서:** <https://swe-agent.com> · **논문:** arXiv 2405.15793 (NeurIPS 2024)

### 저장소 구조 (핵심)
```
SWE-agent/
├─ sweagent/
│  ├─ agent/
│  │  ├─ agents.py             # 에이전트 루프 (DefaultAgent)
│  │  ├─ models.py             # LM 추상화
│  │  ├─ history_processors.py # ★ 컨텍스트 관리(관찰 접기·에러 정리)
│  │  ├─ reviewer.py           # 결과 검토 / 재시도
│  │  └─ hooks/                # 라이프사이클 훅
│  ├─ environment/
│  │  ├─ swe_env.py            # SWEEnv: 샌드박스(SWE-ReX)와 통신
│  │  └─ repo.py               # 대상 레포 준비
│  └─ tools/                   # ★ ACI = 명령어 "번들"
│     ├─ bundle.py  commands.py  parsing.py
└─ config/                     # ★ YAML로 ACI·프롬프트를 정의(코드 수정 없이 교체)
   ├─ default.yaml             # 기본 ACI + 프롬프트
   ├─ bash_only.yaml           # 도구 없이 bash만 (대조군)
   └─ benchmarks/ …
```

### 핵심 패턴
도구(ACI 명령어)는 코드가 아니라 **config의 번들**로 주입되고, 컨텍스트는 **history processor**가 관리합니다.
```python
# agents.py 루프 (단순화)
while not done:
    thought, action = model.query(history)   # 응답 = THOUGHT + 단일 명령
    if not valid_format(action):              # 형식 오류 → 재시도 요청(첫 에러만 보존)
        history.append(format_error); continue
    obs = env.execute(action)                 # 샌드박스에서 실행
    obs = history_processors(obs)             # 오래된 관찰은 한 줄로 접기 등
    history.append(obs)
    done = is_submit(action)
```

### 우수한 이유
- **핵심 통찰:** LM은 사람과 다른 새로운 사용자 → *LM용으로 설계된 인터페이스*가 필요. 같은 모델이 raw bash 대비 ACI로 약 **2배** 성능(논문 ablation).
- **경계 있는 출력:** "파일 전체 cat·무제한 grep" 금지 — 출력 크기·형태 제한.
- **지속 상태:** 런타임이 커서(`CURRENT_FILE`)를 소유 → "내가 어디 있지"를 히스토리에서 재구성 불필요.
- **가드레일:** 편집 시 linter 실패면 적용 차단, bash는 `bash -n` 사전 검사.
- 코딩 에이전트 분야에서 *가장 많이 모방된* 아이디어의 원조.

---

## 3.2 mini-swe-agent — 근본적 단순함 (이게 전부입니다)

- **GitHub:** <https://github.com/SWE-agent/mini-swe-agent> — 같은 Princeton·Stanford 팀, SWE-bench Verified **>74%**

### 저장소 구조 (핵심)
```
mini-swe-agent/src/minisweagent/
├─ __init__.py          # ★ Protocol 3개: Agent / Model / Environment (덕 타이핑)
├─ agents/
│  ├─ default.py        # ★ 핵심 에이전트 (~100줄)
│  └─ interactive.py    # 사람 개입형
├─ models/              # litellm / openrouter / portkey … (모델 무관)
│  └─ utils/actions_*.py# 액션 파싱: 텍스트(정규식) vs toolcall
├─ environments/        # local / docker / singularity / bubblewrap …
├─ config/              # ★ "프롬프트가 곧 에이전트": default.yaml, mini.yaml …
└─ run/                 # mini(대화형), benchmarks/swebench.py …
```

### 3개의 Protocol — 전부 덕 타이핑이라 어느 부품이든 교체 가능
```python
class Model(Protocol):        # query(messages)->dict, format_observation_messages(...)
class Environment(Protocol):  # execute(action, cwd="")->dict   ← 매 액션 = 새 subshell
class Agent(Protocol):        # run(task)->dict, save(path)
```

### 핵심 루프 (`default.py` 단순화)
```python
def run(self, task):
    self.messages = [system(render(system_template)),
                     user(render(instance_template, task=task))]
    while True:
        try:
            self.step()                          # = execute_actions(query())
        except InterruptAgentFlow as e:          # 형식오류·한도 등 → 메시지 추가 후 계속
            self.add_messages(*e.messages)
        finally:
            self.save(output_path)               # 매 스텝 trajectory 저장
        if self.messages[-1]["role"] == "exit":  # 종료 신호 받으면 중단
            break

def step(self):                                  # 모델 호출 → 액션 실행
    msg = self.model.query(self.messages)        # query()가 step/cost/walltime 한도 검사
    outputs = [self.env.execute(a) for a in msg["extra"]["actions"]]
    self.add_messages(*self.model.format_observation_messages(msg, outputs))
```

### 액션 형식 — 도구 없이, 응답에서 단 하나의 bash 블록을 정규식으로 추출
````
THOUGHT: 왜 이 행동을 하는지 설명...

```bash
your_command_here
```
````
- **정확히 1개**의 액션만 허용(아니면 `FormatError`로 재시도). 종료는 `echo COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT`.
- 각 명령은 **새 subshell**에서 실행(상태 비영속) → 매번 `VAR=v cd /path && …`로 컨텍스트 지정.
- 한도: `cost_limit`(기본 $3) · `step_limit` · `wall_time_limit_seconds`.

### 우수한 이유
- **반대 명제:** SWE-agent가 강조하던 특수 도구·인터페이스 대부분이, 모델이 강력해지자 *불필요*해졌음을 입증. 도구는 bash 하나, tool-calling 인터페이스조차 안 씀 → **어떤 모델로도** 실행.
- **모델 중심주의:** scaffold가 아니라 LM이 주인공 → 모델 비교용 *이상적 baseline*("bash-only" 리더보드).
- **해킹 가능성:** 블랙박스가 아니라 읽고 고칠 수 있는 도구. Meta·NVIDIA·IBM 채택.
- **교훈:** 복잡도는 비용이다 — *덜어내는* 것도 엔지니어링이다.

---

## 3.3 OpenHands — 이벤트 스트림 아키텍처의 교과서

- **GitHub:** <https://github.com/All-Hands-AI/OpenHands> (구 OpenDevin) · **문서:** <https://docs.openhands.dev> · **논문:** arXiv 2407.16741 (ICLR 2025)

### 저장소 구조 (V0 기준 핵심)
```
OpenHands/openhands/
├─ agenthub/            # ★ 에이전트 구현 모음 (기본 codeact_agent)
│  └─ codeact_agent/
├─ controller/
│  └─ agent_controller.py  # ★ 루프: step(State) -> Action
├─ events/              # ★ Action / Observation 타입 + EventStream(pub/sub)
├─ runtime/             # Docker 샌드박스: Action -> Observation 실행
├─ server/              # 웹서버 / 세션
└─ memory/              # 이벤트 영속화 → 리플레이 / 메모리 검색
# (V1 리팩터링: sdk / tool / workspace 패키지로 모듈화, opt-in 샌드박싱)
```

### 핵심 추상화
```python
class Agent:                              # 한 단계씩 전진
    def step(self, state: State) -> Action: ...   # LLM 호출 → Action 파싱

# 모든 상호작용이 "이벤트"로 흐른다:
# User → Agent → LLM → Action → Runtime(sandbox) → Observation → Agent → …
#   Action 예: CmdRunAction, FileWriteAction, IPythonRunCellAction, BrowseURLAction
#   State   : event stream(히스토리) + 누적 비용 + 위임 메타데이터
```

### 우수한 이유
- **명확한 추상화**(`Action`/`Observation`/`State`/`EventStream`)로 확장성·재현성 동시 확보.
- **이벤트 소싱**으로 전체 실행 트레이스 영속화 → 리플레이·관측성·메모리 검색이 일급 기능.
- **멀티 에이전트 위임:** CodeActAgent → BrowsingAgent / RepoStudyAgent / VerifierAgent.
- **샌드박스 런타임**(보안·일관성·리소스 제어). MIT, 수백 기여자.
- V0→V1 재설계 사례 자체가 *"하네스가 모델·생태계(tool use, MCP) 발전을 못 따라가면 재설계가 필요"* 라는 교훈.

---

## 3.4 Aider — 컨텍스트 엔지니어링의 정수

- **GitHub:** <https://github.com/Aider-AI/aider> · **문서:** <https://aider.chat> · **필독:** <https://aider.chat/2023/10/22/repomap.html>

### 저장소 구조 (핵심)
```
aider/
├─ coders/                 # ★ chat→edit→commit 루프; edit format별 서브클래스
│  ├─ base_coder.py        # 컨텍스트 조립 + LLM 통신 + git
│  ├─ editblock_coder.py  wholefile_coder.py  udiff_coder.py …
├─ repomap.py              # ★ tree-sitter + PageRank repo map
├─ queries/                # 언어별 tags.scm (def/ref 추출 규칙)
├─ models.py               # 모델별 설정 / edit format 매핑
└─ commands.py             # /add, /drop 등
```

### repo map 파이프라인 (`repomap.py` 핵심)
```python
def get_repo_map(chat_files, other_files):
    tags = get_ranked_tags(chat_files, other_files)
    return to_tree(binary_search_fit(tags, map_tokens))   # 토큰예산에 이진탐색으로 맞춤

def get_ranked_tags(chat_files, other_files):
    for f in all_files:                                   # tree-sitter로 def/ref 추출
        for tag in parse(f, tags_scm[lang(f)]):           # Tag(file,line,name,kind=def|ref)
            graph.add_node(def→file); graph.add_edge(ref→def_file)
    boost(edge, x10) if name in user_mentioned_identifiers # 휴리스틱 가중치
    return networkx.pagerank(graph, personalization=chat_files)  # 관련도 랭킹
```
- **랭킹 통찰:** *20곳에서 호출되는 함수가 1번만 호출되는 헬퍼보다 더 가치 있는 컨텍스트* → 결정적·안정적.
- 출력은 `grep_ast.TreeContext`로 정의 + 상위 스코프만 보이고 나머지 줄은 생략.
- `Tag = (rel_fname, fname, line, name, kind)`. mtime 키로 SQLite 캐시.
- `Coder`가 모델 역량에 맞는 edit format 선택 → 응답 파싱 → 적용 → lint → git 자동 커밋.

### 우수한 이유
- 컨텍스트 한계를 "전부 넣기"가 아니라 **"가장 중요한 구조만"** 으로 — 토큰 예산을 의식적으로 관리.
- git 통합으로 안전한 되돌리기, lint 루프로 자기 교정. 60~100여 개 언어.
- 단일 프로세스·빌드/데몬 없음. 수많은 후속 프로젝트가 repo map을 모방.

---

## 3.5 smolagents — 코드를 액션 언어로

- **GitHub:** <https://github.com/huggingface/smolagents> · **문서:** <https://huggingface.co/docs/smolagents> · **근거:** *Executable Code Actions Elicit Better LLM Agents*(CodeAct)

### 저장소 구조 (핵심)
```
smolagents/src/smolagents/
├─ agents.py                 # ★ MultiStepAgent(base) / CodeAgent / ToolCallingAgent
├─ local_python_executor.py  # 제한된 파이썬 인터프리터 (보안 경계 아님 — 명시)
├─ remote_executors.py       # E2B / Modal / Blaxel / Docker 샌드박스
├─ tools.py  default_tools.py
├─ memory.py  monitoring.py  # 실행 로그 + OpenTelemetry
└─ models.py                 # litellm 등 모델 무관
```

### 핵심 패턴 (ReAct — 단, 액션이 "코드")
```python
# CodeAgent.run() 단순화
while not final_answer:
    code   = model.generate(memory)        # LLM이 파이썬 "코드"를 액션으로 출력
    code   = parse_code_block(code)         # ```py … ``` 추출(구조화 출력 시 100% 신뢰성)
    result = python_executor(code, tools)   # 샌드박스 실행; tools는 함수로 노출
    memory.append(code, result)             # 변수·객체가 다음 스텝에 살아있음
```

### 우수한 이유
- **효율:** JSON 도구호출 대비 *약 30% 적은 스텝*(=적은 LLM 호출), 어려운 벤치마크에서 더 높은 성능.
- **합성성:** 함수 중첩·루프·조건문·객체 관리를 *한 번의 액션*으로. LLM은 방대한 코드로 학습됨.
- **최소 추상화**(raw code 위 얇은 레이어, 핵심 ~1,000줄) + **보안을 일급 시민으로**(샌드박스 + 내장 실행기 한계 명시).
- 설계 선택지를 명시적으로 제공: `CodeAgent`(코드) vs `ToolCallingAgent`(JSON).

---

## 3.6 goose — MCP 확장성 · 가드레일 · 오픈 거버넌스

- **GitHub:** <https://github.com/aaif-goose/goose> (구 `block/goose` → 301 리다이렉트) · **문서:** <https://goose-docs.ai>

### 저장소 구조 (Cargo 워크스페이스 + Electron)
```
goose/
├─ crates/
│  ├─ goose/            # ★ 코어: 에이전트 루프 + provider 추상화 + MCP 클라이언트
│  ├─ goose-mcp/        # 내장 MCP 익스텐션(서버)들
│  ├─ goose-cli/        # 터미널 인터페이스
│  ├─ goose-server/     # API (데스크톱 백엔드, OpenAPI)
│  ├─ goose-sdk/        # 임베딩용 SDK
│  └─ goose-acp-macros/ # ACP(Agent Client Protocol) 지원
└─ ui/desktop/          # TypeScript/Electron 데스크톱 앱
```

### 핵심 패턴
```text
task → plan → (extension/MCP 도구 선택) → execute → evaluate → loop until done
─ Provider 추상화 : 15+ LLM을 키 교체만으로 스왑(Anthropic/OpenAI/Gemini/Ollama…)
─ 모든 도구 = MCP 서버(70+) : 도구마다 맞춤 통합 불필요
─ Lead-Worker     : 역할별 모델(plan/execute/review) + 병렬 subagent
─ 가드레일        : prompt-injection 탐지 · tool permission · sandbox 모드 · adversary reviewer
─ CUSTOM_DISTROS  : 팀용 배포본(허용 provider·익스텐션·정책 사전구성)
```

### 우수한 이유
- **MCP 일급 통합**(레퍼런스 구현급) → 표준 인터페이스로 무한 확장.
- **보안 가드레일을 내장**(injection 탐지 / 권한 / sandbox / 위험 액션 감시자).
- **프로덕션 성숙도**(Block 내부 도구 출신) + **오픈 거버넌스**(Apache 2.0). goose는 Block이 **AAIF(Agentic AI Foundation)** 에 기여한 창립 프로젝트다 — AAIF는 Linux Foundation 산하로 2025년 12월 결성됐고, 창립 기여 프로젝트는 **Anthropic의 MCP · Block의 goose · OpenAI의 AGENTS.md**다. → 벤더 락인 없음.

---

## 3.7 Claude Agent SDK — 검증된 하네스를 라이브러리로

- **공식 문서:** <https://code.claude.com/docs/en/agent-sdk/overview> (Python·TypeScript) · 구 *Claude Code SDK*에서 **2025년 9월경 개명** · 패키지: `claude-agent-sdk`(Python) / `@anthropic-ai/claude-agent-sdk`(TS)

### 구조 / 사용 (패키지·옵션 타입은 공식 문서 대조 완료; 전체 옵션 집합은 문서에서 확인)
```python
# 핵심 진입점 query(): 프롬프트 + 옵션 → typed 메시지를 스트리밍
from claude_agent_sdk import query, ClaudeAgentOptions

async for message in query(
    prompt="...",
    options=ClaudeAgentOptions(
        allowed_tools=["Read", "Bash", "Edit", "Agent"],  # 내장 도구; Agent=서브에이전트
        permission_mode="...",        # 권한·훅으로 자율성 제어
        mcp_servers={...},            # MCP 확장
        agents={...},                 # 서브에이전트 정의(격리된 컨텍스트)
        setting_sources=None,         # 기본 None = 호스트 설정 미로딩(CI/멀티테넌트 안전)
    ),
):
    ...
```

### 핵심 패턴
- 루프 = **gather context → take action → verify → repeat**. chains/pipelines처럼 추상화로 *숨기지 않고* 개발자가 루프를 직접 보고 제어.
- 설계 철학: "프롬프트가 아니라 *컴퓨터를 준다*" — 터미널·파일시스템·웹 접근 런타임 + 내장 도구.
- **서브에이전트:** 별도 컨텍스트 윈도우에서 실행, 중간 도구 호출·결과는 격리되고 *최종 결과만* 부모로 반환.

### 우수한 이유
- Claude Code와 **같은 하네스**를 그대로 사용·확장 → 가장 직접적으로 실행 가능한 레퍼런스.
- **투명한 루프**(디버깅·제어 용이) + **컨텍스트 격리**(장기 작업 안정성) + **보수적 기본값**(권한·설정 미로딩).

---

# 4. 안티패턴 — 나쁜 하네스 & 왜 실패하나

"왜 좋은가"의 대조군. 각 안티패턴은 **5개 하위 시스템 중 일부의 결여**이며, 특정 게이트를 위반한다. 교정 칸은 위 사례 중 올바른 방식을 가리킨다.

| 안티패턴 | 무엇인가 | 왜 실패하나 | 위반 | 교정 (대조 사례) |
|----------|----------|-------------|------|-------------------|
| **프롬프트 ≠ 하네스** | 긴 시스템 프롬프트/지시 파일 하나가 전부. 도구·검증·상태·샌드박스 없음. | 5개 하위 시스템 중 Instructions 1개만 존재. 검증이 없어 거짓 완료, 상태가 없어 세션 간 연속성 상실. (mini조차 실제 루프+종료신호+한도가 있다.) | `G-EVAL`·`G-GROUND`·A1 | §3.2 mini, §3.7 Claude SDK |
| **거대 단일 AGENTS.md** | 모든 규칙·아키텍처·엣지케이스를 600줄+ 한 파일에 적재. | Lost-in-the-Middle로 우선순위 희석, 토큰 낭비, 유지보수 부패. 연구: 과적재 컨텍스트는 성공률↓·비용 20%↑. 린터가 강제하는 규칙까지 적어 신호 희석(도구가 제약). | C1·C2 | §3.4 Aider(중요 구조만), BUILD_GUIDE 라우터(50–200줄) |
| **검증 없는 거짓 완료** | 작업자가 단위 테스트만 통과시키고 스스로 "완료" 선언. 독립 검토·E2E 없음. | 에이전트는 자기 작업을 과신(학생이 자기 시험 채점). 단위 통과해도 경계 결함(IPC·경로·누수)으로 E2E 실패. | `G-EVAL`·G3/G5(worker≠checker) | §3.3 OpenHands(VerifierAgent), §3.6 goose(adversary reviewer) |
| **무샌드박스 임의 실행** | 임의 코드/명령을 호스트에서 직접 실행. 권한 경계·격리 없음. | 비가역 피해·보안 노출. 한 번의 잘못된 명령이 복구 불가 상태를 만든다. | `G-SANDBOX`·E2 | §3.1 SWE-agent(SWE-ReX), §3.3 OpenHands·§3.5 smolagents(Docker/E2B) |

> 공통 진단: 안티패턴은 거의 항상 **피드백 또는 상태 서브시스템의 결여**다. 실패 시 모델을 의심하지 말고 *어느 하위 시스템이 비었는지*부터 본다(BUILD_GUIDE §6 진단 루프).

---

# 5. 심화 학습 — 메타 자료 & 개념 글

큐레이션 리스트(주기적 갱신; 링크 정상 확인 2026-06):
- awesome-harness-engineering — <https://github.com/ai-boost/awesome-harness-engineering>
- awesome-agent-harness (용어 정의 + OpenAI 블로그 인용) — <https://github.com/AutoJunjie/awesome-agent-harness>
- awesome-agent-harness (프로젝트·벤치마크) — <https://github.com/Picrew/awesome-agent-harness>
- best-of-Agent-Harnesses (100+ 주간 랭킹) — <https://github.com/RyanAlberts/best-of-Agent-Harnesses>

핵심 개념 글(위 리스트들이 함께 링크):
- OpenAI — *Harness Engineering* (용어 정의)
- Anthropic — *Building Effective AI Agents* / *Writing effective tools for AI agents* / *Effective harnesses for long-running agents*

---

# 6. 출처 · 신뢰성 등급

- **사례 7종** — 모두 실재하는 공개 저장소(SWE-agent, mini-swe-agent, OpenHands, Aider, smolagents, goose, Claude Agent SDK). 저장소·논문·수치는 2026-06 기준 확인.
- **검증 노트** — `awesome-*` 링크 4개: HTTP 200 정상. goose org 이전: `block/goose` → 301 → `aaif-goose/goose` 확인. AAIF 결성: Linux Foundation 공식 발표(2025-12), 창립 기여 프로젝트 = MCP(Anthropic)·goose(Block)·AGENTS.md(OpenAI). Claude Agent SDK: *Claude Code SDK*에서 2025년 9월경 개명(공식 마이그레이션 문서), 패키지명·`ClaudeAgentOptions` 공식 문서 일치. `code.claude.com`의 403은 봇 차단이며 실제 경로는 유효.
- **개념 근거(Tier-1)** — OpenAI *Harness Engineering*; Anthropic *Building Effective AI Agents* · *Writing tools for AI agents* · *Effective harnesses for long-running agents* · *Effective context engineering*; AGENTS.md 오픈 표준 + ETH 취리히 연구(과적재 컨텍스트 성공률↓·비용↑).

> 의사코드는 핵심 흐름만 단순화한 것이며, 저장소 위치·스타 수·버전·정확한 API는 변할 수 있으니 링크에서 최신 상태를 확인하세요. (작성 기준: 2026년 6월)
