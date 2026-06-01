# TRACK-CONTENT (F024–F028) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five 그림책 제작소 content pages (브랜드 스토리·갤러리·후기·FAQ·문의) on the
Atelier Sans system, each verified by its own Playwright E2E spec.

**Architecture:** App-Router routes under `src/app/<page>/page.tsx`; static server components
except the contact form (`"use client"`). Reuse the import-only `_components` kit + global
`globals.css` classes; new styles in co-located CSS Modules using `:root` tokens; new shared
sub-components in `src/app/_components/content/`. Honest, flagged placeholders for unprovided
material (날조 금지).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5 (strict, `noUnusedLocals`),
CSS Modules, Playwright. Path alias `@/* → ./src/*`. ESLint flat config (`no-unused-vars` error).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/brand-story/page.tsx` + `.module.css` | F024 founder/brand narrative (grounded + flagged TODO) |
| `src/app/gallery/page.tsx` + `.module.css` | F025 placeholder sample grid |
| `src/app/_components/content/GalleryTile.tsx` | reusable placeholder mat (4:5, panel, hairline) |
| `src/app/reviews/page.tsx` + `.module.css` | F026 honest empty state + beta signal |
| `src/app/faq/page.tsx` + `.module.css` | F027 accordion FAQ (5 topics) |
| `src/app/_components/content/FaqItem.tsx` | one `<details>/<summary>` Q&A |
| `src/app/contact/page.tsx` + `.module.css` | F028 channels + form |
| `src/app/contact/inquiry.ts` | `captureInquiry()` — tags form input `untrusted()` at the boundary |
| `src/app/_components/content/ContactForm.tsx` + `.module.css` | client form (validate → tag → honest guidance) |
| `tests/e2e/{brand-story,gallery,reviews,faq,contact}.spec.ts` | one E2E gate per page |

**Shared conventions (all pages):** render `<Nav/>` → `<main>` → `<Footer/>` like
`src/app/page.tsx`. Use global classes `section`, `eyebrow`, `cta` where they fit; add only
net-new CSS in the page/component module. Every module rule uses tokens (`var(--…)`) — no
`box-shadow` (R6), no `#fff`/`#000` (R7).

## Per-feature loop (apply to every Task below)

1. `pnpm attempt <id>` (from the worktree).
2. Write the E2E spec first; run it → confirm it FAILS (route 404).
3. Build the page (+ module + sub-components).
4. `pnpm check` → green (lint + typecheck + vitest + constraints).
5. `pnpm test:e2e -- <page>.spec.ts` → green.
6. Set `feature_list.json` `<id>` → `state:"passing"`, `passes:true`, dated `evidence`.
7. `git commit` (descriptive). `pnpm attempt <id> --reset`.

> All commands run with `cd c:\dev\test1-content;` prefix (shell cwd resets each call).

---

### Task 1 (F024): `/brand-story` — 브랜드 스토리

**Files:** Create `src/app/brand-story/page.tsx`, `src/app/brand-story/page.module.css`,
`tests/e2e/brand-story.spec.ts`.

- [ ] **Step 1 — failing test** (`tests/e2e/brand-story.spec.ts`):
```ts
import { test, expect } from "@playwright/test";

test.describe("brand-story (브랜드 스토리)", () => {
  test("renders nav, heading, grounded narrative, CTA", async ({ page }) => {
    await page.goto("/brand-story");
    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /브랜드 스토리/ })).toBeVisible();
    await expect(page.getByText(/번역가/)).toBeVisible();           // grounded fact
    await expect(page.getByText(/준비 중/)).toBeVisible();          // honest flagged placeholder
    await expect(page.getByRole("link", { name: "내 아이의 책 만들기" })).toBeVisible();
  });
  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/brand-story");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });
});
```
- [ ] **Step 2 — run, expect FAIL:** `cd c:\dev\test1-content; pnpm test:e2e -- brand-story.spec.ts` → fails (404 / no h1).
- [ ] **Step 3 — page** (`src/app/brand-story/page.tsx`). Content grounded only in brief §1/§5
  (translator-curated keepsake, character consistency, gift+record). Personal origin story = a
  visibly muted "준비 중" block + `TODO(F024)`; no invented biography. Copy (final):
  - eyebrow `BRAND STORY`; `<h1>브랜드 스토리</h1>`
  - lead: "수많은 그림책을 우리말로 옮겨 온 번역가가, 이제 한 아이의 이름으로 시작되는 단 하나의 이야기를 한 권 한 권 큐레이션합니다."
  - para: "우리는 '책'이 아니라 '기념물'을 만듭니다. 자석 외함과 축하 카드로, 아이가 책을 펼치는 순간까지 설계합니다."
  - para: "한 권 안에서 아이 캐릭터의 일관성을 지키고, 다음 책에서도 같은 캐릭터를 이어 가 아이만의 이야기를 책꽂이에 쌓아 갑니다."
  - para: "선물하는 마음과 기록하는 마음, 그 둘 다를 위한 책입니다."
  - flagged note (muted, hairline): "번역가의 시작 이야기는 곧 이 자리에 정식으로 담깁니다." + `{/* TODO(F024): real founder narrative — brief §10 추후 제공 */}`
  - `<CtaLink href="/anniversary">내 아이의 책 만들기</CtaLink>`
  Structure mirrors `page.tsx` (`<Nav/>`/`<main>`/`<Footer/>`), wraps body in `<section className="section">` + module `prose` class.
