# 코딩 루프 세션 프롬프트 (그림책 제작소)

> **목적:** 세션마다 절차를 손으로 설명하지 않도록, **복붙 가능한 완성형 프롬프트**를 모아둔다.
> 모드 = **다중 세션 병렬**: 동시 가능한 트랙마다 새 세션을 열고 그 TRACK 블록 하나만 붙여넣는다.
> 각 프롬프트는 이 repo(`AGENTS.md`/`CLAUDE.md`/`DESIGN.md` 자동 로드)를 가정한다. 자동 로드 안 되는 에이전트엔
> 맨 앞에 한 줄 덧붙여라: *"먼저 AGENTS.md · DESIGN.md · feature_list.json · PROGRESS.md(Handoff)를 읽어라."*

## ⚡ 지금 뭘 동시에 돌려도 되나 (한눈에)

**두 트랙을 *동시에* 켜도 되는 조건** = ① 둘 다 **선행(precondition)이 passing** + ② **파일 스코프가 안 겹침**.
같은 웨이브 트랙들은 그렇게 설계돼 있다. ⚠️ **상태형 퍼널(TRACK-ORDER·TRACK-CHECKOUT)은 내부 기능을 쪼개지 말고 한 세션에서 순차로.**

📍 **현재(2026-06-01): F001·F002 passing.**
→ **지금 동시 가능 = TRACK-DB(F004) · TRACK-PAY(F003) · TRACK-ASSET(F029) · TRACK-CONTENT(F024–F028) — 4개 동시 OK** (파일 disjoint).
이 4개가 머지되면 Wave 1이 열린다.
*(상태 갱신법: 새 세션에서 `feature_list.json`의 passing을 보고 아래 '선행' 열과 대조하면 그때의 동시 가능 집합이 나온다.)*

| 트랙 | 기능 | 선행(merged) | 파일 스코프(겹침 없음) | 같이 켜도 되는 짝 |
|---|---|---|---|---|
| **TRACK-DB** | F004 | — | `src/lib/db.ts`·`prisma/seed.ts`·`package.json` | Wave 0 전부 |
| **TRACK-PAY** | F003 | — | `src/lib/payments`·`env.ts`·`guardrails.ts`·`check-constraints.mjs` | Wave 0 전부 |
| **TRACK-ASSET** | F029 | — | `src/lib/assets.ts` | Wave 0 전부 |
| **TRACK-CONTENT** | F024–F028 | F002 | `src/app/{brand-story,gallery,reviews,faq,contact}`·`_components/content` | Wave 0 전부 |
| **TRACK-CAT** | F005,F006 | F004 | `src/app/{anniversary,first-moments}`·`_components/catalog` | TRACK-CUSTOM |
| **TRACK-ORDER** ⚠️순차 | F007–F011,F019 | F004,F029 | `src/app/order`·`src/lib/cart.ts`·`_components/order` | (한 세션 통째) |
| **TRACK-CUSTOM** | F020–F023 | F003 | `src/app/custom`·`src/lib/customRequest.ts` | TRACK-CAT |
| **TRACK-CHECKOUT** ⚠️순차 | F012–F016,F034 | F003,F011 | `src/app/checkout`·`src/app/api/payments` | (한 세션 통째) |
| **TRACK-MYPAGE** | F017,F018 | F013,F029 | `src/app/mypage`·`_components/mypage` | TRACK-CHECKOUT 꼬리 |
| **TRACK-POLISH** ⚠️순차 | F035–F042 | entry flow | 전반 sweep | (한 세션 통째) |

## 복붙 방법
1. 위 매트릭스에서 **선행이 passing인 트랙**을 고른다 = 지금 동시 가능 집합.
2. **트랙마다 새 세션을 열고 그 TRACK 블록 하나만 복붙** (파일 전체를 긁을 필요 없음). 동시 가능한 트랙은 세션을 동시에 띄워도 된다.
3. 각 세션은 자기 worktree 브랜치(`feat/<id>`)에서 끝까지 — attempt → TDD → `pnpm check`+E2E → passing+evidence → commit.
4. 끝난 브랜치는 **한 번에 하나씩 머지 → 매번 `pnpm check`** (R4가 state/passes 드리프트를 잡음). 충돌 핫스팟: `feature_list.json`·`package.json`. (맨 아래 머지 프롬프트 참고)
5. ⚠️ **상태형 퍼널(TRACK-ORDER·TRACK-CHECKOUT)은 쪼개지 말 것** — 한 세션에서 기능을 차례로.

