# 맞춤 제작 (Custom) Track — Design Spec (F020–F023)

> Track: TRACK-CUSTOM · Branch `feat/custom` (worktree `gpcs-custom`) · Precondition F003 (payments) merged ✓
> Authored 2026-06-01. The user delegated all decisions for this track ("네가 알아서 다 판단해서 결과를 내라"),
> so the brainstorming user-approval gate is replaced by documented autonomous decisions (D1–D8 below) — a
> traceable record to review on recovery, not a silent skip.

## 1. Goal
Build the 맞춤 제작 (full-custom, 119,000원) intake: a landing with two paths, and both paths collecting an
**identical 6-group request** so production input is homogeneous (brief §4, web-brief §4 "공통 의뢰서 양식").

- **F020** `/custom` landing — two side-by-side path buttons: "전화로 상담 예약하기" / "직접 작성하기", each routes.
- **F021** WRITTEN path — fill the 6-group 의뢰서 → pay (Toss test) → request stored **SUBMITTED**.
- **F022** PHONE path — booking calendar (slot + 이름·연락처·한 줄 메모) → Consultation stored **REQUESTED**, no upfront payment.
- **F023** Both paths produce the **same `CustomRequest.form` shape** (unit-verified).

## 2. The 6-group form (single source of truth) — web-brief §4 "공통 의뢰서 양식"
Defined once as `CUSTOM_FORM_GROUPS` in `src/lib/customRequest.ts`; the phone script == the web form (brief).
Answers are free text (the groups are conversation prompts), so each group is an object of optional string fields.
Both paths normalize into this exact shape — PHONE leaves most fields blank (filled live during the call).

1. **protagonist** 주인공 아이 — name·nickname·ageGender·appearance·personality·currentlyInto·habits
2. **people** 함께하는 사람들 — relationToChild·familyToInclude·siblings
3. **motivation** ★ 이 책의 계기와 마음 — occasion·messageToConvey·specialEpisode  *(★ = full-custom core)*
4. **direction** 이야기 방향 — mood·references·avoid
5. **expression** 표현 취향 (선택·위임 가능) — writingStyle·illustrationMood·delegateToExpert
6. **practical** 실무 정보 — desiredCompletionDate·recipientShipping·contact·preferredCallTime

`form` shape: `{ version: 1, groups: { protagonist:{…}, people:{…}, motivation:{…}, direction:{…}, expression:{…}, practical:{…} } }`.
Every group key + field key is present for both paths (values may be ""), which is what makes input homogeneous (F023).

