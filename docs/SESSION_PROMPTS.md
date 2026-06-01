# 코딩 루프 세션 프롬프트 (그림책 제작소)

> **목적:** 세션마다 병렬 메커니즘·웨이브를 손으로 설명하지 않도록, **복붙 가능한 완성형 프롬프트**를 모아둔다.
> 각 프롬프트는 이 repo(`AGENTS.md`/`CLAUDE.md`/`DESIGN.md` 자동 로드)를 가정한다. 자동 로드 안 되는 에이전트엔
> 맨 앞에 한 줄 덧붙여라: *"먼저 AGENTS.md · DESIGN.md · feature_list.json · PROGRESS.md(Handoff)를 읽어라."*

## 권장 실행 모델 (재검토 결론 2026-06-01)
솔로 개발 + 신중한 검증이라 **물리적 병렬보다 1M 컨텍스트 배치가 이득**이다(하네스 단순성 ADR-0005과도 일치).
- **기본 = 단일 세션, 그룹별 순차.** 한 그룹을 한 창에 통째로 올려 컨텍스트 리로드 없이 연달아 만든다.
  **상태형 그룹(주문 퍼널 F007~F011, 체크아웃 F012~F016)은 반드시 이 방식** — 서브에이전트로 쪼개면 공유 상태가 파편화돼 역효과.
- **서브에이전트 offload(선택) = 독립·기계적 트랙만.** 콘텐츠 5페이지(F024~F028)·F004(DB)·F029(자산)·F003(결제)처럼
  서로/메인과 무관한 트랙만 격리 서브에이전트로 떼어낸다.
- **병렬 세션(트랙당 창)은 비권장** — 베이비시팅·수동 머지 비용이 이득을 상쇄한다.

## 복붙 방법
- **그룹 직접 작업:** 해당 **TRACK 프롬프트** 블록을 지금 세션에 붙여넣고 끝까지(verify+commit) 간다.
- **독립 트랙 offload:** 해당 웨이브의 **OFFLOAD 디스패처**를 붙여넣으면, 메인 세션이 격리 서브에이전트로
  *독립 트랙만* 띄우고 결과를 머지·검증한다. (각 TRACK 스코프는 이 파일에서 읽으므로 다 긁을 필요 없음.)
- 어느 경우든 머지는 **한 트랙씩 → 매번 `pnpm check`**. 상태형 그룹은 절대 offload하지 말 것.