## 트랙 시작 전 — 격리 preflight (동시 세션이면 필수)
동시에 여러 트랙을 돌리면 **각 세션은 자기 worktree(별도 디렉터리)에서** 작업한다. **한 디렉터리 + 동시 세션 = 금지** — 같은 working tree를 동시에 편집하면 미커밋 WIP이 뒤엉킨다.
1. `git worktree add ../gpcs-<id> master -b feat/<id>` — 최신 master 기반 (이미 있는 브랜치면 `-b` 빼고 브랜치명만).
2. `cd ../gpcs-<id> && pnpm install`
3. **베이스라인 확인:** `git status` 깨끗 + `pnpm check` green이어야 시작. *다른 트랙의 미커밋/untracked 변경이 보이면 잘못된 디렉터리다 — 멈춰라.*
4. 작업 → (불변 규칙의 루프) → 자기 브랜치에 commit.
5. 머지·검증 끝나면 `git worktree remove ../gpcs-<id>`.
> 동시성이 필요 없으면 worktree 없이 한 디렉터리에서 **한 트랙씩**(다음 트랙 전 commit). 단 **동시 세션 + 한 디렉터리는 절대 금지**.
> 이미 엉켰으면(같은 dir에 여러 트랙 WIP): 파일 스코프가 disjoint하므로 `git add <그 트랙 파일들>`로 트랙별 분리 커밋이 가능하다.

## 불변 규칙 (모든 트랙에 자동 적용 — 트랙 블록에 반복하지 않는다)
- **완료 게이트:** `pnpm check` green **AND** 그 기능의 E2E/verification 통과 → 그때만 `feature_list.json` 해당 항목 `state:"passing"`/`passes:true` + **날짜 박힌 evidence**. 그 전엔 절대 passing 금지.
- **루프:** `pnpm attempt <id>` → **테스트 먼저(TDD)** → 구현 → 게이트 통과 → passing+evidence → 서술형 `git commit` → `PROGRESS.md` 갱신.
- **WIP=1(로컬):** 한 트랙은 한 번에 기능 하나. 끝내고(verify) 다음.
- **UI:** 스타일은 **DESIGN.md 토큰만**(`globals.css` CSS 변수). box-shadow·순백/순흑·둥근 모서리 금지·명조는 한국어 책 제목에만. (R6/R7이 강제)
- **결제/PII:** 비가역 행동은 `requireApproval()`. 민감 PII는 평문 로그/트레이스/픽스처 금지(`redact()`), 접근통제 `Asset` 저장. 외부 입력은 `untrusted()`.
- **충돌 회피:** 각 트랙은 **자기 파일만**. 공유 키트 `src/app/_components/` 루트(Nav·Footer·CtaLink·SectionHeader·CategoryCard, **F002 소유**)는 **import-only(편집 금지)** — 새 컴포넌트는 `_components/<area>/`에 네임스페이스. 라우트/소유권 **계약** 준수. 머지는 한 트랙씩 + 매번 `pnpm check`.

> **그래서 아래 각 TRACK 블록은 "트랙 고유 델타"만 담는다** — 기능 ID·파일 스코프·계약·고유 주의·검증 명령. 보편 규칙(루프·TDD·DESIGN·커밋·WIP)은 위에서 한 번만 정의되고 전부에 적용된다.

---

# ▶ 패턴 세터 — F002 브랜드 홈 (✅ 완료, 38a1707 · 참고용)

```
F002 — Branded home: hero + tagline "한 아이의 이름으로 시작되는 이야기" + 3-category cards
(기념일/첫 순간들/맞춤 제작) + primary CTA "내 아이의 책 만들기".
Also establishes the shared kit src/app/_components/ (Nav, Footer, CtaLink, SectionHeader, CategoryCard).
Touch: src/app/page.tsx, src/app/_components/*, tests/e2e/home.spec.ts.
Contract: home category cards link to /anniversary, /first-moments, /custom (those routes may 404 for now).
Verify: pnpm test:e2e -- home.spec.ts.
```

> ✅ F002 완료 → 아래 **Wave 0**부터 병렬로 진행한다.

---

# ▶ WAVE 0 — 토대 + 콘텐츠 (F002 후 · 4개 전부 독립 → 동시 가능)