- [ ] **Step 4 — module** (`page.module.css`): `.lead` (grotesk-free statement: font-size clamp(1.3rem,3.4vw,2rem), line 1.4, color var(--ink), max-width 24ch, margin-bottom lg); `.prose p` (max-width 62ch, color var(--grey), line-height 1.75, margin 0 0 var(--space-md)); `.note` (border-top 1px var(--line), padding-top var(--space-md), margin-top var(--space-lg), color var(--muted), max-width 52ch). No shadow, no pure white/black.
- [ ] **Step 5 — gate:** `pnpm check` → green; `pnpm test:e2e -- brand-story.spec.ts` → green.
- [ ] **Step 6 — feature_list F024:** `state:"passing"`, `passes:true`, `evidence:"2026-06-01 Playwright: 2 passed (brand-story — nav/h1/grounded narrative/준비중 placeholder/CTA + 375px). pnpm check green."`
- [ ] **Step 7 — commit:** `feat(F024): 브랜드 스토리 page (grounded narrative + flagged TODO)`; then `pnpm attempt F024 --reset`.

---

### Task 2 (F025): `/gallery` — 갤러리/포트폴리오

**Files:** Create `src/app/gallery/page.tsx`, `src/app/gallery/page.module.css`,
`src/app/_components/content/GalleryTile.tsx`, `tests/e2e/gallery.spec.ts`.

- [ ] **Step 1 — failing test:**
```ts
import { test, expect } from "@playwright/test";

test.describe("gallery (갤러리)", () => {
  test("renders nav, heading, and placeholder sample tiles", async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /갤러리/ })).toBeVisible();
    const tiles = page.getByTestId("gallery-tile");
    expect(await tiles.count()).toBeGreaterThan(0);
    await expect(tiles.first()).toContainText(/준비 중/);          // honest placeholder
  });
  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/gallery");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });
});
```
- [ ] **Step 2 — FAIL:** `pnpm test:e2e -- gallery.spec.ts`.
- [ ] **Step 3 — GalleryTile** (`_components/content/GalleryTile.tsx`): props `{ label: string }`; renders
  `<figure data-testid="gallery-tile" className={styles.tile}><span className={styles.mat} aria-hidden /><figcaption className={styles.cap}>{label} · 준비 중</figcaption></figure>`.
- [ ] **Step 4 — page** (`gallery/page.tsx`): eyebrow `GALLERY`; `<h1>갤러리</h1>`; caption
  "샘플 책의 내지와 외함입니다. 실제 이미지는 제작 중이며 곧 공개됩니다."; grid of 6 tiles alternating
  labels "내지 샘플"/"외함 샘플"; `{/* TODO(F025): replace with real 내지/외함 assets — brief §10 */}`.
- [ ] **Step 5 — modules:** page `.grid` (display grid; grid-template-columns 1fr; gap var(--grid-row); @min-width 720px → repeat(3,1fr) + column-gap var(--grid-col)); GalleryTile `.tile` (margin 0), `.mat` (aspect-ratio 4/5, background var(--panel), border 1px var(--line)), `.cap` (font grotesk, font-size .7rem, letter-spacing .16em, text-transform uppercase, color var(--muted), margin-top var(--space-sm)).
- [ ] **Step 6 — gate / Step 7 — feature_list F025** (`evidence:"2026-06-01 Playwright: 2 passed (gallery — 6 placeholder tiles flagged 준비중 + 375px). pnpm check green."`) **/ commit** `feat(F025): 갤러리 page (flagged placeholder tiles)` + attempt reset.