## 불변 규칙 (모든 프롬프트에 적용 — 굳이 반복 안 해도 됨)
- **완료 게이트:** `pnpm check` green **AND** 그 기능의 E2E/verification 통과 → 그때만 `feature_list.json`의 해당 항목 `state:"passing"`/`passes:true` + **날짜 박힌 evidence**. 그 전엔 절대 passing 금지.
- **WIP=1(로컬):** 한 트랙은 한 번에 기능 하나. 끝내고(verify) 다음.
- **UI 규칙:** 스타일은 **DESIGN.md 토큰만**(`src/app/globals.css`의 CSS 변수). box-shadow 금지·순백/순흑(#fff/#000) 금지·radius 0·**명조(Noto Serif KR)는 한국어 책/이야기 제목에만**. (R6/R7이 `pnpm check`에서 강제)
- **결제/PII:** 비가역 행동은 `requireApproval()`. 아동 사진·이름 등 민감 PII는 로그/트레이스/E2E 픽스처에 평문 금지(`redact()`), 접근통제 `Asset`로 저장.
- **TDD:** 가능하면 테스트(E2E/유닛) 먼저 작성→실패 확인→구현으로 green.
- **퇴근:** `pnpm check` green → 서술형 `git commit` → `PROGRESS.md`(Handoff/세션로그) 갱신.
- **충돌 회피(병렬 시):** 각 트랙은 **자기 파일만** 만지고, 공유 컴포넌트는 `src/app/_components/<area>/`로 네임스페이스. 라우트/인터페이스 **계약**을 지킨다(아래 각 트랙 명시). 머지는 **한 트랙씩 → 매번 `pnpm check`**.

---

# ▶ 먼저 1개 (패턴 세터) — F002 브랜드 홈

```
You are in the 그림책 제작소 reliability harness. Follow AGENTS.md + DESIGN.md (auto-loaded).
This is the PATTERN-SETTER: do this ONE feature end-to-end so we lock the loop before parallelizing.

Feature: F002 — Branded home (그림책 제작소): hero + tagline "한 아이의 이름으로 시작되는 이야기"
+ 3-category preview cards (기념일 / 첫 순간들 / 맞춤 제작) + primary CTA "내 아이의 책 만들기".
Acceptance = feature_list.json F002 steps + verification (pnpm test:e2e -- home.spec.ts).

Also establish the shared UI kit everything else reuses: src/app/_components/ (Nav, Footer, Button,
SectionHeader) built strictly from DESIGN.md tokens. Category cards link to /anniversary, /first-moments,
/custom (routes may 404 for now — only the home links matter here). No DB/payment needed.

Loop:
  1. `pnpm attempt F002`
  2. Rewrite tests/e2e/home.spec.ts FIRST for the new brand (assert 그림책 제작소 hero h1, 3 category
     cards, the CTA) + keep the 375px no-overflow check. Watch it fail.
  3. Implement src/app/page.tsx + src/app/_components/* using only globals.css tokens
     (--bg/--ink/--accent/--font-grotesk/--font-serif-ko/...). Radius 0, no box-shadow, no #fff/#000.
  4. Gate: `pnpm check` green AND `pnpm test:e2e -- home.spec.ts` passing. Only then set F002
     passing/passes:true with dated evidence in feature_list.json. (F001 skeleton stays passing or is
     folded — keep at least one passing home test.)
  5. `git commit` (descriptive) → update PROGRESS.md.
Report: what passed, screenshots/output, and whether the _components kit is ready for reuse.
```

> 이 1개가 green으로 끝나면 → 아래 Wave 0를 병렬로 키운다.

---

# ▶ WAVE 0 — 토대 + 콘텐츠 (F002 후 · 전부 독립 → 원하면 offload)

> 전제: F002 머지됨(공유 `_components` 키트 존재). 트랙들은 파일이 안 겹친다.

### WAVE 0 OFFLOAD 디스패처 (선택 · 독립 트랙만 — 상태형 그룹은 메인 세션)
```
You are the integrator in the 그림책 제작소 harness (AGENTS.md governs). Run WAVE 0 in parallel.
Spin up one git worktree + subagent per track below (TRACK-DB, TRACK-PAY, TRACK-ASSET, TRACK-CONTENT),
each with its own branch feat/<id> and the file scope stated in its TRACK prompt. They are file-disjoint.
When all return: merge ONE branch at a time → run `pnpm check` after each → resolve feature_list.json /
package.json conflicts (R4 invariant flags any state/passes drift) → commit. Then update PROGRESS.md.
Never mark a feature passing without green check + its test passing. Report a table of feature → pass/blocked.
```

### TRACK-DB — F004 (DB wrapper + seed)
```
Harness: 그림책 제작소 (AGENTS.md/DESIGN.md auto-loaded). Worktree branch: feat/F004.
Touch ONLY: src/lib/db.ts, prisma/seed.ts, package.json (add prisma.seed only), tests/unit/db.test.ts.
Do NOT edit: src/app/*, src/lib/payments*, scripts/check-constraints.mjs, smoke.test.ts.
Feature F004: Prisma singleton wrapper + seed the 8 entry templates (탄생·백일·돌·생일·입학·첫 걸음마·첫 말·
형아 된 날) with category/key/label/prices(소프트 43000/하드 49000 원, 정수)/extraVar per PRODUCT_BRIEF.
Loop: `pnpm attempt F004` → write tests/unit/db.test.ts first (seed idempotent; 8 templates; prices in won)
→ implement → `pnpm check` green AND `pnpm test -- db.test.ts` → set F004 passing + evidence → commit.
Note: keep `pnpm check` DB-independent (ADR-0002) — db.test.ts must not require a live Postgres (mock/inject).
```

### TRACK-PAY — F003 (payment abstraction + Toss adapter)
```
Harness: 그림책 제작소. Worktree branch: feat/F003.
Touch ONLY: src/lib/payments/ (index.ts interface + toss.ts test adapter), src/lib/env.ts (re-point key
validation Stripe→Toss), scripts/check-constraints.mjs (R1: Stripe→Toss live-key pattern), tests/unit/
payments.test.ts, tests/unit/smoke.test.ts (update the env-key test to Toss). Also update guardrails
IRREVERSIBLE_ACTIONS to Toss/consultation names in src/lib/guardrails.ts.
Do NOT edit: src/app/*, src/lib/db.ts, prisma/*.
Feature F003: provider-agnostic PaymentProvider interface + TossPayments test/sandbox adapter; env refuses
a LIVE Toss key when APP_ENV!=production, accepts a test key; R1 flags committed Toss live keys.
Loop: `pnpm attempt F003` → tests first (payments.test.ts + updated smoke env test) → implement →
`pnpm check` green (constraints incl. updated R1) AND `pnpm test -- payments.test.ts` → F003 passing +
evidence; flip F030/F031 evidence note to Toss → commit.
```

### TRACK-ASSET — F029 (asset storage + PII safety)
```
Harness: 그림책 제작소. Worktree branch: feat/F029.
Touch ONLY: src/lib/assets.ts (upload→access-controlled storage by storageKey, never inline/public),
tests/unit/pii.test.ts. REUSE redact()/untrusted() from src/lib (import, do NOT edit observability.ts or
check-constraints.mjs this wave — TRACK-PAY owns check-constraints; coordinate a new PII rule for a LATER wave).
Do NOT edit: src/app/*, scripts/*, src/lib/payments*, src/lib/db.ts.
Feature F029: child photo / QR video stored as Asset (storageKey, contentType, byteSize); upload input
wrapped untrusted(); a test asserts no PII (filename, child name, bytes) reaches logs/traces/fixtures.
Loop: `pnpm attempt F029` → pii.test.ts first → implement → `pnpm check` green AND `pnpm test -- pii.test.ts`
→ F029 passing + evidence → commit.
```

### TRACK-CONTENT — F024–F028 (content pages)
```
Harness: 그림책 제작소. Worktree branch: feat/content.
Touch ONLY: src/app/brand-story/, src/app/gallery/, src/app/reviews/, src/app/faq/, src/app/contact/,
src/app/_components/content/ (new namespaced components), and one e2e spec per page. Import the shared kit
from src/app/_components/ (built by F002) — do NOT modify it.
Do NOT edit: src/lib/*, prisma/*, scripts/*, other src/app routes.
Features (WIP=1, one at a time, all UI on DESIGN.md tokens): F024 브랜드 스토리, F025 갤러리(placeholder
assets, flagged TODO), F026 후기(정직한 placeholder, 날조 금지), F027 FAQ(제작기간·커스텀·배송·업로드·환불),
F028 문의(전화·이메일·문의폼; 폼 입력 untrusted()).
Per feature loop: `pnpm attempt F0XX` → e2e spec first → implement page → `pnpm check` green AND its e2e →
F0XX passing + evidence → commit. After all five: update PROGRESS, stop.
```

---

# ▶ WAVE 1 — 카탈로그 + 주문 + 맞춤 (Wave 0 후 · 주문 퍼널은 메인 세션 순차)

> 전제: F004(DB), F029(asset), F003(payment) 머지됨. **라우트 계약**: 카테고리 카드 → `/order/[templateKey]`.
> 장바구니 상태는 `src/lib/cart.ts`(TRACK-ORDER 소유) — TRACK-CHECKOUT가 나중에 import.

### WAVE 1 OFFLOAD 디스패처 (선택 · 독립 트랙만 — 상태형 그룹은 메인 세션)
```
Integrator, 그림책 제작소 harness. Run WAVE 1 (TRACK-CAT, TRACK-ORDER, TRACK-CUSTOM) in parallel worktrees.
Preconditions: feat F003/F004/F029 already merged. Enforce the route contract: category pages link to
/order/[templateKey]; TRACK-ORDER builds /order/[templateKey] and owns src/lib/cart.ts. Merge one at a time,
`pnpm check` after each, resolve feature_list.json conflicts. No feature passing without green check + E2E.
```

### TRACK-CAT — F005, F006 (category pages)
```
Harness: 그림책 제작소. Worktree branch: feat/category. Precondition: F004 merged.
Touch ONLY: src/app/anniversary/, src/app/first-moments/, src/app/_components/catalog/TemplateCard.tsx (new),
tests/e2e/category-*.spec.ts. Read templates via src/lib/db (do not edit it). Link cards to /order/[key].
Do NOT build the order flow. Do NOT edit src/lib/*, src/app/order/*.
Features: F005 기념일(탄생·백일·돌·생일·입학), F006 첫 순간들(첫 걸음마·첫 말·형아 된 날) — card grid from DB,
each card shows label/hero/price, DESIGN.md ProductCard pattern (명조 제목, 헤어라인, 0 radius).
Per feature: attempt → e2e first → implement → `pnpm check`+e2e green → passing+evidence → commit.
```

### TRACK-ORDER — F007–F011, F019 (pre-pay funnel)
```
Harness: 그림책 제작소. Worktree branch: feat/order. Precondition: F004 + F029 merged.
Touch ONLY: src/app/order/, src/lib/cart.ts (you own it), src/app/_components/order/*, tests/e2e/order-*.spec.ts
+ cart.spec.ts. Import Asset upload from src/lib/assets (F029, do not edit). At the cart→checkout seam, just
expose cart via src/lib/cart.ts; the checkout route is built by Wave 2.
Do NOT edit: category pages, src/lib/payments*, src/lib/db.ts, assets.ts.
Features (sequential funnel, WIP=1): F007 template→order start (extra var resolved), F008 pre-pay minimal form
(이름·성별 + 0~1 var, validated, minimal), F009 optional photo upload + skip (never blocks pay), F010 cover
(소프트43000/하드49000, price reflects), F019 QR add-on toggle, F011 cart (line + grand total, 원).
Per feature: attempt → spec first → implement → `pnpm check`+e2e → passing+evidence → commit.
```

### TRACK-CUSTOM — F020–F023 (맞춤 제작)
```
Harness: 그림책 제작소. Worktree branch: feat/custom. Precondition: F003 merged.
Touch ONLY: src/app/custom/, src/app/api/custom/, src/lib/customRequest.ts, tests/e2e/custom-*.spec.ts
+ custom-request.test.ts. Use payments from src/lib/payments (F003, import only). Form input untrusted().
Do NOT edit: entry-line order/checkout files, src/lib/payments*.
Features: F020 landing(두 경로 버튼), F021 WRITTEN(6묶음 폼 → Toss 결제 → submit), F022 PHONE(예약 캘린더,
무료 예약·상담 후 결제), F023 두 경로가 동일한 CustomRequest.form 형태로 저장.
Per feature: attempt → spec first → implement → `pnpm check`+e2e/test → passing+evidence → commit.
```

---

# ▶ WAVE 2 — 체크아웃 + 마이페이지 (Wave 1 후 · 상태형 → 메인 세션 순차, offload 비권장)

> 전제: F003(payment), F011(cart) 머지됨. E(마이페이지)는 F013(결제완료 주문) 나오면 시작 — D 꼬리와 겹쳐 OK.

### WAVE 2 OFFLOAD 디스패처 (선택 · 독립 트랙만 — 상태형 그룹은 메인 세션)
```
Integrator, 그림책 제작소 harness. Run WAVE 2: TRACK-CHECKOUT first; start TRACK-MYPAGE once F013 is merged
(it needs a PAID order). Worktrees, merge one at a time, `pnpm check` each. Webhook idempotency + signature
are non-negotiable (E-safety). No feature passing without green check + E2E.
```

### TRACK-CHECKOUT — F012–F016, F034 (Toss flows)
```
Harness: 그림책 제작소. Worktree branch: feat/checkout. Precondition: F003 + F011 merged.
Touch ONLY: src/app/checkout/, src/app/api/payments/ (create/confirm/webhook), src/app/orders/[id]/,
tests/e2e/checkout-*.spec.ts, order-confirm.spec.ts, tests/unit/webhook.test.ts. Import cart (src/lib/cart),
payments (src/lib/payments) — do not edit them.
Features (success path first, then variants reuse the plumbing): F012 create Toss test payment + redirect,
F013 SUCCESS confirm+webhook → PAID (signature-verified, idempotent via ProcessedWebhook), F014 confirmation
page, F015 FAILURE (no PAID order), F016 CANCEL (cart preserved), F034 record worker≠checker review for the
checkout chain in PROGRESS/DECISIONS.
Per feature: attempt → test first → implement → `pnpm check`+E2E → passing+evidence → commit.
```

### TRACK-MYPAGE — F017, F018
```
Harness: 그림책 제작소. Worktree branch: feat/mypage. Precondition: F013 + F029 merged.
Touch ONLY: src/app/mypage/, src/app/_components/mypage/*, tests/e2e/mypage-*.spec.ts. Import Asset upload
(F029) — do not edit it.
Features: F017 mypage(주문 상태 + 결제 후 사진 업로드 if skipped), F018 finishing(헌정 문구 + QR 업로드 —
QR 옵션 켠 경우에만 노출). All PII redacted, photos via Asset storageKey.
Per feature: attempt → spec first → implement → `pnpm check`+e2e → passing+evidence → commit.
```

---

# ▶ WAVE 3 — 횡단 폴리시 + eval (제품 플로우 완성 후)

> F038(traces)·F041(holdout)은 이미 passing. 나머지는 페이지 전반 sweep이라 한 트랙에서 순차 권장.

### TRACK-POLISH — F035, F037, F036, F039, F040, F042
```
Harness: 그림책 제작소. Worktree branch: feat/polish. Precondition: entry flow (F002,F005–F016) merged.
Features (focused passes, WIP=1):
  F035 mobile 375px no-overflow sweep across home/category/order/checkout (extend home.spec pattern).
  F037 a11y (heading order, form labels, alt text) across pages.
  F036 perf budget: p95 < 2s on home/category (perf.spec).
  F039 ops metrics (latency/error/tool-call-failure) from traced().
  F040 entry-line purchase-flow eval: re-point eval/golden to the Toss entry flow; pending steps reported
       honestly (not as success). Keep eval/holdout untouched (F041 policy).
  F042 worker≠checker protocol doc + applied to one shipped feature, recorded.
Per feature: attempt → test/check first → implement → `pnpm check`+verification → passing+evidence → commit.
```

---

# ▶ 머지/통합 프롬프트 (디스패처가 쓰거나, 트랙 세션들 끝난 뒤)
```
Integrator, 그림책 제작소 harness. Merge the completed feature worktrees into master, ONE branch at a time.
For each: merge → `pnpm check` → if red, fix forward (the merge, not the feature's intent) → resolve
feature_list.json/package.json conflicts so every merged feature keeps its true state (R4 must pass) →
`pnpm test:e2e` for any UI-touching branch. After all merged: update PROGRESS.md (verified state + session
log + Handoff next pick), confirm docs/clean-state-checklist.md, commit. Report the final feature pass table
and `pnpm status` (product delivery vs harness readiness — don't conflate).
```
