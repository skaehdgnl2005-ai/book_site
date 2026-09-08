# Storybook Shop (그림책 제작소) — 맞춤 동화책 커머스 + 신뢰성 하네스

> Premium e-commerce for personalized, high-illustration storybooks — built on top of a greenfield **reliability harness** (instructions, tools, environment, state, feedback) so an AI coding agent can ship the product safely across sessions. 91/92 product features passing, 98 test files, CI, RLS, default-deny human-approval gate for irreversible actions.

**한 줄로**: 출산·기념일 선물로 아이 이름과 사진이 들어간 프리미엄 동화책을 주문하는 이커머스. 결제(TossPayments)·주문·관리자까지 갖췄고, 결제·환불·PII 전송 같은 되돌릴 수 없는 동작은 사람의 승인 토큰 없이는 실행되지 않는다.

## 무엇을 만들었나
- 카탈로그 → 장바구니 → 주문 스텝(사진·정보·표지·검토) → TossPayments 결제 → 주문 관리 → 관리자 대시보드 + 분석 이벤트.
- Prisma 마이그레이션 17개(Row-Level Security 포함), Next.js 15 App Router, page-flip 미리보기.
- 하네스: `AGENTS.md` 지시 계층, `feature_list.json` 단일 진실원, `pnpm check` 통합 게이트, `pnpm constraints` 실행 가능한 아키텍처 가드레일, `requireApproval()` 기본거부 HITL 게이트, `observability.ts` 단계별 JSON 트레이스.

## 왜 이렇게 만들었나 (설계 결정)
- **가장 어려웠던 문제**: "테스트는 초록불인데 실기능은 죽어 있는" 상태를 막는 것. 초기에 Kakao 키 미설정 상태에서 `ALLOW_DEV_AUTH` 우회로 E2E가 통과해 버린 사례가 있었고(`PROGRESS.md` 회고), 이후 `passes:true`는 실제 도구 출력(`pnpm check` + Playwright)에만 근거하도록 게이트를 묶었다.
- **하네스 점수와 제품 완성도를 절대 섞지 않는다.** `pnpm status`가 두 숫자를 따로 낸다. 하네스 준비도가 높아도 상점이 안 만들어졌으면 안 만들어진 것이다(Goodhart 방지).
- **기각한 것**: 멀티 에이전트 프레임워크. worker≠checker 분리로 충분하다고 판단(ADR-0005). E2E는 `next dev` 컴파일 지연 때문에 CI에서 의도적으로 제외하고 사유를 워크플로 주석에 남겼다.

## 어떻게 검증했나
| 층 | 도구 | 수 |
|---|---|---|
| 단위 | Vitest | 43 파일 |
| E2E | Playwright (구매 여정) | 56 파일 |
| 가드레일 | `pnpm constraints` | 아키텍처·안전 규칙 R1~R5 |
| CI | GitHub Actions | lint + typecheck + unit + constraints |
| 하네스 준비도 | `SCORECARD.md` | 85.2/100, 하드 게이트 8/8 |
| 제품 완성도 | `pnpm status` | **91 / 92** features `passes:true` |

> Agents: start at **[AGENTS.md](AGENTS.md)**. Product spec: **[PRODUCT_BRIEF.md](PRODUCT_BRIEF.md)**.
> Harness method docs (reference): **[docs/method/](docs/method/)**.

## Quickstart
```bash
./init.sh            # install → verify baseline → ready  (idempotent; run every session)
pnpm dev             # http://localhost:3000
pnpm check           # full gate: lint + typecheck + tests + arch guardrails
pnpm test:e2e        # Playwright buyer-flow E2E (boots its own server)
```
Requires Node ≥ 20 and pnpm 10. Optional local DB: `pnpm db:up` (Docker).

## Status — two separate numbers (don't conflate)
- **Harness readiness** (the machinery): **85.2/100 → READY** (`SCORECARD.md`). Bootstrap
  contract MET: boots clean, `pnpm check` green, E2E smoke passes, router + aligned feature list.
- **Product delivery** (the actual store): **91/92 product features passing (`pnpm status`,
  `feature_list.json`)** — catalog → cart → checkout → orders → admin → analytics. The two
  numbers are tracked separately on purpose; a high harness score never stands in for a shipped store.

## Scripts
| Command | What |
|---|---|
| `pnpm check` | lint + typecheck + unit tests + `pnpm constraints` (canonical gate) |
| `pnpm verify` | lint + typecheck + unit tests (brief's chain) |
| `pnpm test:e2e` | Playwright end-to-end (buyer journey) |
| `pnpm constraints` | executable architecture/safety guardrails (incl. feature-list invariants R4/R5) |
| `pnpm status` | honest split: **product delivery** vs **harness readiness** (never conflate) |
| `pnpm eval` | purchase-flow eval metrics |
| `pnpm approve <action>` | issue a human-approval token for an irreversible action |

## Safety (payments + PII = regulated)
TossPayments runs in **test/sandbox mode** only during development; a live key outside
production makes the app refuse to boot. Irreversible actions (live charge/refund, order
confirm, consultation booking, fulfillment, prod DB writes, PII send, deploy) are
**default-deny** and require an explicit approval token.
See **[docs/SAFETY.md](docs/SAFETY.md)**.

## Layout
```
AGENTS.md  PRODUCT_BRIEF.md  feature_list.json  PROGRESS.md  DECISIONS.md  init.sh
src/app/      Next.js App Router pages
src/lib/      env (config+redaction), guardrails (HITL+trust), observability (traces)
prisma/       schema (Postgres)
scripts/      approve (HITL gate), check-constraints (executable guardrails)
eval/         eval harness + golden/holdout sets
tests/        unit (vitest) + e2e (Playwright)
docs/         ARCHITECTURE, CONSTRAINTS, SAFETY, OBSERVABILITY, EVAL  (+ method/ reference)
SCORECARD.md  rubric self-assessment
```