---

### Task 3 (F026): `/reviews` — 후기

**Files:** Create `src/app/reviews/page.tsx`, `src/app/reviews/page.module.css`,
`tests/e2e/reviews.spec.ts`.

- [ ] **Step 1 — failing test:**
```ts
import { test, expect } from "@playwright/test";

test.describe("reviews (후기)", () => {
  test("renders honest empty state and honest beta signal (no fabricated quotes)", async ({ page }) => {
    await page.goto("/reviews");
    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /후기/ })).toBeVisible();
    await expect(page.getByText(/후기.*준비 중|준비 중/)).toBeVisible();   // empty state
    await expect(page.getByText(/베타/)).toBeVisible();                  // honest beta signal
    await expect(page.getByText(/80%/)).toBeVisible();
  });
  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/reviews");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });
});
```
- [ ] **Step 2 — FAIL.**
- [ ] **Step 3 — page** (`reviews/page.tsx`): eyebrow `REVIEWS`; `<h1>후기</h1>`;
  empty state (module `.empty`): "후기는 준비 중입니다. 첫 책들이 가족에게 도착하고 있어요. 받아 보신 분들의 이야기를 이곳에 정직하게 모아 두겠습니다.";
  honest beta signal block (module `.stat`): big "80%" (grotesk) + label "베타 인터뷰 구매 예약율" + caption "정식 고객 후기가 아닌, 초기 베타 참여자의 반응입니다." ; `{/* TODO(F026): real customer reviews once collected — no fabrication */}`. **No fake testimonials.**
- [ ] **Step 4 — module:** `.empty` (max-width 52ch, color var(--grey), line-height 1.75); `.stat` (border 1px var(--line), background var(--surface), padding var(--space-lg) var(--space-md), max-width 22rem); `.statNum` (font grotesk, font-weight 600, font-size clamp(2.4rem,7vw,3.6rem), color var(--accent)); `.statLabel` (grotesk uppercase .7rem, letter-spacing .16em, color var(--muted)); `.statCap` (.85rem, color var(--grey)).
- [ ] **Step 5/6/7 — gate / feature_list F026** (`evidence:"2026-06-01 Playwright: 2 passed (reviews — honest empty state + framed beta 80% signal, no fabricated quotes + 375px). pnpm check green."`) **/ commit** `feat(F026): 후기 page (honest empty state + beta signal)` + attempt reset.

---

### Task 4 (F027): `/faq` — FAQ

**Files:** Create `src/app/faq/page.tsx`, `src/app/faq/page.module.css`,
`src/app/_components/content/FaqItem.tsx`, `tests/e2e/faq.spec.ts`.

- [ ] **Step 1 — failing test** (asserts accordion reveal):
```ts
import { test, expect } from "@playwright/test";

test.describe("faq (자주 묻는 질문)", () => {
  test("renders grouped Q&A; a summary expands its answer", async ({ page }) => {
    await page.goto("/faq");
    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /자주 묻는 질문|FAQ/ })).toBeVisible();
    const q = page.getByRole("group").filter({ hasText: "제작 기간" });
    const answer = q.getByText(/일주일 이내/);
    await expect(answer).toBeHidden();                 // collapsed by default
    await q.getByText("제작 기간은 얼마나 걸리나요?").click();
    await expect(answer).toBeVisible();                // revealed
    await expect(page.getByText(/환불/)).toBeVisible(); // refund topic present
  });
  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/faq");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });
});
```
- [ ] **Step 2 — FAIL.**
- [ ] **Step 3 — FaqItem** (`_components/content/FaqItem.tsx`): props `{ q: string; children: ReactNode }`;
  renders `<details className={styles.item}><summary className={styles.q}>{q}</summary><div className={styles.a}>{children}</div></details>`. (`<details>` exposes role "group"; native, no JS.)