## 3. Architecture (files — strictly within the track's allowed scope)
- `src/lib/customRequest.ts` — **domain core, no DB, no network**:
  - `CUSTOM_FORM_GROUPS` (the 6-group schema, single source of truth) + `CUSTOM_PRICE_WON = 119000`.
  - Types: `CustomForm`, `CustomPath = "PHONE"|"WRITTEN"`, `CustomStatus`, `ConsultationStatus`, `StoredCustomRequest`.
  - `buildCustomForm(rawAnswers)` — normalize untrusted answers (either path) into the canonical `CustomForm` shape.
  - `buildPhoneIntake({...})` / `buildWrittenIntake({...})` — assemble a `StoredCustomRequest` (+ Consultation for PHONE).
  - `zod` validators for the minimal required fields (protagonist.name, contact name+phone; PHONE also a slot).
  - **In-memory repository** (`customRequestStore`) cached on `globalThis` (mirrors `db.ts`'s singleton pattern):
    `create / get / markSubmitted`. This is the hermetic store for dev/E2E (D1).
- `src/app/custom/page.tsx` — F020 landing (server component) + `page.module.css`.
- `src/app/custom/written/` — the 6-group form (client component) + a pay step + `page.module.css`.
- `src/app/custom/phone/` — booking calendar + minimal form (client component) + `page.module.css`.
- `src/app/custom/complete/[id]/page.tsx` — shared confirmation (server component) reads the store, shows status.
- `src/app/api/custom/` — Route Handlers: `written/route.ts` (create→checkout), `written/confirm/route.ts`
  (settle via Toss test transport → SUBMITTED), `phone/route.ts` (create Consultation REQUESTED).
- Tests: `tests/unit/custom-request.test.ts` (F023 + builders/validators), `tests/e2e/custom-landing|written|phone.spec.ts`.

### Data flow
- **WRITTEN:** form (client) → `POST /api/custom/written` (validate `untrusted()` → build form → store `PENDING_PAYMENT`
  → `payments.createCheckout` test checkout → return `{id, checkout}`) → pay step (test/sandbox) →
  `POST /api/custom/written/confirm` (`payments.confirm` via sandbox transport → PAID → `markSubmitted`) →
  redirect `/custom/complete/[id]` showing **SUBMITTED**.
- **PHONE:** calendar+form (client) → `POST /api/custom/phone` (validate `untrusted()` → build form + Consultation
  REQUESTED, **no payment**) → redirect `/custom/complete/[id]` showing **REQUESTED · 결제는 상담 후**.

## 4. Autonomous decisions (rationale)
- **D1 — Persistence = in-memory repo on `globalThis`; Prisma is the documented production seam.**
  ADR-0002 keeps the verifiable path DB-independent; Playwright boots only `pnpm dev` (no Postgres); `db.ts` is
  lazy and throws without a real DB. A module-level store gives *real, verifiable* storage within the dev/E2E
  process (submit → confirmation reads it back in one run). The Prisma models already exist
  (`CustomRequest`/`Consultation` in `schema.prisma`); wiring them is a thin adapter behind the same store
  interface — recorded here so "no real DB in E2E" is an explicit, traceable choice, exactly as F003/F004 did.
- **D2 — WRITTEN payment exercises `PaymentProvider` (createCheckout + confirm) with a sandbox transport in non-production.**
  ADR-0010 made `confirm()`'s transport injectable precisely so tests stay hermetic and *rejected* hitting real
  Toss. `createCheckout` is pure. In dev/E2E (`APP_ENV !== "production"`) the confirm route uses a sandbox transport
  mapping a test paymentKey → `DONE` → PAID. In production it uses `tossFromEnv` (real `fetch`). Hard-gated:
  the stub is impossible when `APP_ENV === "production"`. This genuinely integrates the payments lib (bonus
  transitive coverage of F003) and stays test/sandbox-only per ADR-0004.
- **D3 — PHONE booking stores Consultation REQUESTED with NO approval gate and NO payment.**
  The brief's irreversible action is "상담 예약 **확정** (고객 대면 약속 생성)" = the operator flipping
  REQUESTED→CONFIRMED (a backstage commitment), which is what `requireApproval("consultation.book")` guards.
  A customer *request* (REQUESTED, free, pay-after-call) is not that confirm step. F022 explicitly says
  "stored REQUESTED; no upfront payment." Gating REQUESTED would block the buyer flow and misread the brief.
- **D4 — One shared 6-group shape (`CUSTOM_FORM_GROUPS`) for both paths (F023).** Both normalize into the
  identical shape; PHONE leaves fields blank (filled during the call). Unit test asserts shape identity.
- **D5 — Trust boundary: all form/booking input wrapped with `untrusted()` (AGENTS hard-constraint #6).**
  "Import src/lib/payments only" governs *track/in-flight* libs; `guardrails.untrusted()` is a cross-cutting
  safety primitive required project-wide (the content track imported it too). Recorded as a deliberate reading.
- **D6 — Photo/appearance is text-only here; real photo/QR Asset upload is out of this track.**
  `Asset` storage is F029/mypage scope and outside the allowed file list. The written form takes a text
  appearance description and notes that photos are added later — deferred explicitly, not silently dropped.
- **D7 — UI follows Atelier Sans tokens; reuse `Nav`/`Footer`/`CtaLink`/`SectionHeader`; CSS Modules per page;
  server components except the interactive form/calendar (`"use client"`).** No box-shadow, no pure #fff/#000,
  radius 0 (R6/R7).
- **D8 — Isolated worktree off master (`gpcs-custom`).** The main checkout has the concurrent category track's
  uncommitted WIP; per the runbook, each track works in its own worktree. Keeps both tracks safe and disjoint.

## 5. Error handling
- Invalid/empty required fields → 400 from the API + inline client error (role="alert"); never a fake success.
- Payment confirm not PAID → stay un-SUBMITTED, show an honest failure message (no phantom SUBMITTED).
- Unknown `/custom/complete/[id]` → honest "not found" (no fabricated record).
- All external input tagged `untrusted()` at the boundary; never logged (no `console.*(process.env…)`, R2).

## 6. Testing strategy
- **Unit (`custom-request.test.ts`, F023 + core):** `CUSTOM_FORM_GROUPS` has exactly the 6 groups/fields; WRITTEN
  and PHONE inputs `buildCustomForm` to the *same* shape (same keys); validators reject missing required fields;
  the in-memory store create/get/markSubmitted round-trips; price = 119000.
- **E2E (Playwright, hermetic — `pnpm dev` only):**
  - `custom-landing.spec.ts` (F020): `/custom` shows both path buttons; each navigates to its flow; 375px no-overflow.
  - `custom-written.spec.ts` (F021): fill the 6-group form → test pay → confirmation shows SUBMITTED; 375px.
  - `custom-phone.spec.ts` (F022): pick a slot + name/phone/memo → confirmation shows REQUESTED, no payment; 375px.
- **Gate:** `pnpm check` green + the three E2E specs green, then an independent adversarial review (ADR-0005/F042).

## 7. Out of scope (deferred, not dropped)
- Real Postgres/Prisma persistence (production adapter behind the store interface — D1).
- Real Toss widget round-trip (sandbox transport stands in for E2E — D2).
- Photo/QR Asset upload (F029 / mypage scope — D6).
- Operator-side consultation CONFIRM (backstage; `consultation.book` approval gate — D3).