### TRACK-DB — F004
```
Branch feat/F004 · Precondition: none.
F004 — Prisma singleton (src/lib/db.ts) + seed the 8 entry templates
(탄생·백일·돌·생일·입학·첫 걸음마·첫 말·형아 된 날): key/label/softPriceWon 43000/hardPriceWon 49000/extraVar per PRODUCT_BRIEF.
Touch ONLY: src/lib/db.ts, prisma/seed.ts, package.json (prisma.seed only), tests/unit/db.test.ts.
⚠️ Keep `pnpm check` DB-independent (ADR-0002): db.test.ts must NOT need a live Postgres (mock/inject).
Verify: pnpm test -- db.test.ts.
```

### TRACK-PAY — F003
```
Branch feat/F003 · Precondition: none.
F003 — provider-agnostic PaymentProvider interface + TossPayments test/sandbox adapter. env refuses a LIVE
Toss key when APP_ENV!=production (accepts test key); check-constraints R1 → Toss live-key pattern;
guardrails IRREVERSIBLE_ACTIONS → Toss/consultation names; refresh F030/F031 evidence to Toss.
Touch ONLY: src/lib/payments/ (index.ts + toss.ts), src/lib/env.ts, src/lib/guardrails.ts,
scripts/check-constraints.mjs, tests/unit/payments.test.ts, tests/unit/smoke.test.ts.
Ownership: this track SOLELY owns check-constraints.mjs + guardrails.ts this wave.
Verify: pnpm test -- payments.test.ts && pnpm constraints.
```

### TRACK-ASSET — F029
```
Branch feat/F029 · Precondition: none.
F029 — store child photo / QR video as Asset (storageKey, contentType, byteSize), access-controlled
(never inline/public); upload input untrusted(); test asserts no PII (filename/child name/bytes) leaks to
logs/traces/fixtures.
Touch ONLY: src/lib/assets.ts, tests/unit/pii.test.ts. Import redact()/untrusted() only — do NOT edit
observability.ts / guardrails.ts / check-constraints.mjs (TRACK-PAY owns those).
Verify: pnpm test -- pii.test.ts.
```

### TRACK-CONTENT — F024–F028
```
Branch feat/content · Precondition: F002.
F024 브랜드 스토리 · F025 갤러리(placeholder, flagged TODO) · F026 후기(honest placeholder, 날조 금지)
· F027 FAQ(제작기간·커스텀·배송·업로드·환불) · F028 문의(전화·이메일·문의폼).
Touch ONLY: src/app/{brand-story,gallery,reviews,faq,contact}/, src/app/_components/content/ (new),
one e2e spec per page. Import the shared _components kit — do NOT modify _components root files.
Verify (per feature): pnpm test:e2e -- <page>.spec.ts.
```

---

# ▶ WAVE 1 — 카탈로그 + 주문 + 맞춤 (Wave 0 후 · 주문 퍼널은 한 세션 순차)

> 동시 가능: **TRACK-CAT · TRACK-CUSTOM** (TRACK-ORDER는 상태형이라 한 세션 통째).

### TRACK-CAT — F005, F006
```
Branch feat/category · Precondition: F004 merged.
F005 기념일(탄생·백일·돌·생일·입학) · F006 첫 순간들(첫 걸음마·첫 말·형아 된 날) — template card grid from DB
(label/hero/price), DESIGN ProductCard pattern (명조 = 책 제목, 헤어라인, radius 0).
Touch ONLY: src/app/anniversary/, src/app/first-moments/, src/app/_components/catalog/TemplateCard.tsx (new),
tests/e2e/category-*.spec.ts. Import src/lib/db only.
Contract: cards link to /order/[templateKey] (the order flow itself is built by TRACK-ORDER).
Verify: pnpm test:e2e -- category-anniversary.spec.ts / category-first-moments.spec.ts.
```

### TRACK-ORDER — F007–F011, F019  ⚠️ stateful funnel (one session, sequential)
```
Branch feat/order · Precondition: F004 + F029 merged.
F007 template→order start (extra var resolved) · F008 pre-pay minimal form (이름·성별 + 0~1 var, validated)
· F009 optional photo upload + skip (never blocks pay) · F010 cover (소프트43000/하드49000, price reflects)
· F019 QR add-on toggle · F011 cart (line + grand total, 원).
Touch ONLY: src/app/order/, src/lib/cart.ts (you OWN it), src/app/_components/order/*,
tests/e2e/order-*.spec.ts + cart.spec.ts. Import src/lib/assets only.
Contract: build /order/[templateKey]; expose cart via src/lib/cart.ts (TRACK-CHECKOUT imports it).
Verify (per feature): pnpm test:e2e -- order-*.spec.ts / cart.spec.ts.
```

