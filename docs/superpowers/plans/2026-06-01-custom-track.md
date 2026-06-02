# 맞춤 제작 (Custom) Track — Implementation Plan (F020–F023)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, this session). TDD per task.
> Spec: `docs/superpowers/specs/2026-06-01-custom-track-design.md`. Worktree `gpcs-custom`, branch `feat/custom`.
> Run all commands with `pnpm -C ../gpcs-custom …` from the main checkout, OR from inside the worktree.

**Goal:** Build the 맞춤 제작 intake — `/custom` landing (two paths) + WRITTEN (form→pay→SUBMITTED) +
PHONE (calendar→Consultation REQUESTED) — both collecting one identical 6-group request.

**Architecture:** A pure domain core (`src/lib/customRequest.ts`) owns the canonical 6-group form shape, builders,
validators, and an in-memory store on `globalThis` (hermetic; Prisma is the documented production seam). App
Router pages + Route Handlers under `src/app/custom` & `src/app/api/custom` drive the flows; payments via the
`PaymentProvider` interface with a sandbox transport in non-production.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript 5 (strict, noUnusedLocals) · zod · vitest · Playwright.

**Scope guard:** Touch ONLY `src/app/custom/`, `src/app/api/custom/`, `src/lib/customRequest.ts`,
`tests/e2e/custom-*.spec.ts`, `tests/unit/custom-request.test.ts`. Import `@/lib/payments` (+ `@/lib/guardrails`
for `untrusted()`, per AGENTS #6). DESIGN.md tokens only — no box-shadow, no #fff/#000, radius 0 (R6/R7).

---

### Task 1: Domain core — `src/lib/customRequest.ts` (underpins F023, F021, F022)

**Files:** Create `src/lib/customRequest.ts`; Test `tests/unit/custom-request.test.ts`.

Public API:
- `CUSTOM_PRICE_WON = 119000`
- `CUSTOM_FORM_GROUPS`: ordered array of `{ key, title, fields: {key,label}[] }` — the 6 groups (§2 of spec).
- `type CustomForm = { version: 1; groups: Record<GroupKey, Record<string,string>> }`
- `type CustomPath = "PHONE" | "WRITTEN"`, `type CustomStatus = "PENDING_PAYMENT"|"SUBMITTED"|...`,
  `type ConsultationStatus = "REQUESTED"|...`
- `buildCustomForm(rawAnswers: Record<string, unknown>): CustomForm` — normalize untrusted answers into the
  canonical shape: every group key + field key present (missing → `""`), values coerced to trimmed strings,
  `expression.delegateToExpert` kept as a string flag. Path-agnostic → identical shape for both paths (F023).
- `buildWrittenIntake(input): StoredCustomRequest` and `buildPhoneIntake(input): StoredCustomRequest`
  (PHONE also sets `consultation: { requestedSlot, status:"REQUESTED", note }`).
- validators (zod): `validateWrittenInput`, `validatePhoneInput` → `{ ok:true, value } | { ok:false, errors }`.
- `customRequestStore`: `{ create(rec), get(id), markSubmitted(id) }` over a `Map` cached on `globalThis`
  (mirror `db.ts` pattern). `create` assigns an `id` (timestamp+counter+random-free deterministic-ish:
  use `cr_` + incrementing counter + base36 of a per-process seed) — IDs only need to be unique within the run.

- [ ] **Step 1: Write failing unit tests** (`tests/unit/custom-request.test.ts`) covering:
  - `CUSTOM_FORM_GROUPS` has exactly 6 groups with keys `["protagonist","people","motivation","direction","expression","practical"]`, each with ≥1 field; titles are the Korean group names.
  - `buildCustomForm({...written answers...})` and `buildCustomForm({...phone partial...})` produce objects whose `JSON.stringify(Object.keys(form.groups))` and per-group field-key sets are **identical** (the F023 invariant), differing only in values.
  - `buildCustomForm` trims values and fills missing fields with `""`; ignores unknown keys; never throws on junk input.
  - `validateWrittenInput` rejects empty protagonist name / missing contact; accepts a minimal valid payload.
  - `validatePhoneInput` rejects missing slot / contact; accepts a minimal valid payload.
  - `customRequestStore.create` → `get` round-trips; `markSubmitted` flips status `PENDING_PAYMENT`→`SUBMITTED`; `get` unknown id → `undefined`.
  - `CUSTOM_PRICE_WON === 119000`.
- [ ] **Step 2: Run, verify RED.** `pnpm -C ../gpcs-custom test -- custom-request.test.ts` → fails (module/exports missing).
- [ ] **Step 3: Implement `src/lib/customRequest.ts`** to satisfy the tests (pure; `globalThis` store; zod; no DB/network; no `console`).
- [ ] **Step 4: Run, verify GREEN.** Same command → all pass.
- [ ] **Step 5: Commit** `feat(F023): shared 6-group CustomRequest core + in-memory store (TDD)`.

### Task 2: F020 — `/custom` landing

**Files:** Create `src/app/custom/page.tsx`, `src/app/custom/page.module.css`; Test `tests/e2e/custom-landing.spec.ts`.

Page (server component): `Nav` + `main` with eyebrow "Full custom", `<h1>맞춤 제작</h1>`, price 119,000원, base
inclusions copy, then **two side-by-side path cards/links**: `링크 → /custom/phone` "전화로 상담 예약하기" and
`링크 → /custom/written` "직접 작성하기" (use `getByRole("link")`-friendly markup; data-testid="custom-paths"
wrapper). `Footer`. Tokens-only CSS (hairline cards, radius 0).

- [ ] **Step 1:** Write `tests/e2e/custom-landing.spec.ts`: `/custom` shows brand link, `<h1>` 맞춤 제작, both path
  links visible (scoped to `getByTestId("custom-paths")`), 119,000 visible; clicking each link lands on
  `/custom/phone` and `/custom/written` (assert URL + that page's `<h1>`); 375px no-overflow test.
- [ ] **Step 2:** Run `pnpm -C ../gpcs-custom test:e2e -- custom-landing.spec.ts` → RED (404/no page; phone/written not built yet → keep nav assertions minimal until Task 3/4, or stub phone/written `<h1>` here). *Build order note:* implement landing + minimal phone/written page stubs (just `Nav`+`<h1>`) so routing asserts pass, then flesh them out in Tasks 3–4.
- [ ] **Step 3:** Implement `src/app/custom/page.tsx` + module CSS + minimal `written/page.tsx` & `phone/page.tsx` `<h1>` stubs.
- [ ] **Step 4:** Run → GREEN.
- [ ] **Step 5:** Commit `feat(F020): 맞춤 제작 landing — two path routes`.

### Task 3: F021 — WRITTEN path (form → pay → SUBMITTED)

**Files:** Create `src/app/custom/written/page.tsx` (client form), `written/page.module.css`,
`src/app/custom/complete/[id]/page.tsx` (+ module CSS), `src/app/api/custom/written/route.ts`,
`src/app/api/custom/written/confirm/route.ts`; Test `tests/e2e/custom-written.spec.ts`.

- API `POST /api/custom/written`: parse JSON → `untrusted()` → `validateWrittenInput` (400 on fail) →
  `buildWrittenIntake` → `customRequestStore.create` (status PENDING_PAYMENT) → `payments` `createCheckout`
  ({orderId:id, amount:CUSTOM_PRICE_WON, orderName:"맞춤 제작 그림책", successUrl, failUrl}) → 200 `{ id, checkout }`.
- API `POST /api/custom/written/confirm`: parse `{ id, paymentKey }` → build a Toss provider with a **sandbox
  transport** when `process.env.APP_ENV !== "production"` (maps test paymentKey → `{status:"DONE"}`); in prod use
  `tossFromEnv(process.env)` (real fetch) → `provider.confirm({paymentKey, orderId:id, amount:CUSTOM_PRICE_WON})`
  → if `PAID` `markSubmitted(id)` and 200 `{ status:"SUBMITTED", id }`; else 402 `{ status }`. (Helper
  `customTossProvider()` lives in `customRequest.ts` to keep the route thin and the import surface = payments.)
- Written page (client): the 6 groups rendered from `CUSTOM_FORM_GROUPS` (labels), a few required fields
  (protagonist 이름, contact 이름·연락처) marked required; on submit → POST written → on 200, show a **pay step**
  (test/sandbox affordance button "결제하기 (테스트)") → POST confirm with a fixed test paymentKey
  `test_pay_written` → on SUBMITTED, `router.push("/custom/complete/"+id)`. Empty-required submit → inline error.
- Complete page (server, `params: Promise<{id}>`): `await params`, `customRequestStore.get(id)`; if missing →
  honest "접수 내역을 찾을 수 없습니다"; else show path, **status** (SUBMITTED / REQUESTED), 접수번호 id, and for
  PHONE the slot + "결제는 상담 후" note.

- [ ] **Step 1:** Write `tests/e2e/custom-written.spec.ts`: goto `/custom/written`; fill 이름/contact fields;
  click submit → pay step appears; click "결제하기 (테스트)"; assert lands on `/custom/complete/...` and shows
  "SUBMITTED" (and 접수번호); plus an empty-submit-blocked assertion and 375px no-overflow.
- [ ] **Step 2:** Run `pnpm -C ../gpcs-custom test:e2e -- custom-written.spec.ts` → RED.
- [ ] **Step 3:** Implement the two API routes, the written client page, and the complete page (replace the Task-2 stub).
- [ ] **Step 4:** Run → GREEN. Also re-run `custom-landing.spec.ts` (routing still green).
- [ ] **Step 5:** Commit `feat(F021): WRITTEN custom request — 6-group form → Toss test pay → SUBMITTED`.

### Task 4: F022 — PHONE path (calendar → Consultation REQUESTED)

**Files:** Create `src/app/custom/phone/page.tsx` (client), `phone/page.module.css`,
`src/app/api/custom/phone/route.ts`; Test `tests/e2e/custom-phone.spec.ts`. (Reuses `complete/[id]`.)

- API `POST /api/custom/phone`: parse `{ slot, name, phone, memo }` → `untrusted()` → `validatePhoneInput`
  (400 on fail) → `buildPhoneIntake` (form via `buildCustomForm` with practical.preferredCallTime=slot,
  protagonist.name from name if given; Consultation REQUESTED, note=memo) → `customRequestStore.create`
  (status SUBMITTED for the request record itself; the *Consultation* is REQUESTED — no payment) → 200 `{ id }`.
  **No `requireApproval`** (REQUESTED ≠ the irreversible confirm — D3; comment this explicitly).
- Phone page (client): a simple **booking calendar** — render the next N selectable slots as radio buttons /
  buttons (computed from `new Date()` at render; group label "예약 가능 시간"); a minimal form (이름, 연락처,
  한 줄 메모). On submit → POST phone → `router.push("/custom/complete/"+id)`. Empty required → inline error.

- [ ] **Step 1:** Write `tests/e2e/custom-phone.spec.ts`: goto `/custom/phone`; pick the first slot
  (`getByTestId("slot").first()` or first slot radio); fill 이름/연락처/메모; submit → lands on
  `/custom/complete/...` showing "REQUESTED" and a "상담 후 결제" note; empty-submit blocked; 375px no-overflow.
- [ ] **Step 2:** Run `pnpm -C ../gpcs-custom test:e2e -- custom-phone.spec.ts` → RED.
- [ ] **Step 3:** Implement the phone API route + phone client page (replace the Task-2 stub).
- [ ] **Step 4:** Run → GREEN.
- [ ] **Step 5:** Commit `feat(F022): PHONE custom path — booking calendar → Consultation REQUESTED (no upfront pay)`.

### Task 5: Gate, review, state

- [ ] **Step 1:** Full gate: `pnpm -C ../gpcs-custom check` (lint+typecheck+unit+constraints) → green;
  `pnpm -C ../gpcs-custom test:e2e -- custom-landing.spec.ts custom-written.spec.ts custom-phone.spec.ts` → green.
- [ ] **Step 2:** Independent adversarial review (ADR-0005/F042) — multi-dimension (correctness, safety/PII,
  trust-boundary, DESIGN R6/R7, scope-leak, F023 shape-identity). Fix every real finding; record dismissals.
- [ ] **Step 3:** Update `feature_list.json` F020–F022 → `state:"passing"`, `passes:true`, dated `evidence`;
  F023 → `passing`+`passes:true`+`evidence`+`e2e_via:["F021","F022"]` (R8). Edit only state/passes/evidence/e2e_via.
- [ ] **Step 4:** Update `PROGRESS.md` (session log + Handoff + verified state) and append `DECISIONS.md` ADR-0011
  (D1–D3 seams). `pnpm -C ../gpcs-custom attempt <id> --reset` for each passed feature.
- [ ] **Step 5:** Commit `chore(custom): mark F020–F023 passing + PROGRESS/DECISIONS`. Final `pnpm check` green.

## Self-review
- **Spec coverage:** F020→T2, F021→T3, F022→T4, F023→T1; 6-group shape→T1; payments seam→T3; consultation gate→T4(D3); persistence seam→T1(D1). ✓
- **Placeholder scan:** none — each task names exact files, commands, and concrete assertions. ✓
- **Type consistency:** `CustomForm`/`CUSTOM_FORM_GROUPS`/`customRequestStore`/`buildCustomForm`/`build{Written,Phone}Intake`/`validate{Written,Phone}Input`/`CUSTOM_PRICE_WON`/`customTossProvider` used consistently across T1/T3/T4. ✓