- [ ] **Step 4 — page** (`faq/page.tsx`): eyebrow `FAQ`; `<h1>자주 묻는 질문</h1>`; five `FaqItem`s
  with answers grounded in brief (§4/§6). Final copy:
  1. q "제작 기간은 얼마나 걸리나요?" a "기념일·첫 순간들 라인은 주문 후 일주일 이내에 제작해 보내 드립니다. 맞춤 제작은 양식 확정 또는 상담 완료 후 일주일 이내입니다."
  2. q "맞춤 제작은 어디까지 가능한가요?" a "맞춤 제작(119,000원)은 시놉시스·문체·삽화·교훈까지 1:1 상담으로 100% 풀 커스텀합니다. 전화 상담 예약과 글 작성 두 경로 중에 고르실 수 있고, 두 경로 모두 같은 양식을 사용합니다."
  3. q "배송은 어떻게 되나요?" a "주문하신 책을 제작한 뒤 받는 분 주소로 보내 드립니다. 택배사·배송비 등 자세한 배송 안내는 준비 중입니다." `{/* TODO(F027): shipping carrier/fee once finalized */}`
  4. q "사진과 영상은 어떻게 올리나요?" a "아이 사진은 결제 전에 올리거나 '나중에 올리기'로 건너뛸 수 있고, 건너뛰면 결제 후 마이페이지에서 올리시면 됩니다. QR 영상 인사 메시지는 선택 옵션으로, 추가하신 경우 마이페이지에서 올립니다."
  5. q "환불이 되나요?" a "주문하신 책은 아이만을 위해 새로 만드는 개인화 상품이라, 제작이 시작된 뒤에는 환불이 어려울 수 있습니다. 정확한 환불 정책은 안내를 준비하고 있으니, 자세한 내용은 문의 주시면 도와 드리겠습니다." `{/* TODO(F027): exact refund policy — none specified in brief; do NOT invent */}`
  Closing line linking to contact: `<p>더 궁금한 점은 <Link href="/contact">문의 페이지</Link>로 남겨 주세요.</p>`
- [ ] **Step 5 — module:** `.item` (border-top 1px var(--line); last → border-bottom too); `.q` (list-style none, cursor pointer, font grotesk, font-weight 500, padding var(--space-md) 0, color var(--ink); `::-webkit-details-marker { display:none }`); `.a` (color var(--grey), line-height 1.75, padding 0 0 var(--space-md); max-width 62ch). `details[open] .q` color var(--accent).
- [ ] **Step 6/7 — gate / feature_list F027** (`evidence:"2026-06-01 Playwright: 2 passed (faq — 5 grouped Q&A incl. 환불, accordion reveal verified + 375px). pnpm check green."`) **/ commit** `feat(F027): FAQ accordion (제작기간·커스텀·배송·업로드·환불)` + attempt reset.

---

### Task 5 (F028): `/contact` — 문의

**Files:** Create `src/app/contact/page.tsx`, `src/app/contact/page.module.css`,
`src/app/contact/inquiry.ts`, `src/app/_components/content/ContactForm.tsx`,
`src/app/_components/content/ContactForm.module.css`, `tests/e2e/contact.spec.ts`.