### TRACK-CUSTOM — F020–F023
```
Branch feat/custom · Precondition: F003 merged.
F020 landing (two path buttons) · F021 WRITTEN (6-group form → Toss pay → submit) · F022 PHONE (booking
calendar, free booking / pay after the call) · F023 both paths store the same CustomRequest.form shape.
Touch ONLY: src/app/custom/, src/app/api/custom/, src/lib/customRequest.ts, tests/e2e/custom-*.spec.ts
+ tests/unit/custom-request.test.ts. Import src/lib/payments only.
Verify (per feature): pnpm test:e2e -- custom-*.spec.ts / pnpm test -- custom-request.test.ts.
```

---

# ▶ WAVE 2 — 체크아웃 + 마이페이지 (Wave 1 후 · 상태형 → 한 세션 순차)

> TRACK-MYPAGE는 F013(결제완료 주문) 나오면 시작 — 체크아웃 꼬리와 겹쳐 OK.

### TRACK-CHECKOUT — F012–F016, F034  ⚠️ stateful (success path first, variants reuse plumbing)
```
Branch feat/checkout · Precondition: F003 + F011 merged.
F012 create Toss test payment + redirect · F013 SUCCESS confirm+webhook → PAID (signature-verified,
idempotent via ProcessedWebhook) · F014 confirmation page · F015 FAILURE (no PAID order) · F016 CANCEL
(cart preserved) · F034 record the checkout chain's worker≠checker review in PROGRESS/DECISIONS.
Touch ONLY: src/app/checkout/, src/app/api/payments/, src/app/orders/[id]/, tests/e2e/checkout-*.spec.ts
+ order-confirm.spec.ts, tests/unit/webhook.test.ts. Import src/lib/cart + src/lib/payments only.
Verify (per feature): pnpm test -- webhook.test.ts / pnpm test:e2e -- checkout-*.spec.ts / order-confirm.spec.ts.
```

### TRACK-MYPAGE — F017, F018
```
Branch feat/mypage · Precondition: F013 + F029 merged.
F017 mypage (order status + post-pay photo upload if skipped) · F018 finishing (dedication + QR upload,
QR shown only if the add-on is on). Photos via Asset storageKey, PII redacted.
Touch ONLY: src/app/mypage/, src/app/_components/mypage/*, tests/e2e/mypage-*.spec.ts. Import src/lib/assets only.
Verify (per feature): pnpm test:e2e -- mypage-*.spec.ts.
```

---

# ▶ WAVE 3 — 횡단 폴리시 + eval (제품 플로우 완성 후 · 한 세션 순차)

> F038(traces)·F041(holdout)은 이미 passing.

### TRACK-POLISH — F035, F037, F036, F039, F040, F042
```
Branch feat/polish · Precondition: entry flow (F002, F005–F016) merged.
F035 mobile 375px no-overflow sweep (home/category/order/checkout) · F037 a11y (heading order, labels, alt)
· F036 perf p95<2s (home/category) · F039 ops metrics (latency/error/tool-call-failure) from traced()
· F040 entry-line eval (re-point eval/golden to the Toss entry flow; pending steps reported honestly;
do NOT touch eval/holdout — F041) · F042 worker≠checker protocol doc + applied to one shipped feature.
Verify (per feature): pnpm test:e2e -- perf.spec.ts / a11y.spec.ts · pnpm test -- metrics.test.ts · pnpm eval.
```

---

# ▶ 머지/통합 프롬프트 (트랙 세션들 끝난 뒤 — 메인 또는 별도 세션에서)
```
You are in the 그림책 제작소 harness. Merge the completed feature worktrees into master, ONE branch at a time.
For each: merge → `pnpm check` → if red, fix forward (the merge, not the feature's intent) → resolve
feature_list.json/package.json conflicts so every merged feature keeps its true state (R4 must pass) →
`pnpm test:e2e` for any UI-touching branch. After all merged: update PROGRESS.md (verified state + session
log + Handoff next pick), confirm docs/clean-state-checklist.md, commit. Report the final feature pass table
and `pnpm status` (product delivery vs harness readiness — don't conflate).
```