- [ ] **Step 1 — failing test:**
```ts
import { test, expect } from "@playwright/test";

test.describe("contact (문의)", () => {
  test("shows channels + a form that submits to honest guidance (no fake receipt)", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByRole("link", { name: "그림책 제작소" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /문의/ })).toBeVisible();
    await expect(page.getByText(/전화/)).toBeVisible();
    await expect(page.getByText(/이메일/)).toBeVisible();
    await page.getByLabel("이름").fill("김부모");
    await page.getByLabel("연락처").fill("test@example.com");
    await page.getByLabel("문의 내용").fill("돌 기념 책 문의드려요.");
    await page.getByRole("button", { name: "보내기" }).click();
    await expect(page.getByText(/전화·이메일|전화나 이메일|가장 빠른/)).toBeVisible(); // honest guidance
  });
  test("empty submit is blocked with an error", async ({ page }) => {
    await page.goto("/contact");
    await page.getByRole("button", { name: "보내기" }).click();
    await expect(page.getByText(/입력해 주세요/)).toBeVisible();
  });
  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/contact");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });
});
```
- [ ] **Step 2 — FAIL.**
- [ ] **Step 3 — inquiry.ts** (trust boundary, no sink):
```ts
import { untrusted, type Tagged } from "@/lib/guardrails";

export interface Inquiry { name: string; contact: string; message: string; }

/** Tag buyer-supplied contact input at the trust boundary (E4). No backend/mail
 *  sink yet — callers must NOT claim receipt; guide users to phone/email instead. */
export function captureInquiry(raw: Inquiry): Tagged<Inquiry> {
  return untrusted(raw);
}
```
- [ ] **Step 4 — ContactForm.tsx** (`"use client"`; validates, tags via `captureInquiry`, uses the
  tagged value's name in an HONEST guidance message — never "접수 완료"):
```tsx
"use client";
import { useState } from "react";
import { captureInquiry } from "../../contact/inquiry";
import styles from "./ContactForm.module.css";

export function ContactForm() {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const contact = String(data.get("contact") ?? "").trim();
    const message = String(data.get("message") ?? "").trim();
    if (!name || !contact || !message) {
      setError("이름·연락처·문의 내용을 모두 입력해 주세요.");
      return;
    }
    const tagged = captureInquiry({ name, contact, message }); // trust boundary; untrusted
    setError(null);
    setDone(`${tagged.value.name}님, 남겨 주셔서 감사합니다. 문의 폼은 준비 중이라, 가장 빠른 답변은 위의 전화·이메일로 연락 주시는 것입니다.`);
  }

  if (done) return <p className={styles.note} role="status">{done}</p>;

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <label className={styles.field}>이름<input name="name" type="text" /></label>
      <label className={styles.field}>연락처<input name="contact" type="text" /></label>
      <label className={styles.field}>문의 내용<textarea name="message" rows={4} /></label>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <button type="submit" className="cta">보내기</button>
    </form>
  );
}
```
  > `getByLabel` works because each `<label>` wraps its control with adjacent text.
- [ ] **Step 5 — page** (`contact/page.tsx`, server component): eyebrow `CONTACT`; `<h1>문의</h1>`;
  intro "궁금한 점이 있으시면 아래로 연락 주세요."; channels list (module `.channels`):
  전화 `〔전화번호 준비 중〕`, 이메일 `〔이메일 준비 중〕`, 인스타그램 "추후 개설 예정";
  `{/* TODO(F028): real 전화/이메일 — brief §10 추후 제공 */}`; then `<ContactForm/>`.
- [ ] **Step 6 — modules:** page `.channels` (list-style none, padding 0; each row: grotesk label + value, hairline `border-top 1px var(--line)`, padding var(--space-sm) 0). ContactForm `.form` (display flex column, gap var(--space-md), max-width 32rem); `.field` (display flex column, gap var(--space-xs), font grotesk uppercase .7rem letter-spacing .14em color var(--muted)); `.field input, .field textarea` (border 0, border-bottom 1px var(--line), background transparent, padding var(--space-xs) 0, font var(--font-sans), font-size 1rem, color var(--ink); `:focus` outline none, border-bottom-color var(--accent)); `.error` (color var(--accent), font-size .85rem); `.note` (color var(--grey), line-height 1.75, max-width 40ch). Radius 0 inherited; no shadow.
- [ ] **Step 7 — gate / feature_list F028** (`evidence:"2026-06-01 Playwright: 3 passed (contact — 전화/이메일 placeholders + form: untrusted()-tagged, validation block, honest guidance no fake receipt + 375px). pnpm check green."`) **/ commit** `feat(F028): 문의 page (channels + untrusted() contact form)` + attempt reset.

---

## Finalization (after all 5 passing)

- [ ] `cd c:\dev\test1-content; pnpm check` → green; `pnpm test:e2e` (full content suite) → all green.
- [ ] Update `PROGRESS.md`: verified state (E2E count, product delivery 7/32), session log entry, Handoff next pick.
- [ ] Confirm `docs/clean-state-checklist.md`. Commit `PROGRESS.md`.
- [ ] Report final feature table + `pnpm status`. (Merge of `feat/content` → master is a separate
  step per the runbook's merge prompt; do not merge unless asked.)

## Self-Review

- **Spec coverage:** F024 brand-story ✓(T1), F025 gallery ✓(T2), F026 reviews ✓(T3), F027 faq
  ✓(T4 incl. 환불), F028 contact + untrusted() ✓(T5). Honest-placeholder policy applied on every
  gap (founder story / sample images / reviews / 전화·이메일 / 환불). 375px (F035) covered per page.
- **Placeholder scan:** product TODOs are intentional + flagged; plan steps contain real test code,
  real copy, exact commands — no "implement later".
- **Type consistency:** `captureInquiry(Inquiry): Tagged<Inquiry>` defined in inquiry.ts, consumed
  in ContactForm via `tagged.value.name`; `untrusted`/`Tagged` imported from `@/lib/guardrails`
  (verified signatures). `GalleryTile({label})`, `FaqItem({q,children})` used as defined.
