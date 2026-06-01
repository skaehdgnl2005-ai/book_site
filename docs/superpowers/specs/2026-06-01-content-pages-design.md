# TRACK-CONTENT (F024–F028) — Design Spec

> 그림책 제작소 content pages. Status: approved 2026-06-01. Branch `feat/content`
> (isolated worktree off `master`). Precondition F002 (`passing`) met.

## Goal

Ship the five static content pages from the brief (`web-brief-v1 (1).md` §6) on the
established **Atelier Sans** design system: 브랜드 스토리 (F024), 갤러리 (F025), 후기 (F026),
FAQ (F027), 문의 (F028). Each is a real, mobile-responsive page verified by its own E2E spec.

**Honesty over impressiveness** (project rule, AGENTS.md `날조 금지`): where the maker has not
yet provided real material (founder narrative, sample images, reviews, contact details, refund
policy — all flagged `추후 제공` in brief §10), the page shows an honest, visibly-flagged
placeholder with a code `TODO(Fxxx)` — never fabricated names, dates, quotes, or terms.

## Constraints (inherited, not restated per page)

- **Design SoR = DESIGN.md** (Atelier Sans). Style only via the `:root` CSS-var tokens in
  `globals.css`. Warm neutrals + single ink-navy accent (<5%); radius 0; depth via tone steps +
  1px `--line` hairlines (no `box-shadow` → R6); no pure `#fff`/`#000` (→ R7); serif
  (`--font-serif-ko`) only for KO book/story titles; KO body line-height 1.75 / `keep-all`.
- **File scope (track contract):** touch ONLY `src/app/{brand-story,gallery,reviews,faq,contact}/`,
  `src/app/_components/content/` (new), and one `tests/e2e/<page>.spec.ts` per page, plus the
  `state/passes/evidence` fields of F024–F028 in `feature_list.json` and `PROGRESS.md`.
  **Import-only** (never edit): `_components/` root kit (Nav/Footer/CtaLink/SectionHeader/
  CategoryCard), `globals.css`, `layout.tsx`, `playwright.config.ts`, and other tracks' files.
- **Styling mechanism:** new styles live in **co-located CSS Modules** (`*.module.css`) inside the
  allowed dirs, consuming global tokens via `var(--…)`. This avoids editing the off-limits
  `globals.css` and the merge-hotspot it represents.
- **No backend:** the content track has no `src/app/api`. The contact form is client-side only.

## Architecture

- **Routing.** Five App-Router routes, one `page.tsx` each. Every page renders the import-only
  kit: `<Nav/>` → `<main>` → `<Footer/>` (mirrors `src/app/page.tsx`).
- **Server vs client.** brand-story / gallery / reviews / faq are **server components** (static →
  helps the p95<2s budget). FAQ accordions use native `<details>/<summary>` (no JS). Only the
  contact **form** is a small `"use client"` component.
- **Shared sub-components** (new, in `_components/content/`): `GalleryTile`, `ReviewsEmptyState`,
  `FaqItem`, `ContactForm`. Each focused, independently testable, hairline/token-styled.
- **Linking.** Nav/Footer are F002-owned (import-only) → these pages are reachable by direct URL +
  in-page text links (e.g. brand-story CTA → `/anniversary`, FAQ → `/contact`). "Not yet in global
  nav" is a flagged TODO.

## Per-page detail

### F024 `/brand-story` — 브랜드 스토리 (honest, grounded)
Eyebrow `BRAND STORY` → lead statement grounded only in known facts: 동화책 번역가 큐레이션,
기념물(자석 외함·축하 카드), 캐릭터 일관성("개인 IP"처럼 축적), "선물 + 기록"의 정서 (brief §1/§5).
The *personal* "번역가의 시작 이야기" is a **visibly-flagged placeholder** (on-page muted "준비 중"
note + `TODO(F024)`), no invented biography. Closes with `CtaLink` → `/anniversary`.

### F025 `/gallery` — 갤러리/포트폴리오 (placeholder, flagged)
Responsive grid of 4:5 **placeholder mats** (`--panel` bg, radius 0, hairline) labeled honestly
(`내지 샘플 · 준비 중`, `외함 샘플 · 준비 중`), each with `TODO(F025)` pending real assets (brief §10,
maker-provided). Honest caption that samples are in production.

### F026 `/reviews` — 후기 (honest empty state + honest beta signal)
Honest empty state ("후기 준비 중 — 첫 책들이 가족에게 도착하고 있습니다") **plus** the one real datum
from brief §5: 베타 인터뷰 **구매 예약율 80%**, explicitly framed as *early beta signal, not customer
reviews*. **Zero fabricated quotes.** Review-card grid skeleton present but renders empty/coming-soon.

### F027 `/faq` — FAQ (accordion, 5 brief topics)
Native `<details>` accordions grouped into brief §6.9 topics: **제작 기간** (주문 후 일주일 이내 /
맞춤은 양식확정·상담 후 일주일), **커스텀 범위** (119,000원; 시놉시스·문체·삽화·교훈까지; 전화/글 두 경로),
**배송** (제작 후 발송; 구체 택배사·비용 = `TODO(F027)` 준비 중), **사진·영상 업로드** (결제 전 선택/
건너뛰기 → 마이페이지 업로드; QR 옵션), **환불** (no policy exists → honest flagged answer: 제작 착수
후에는 개인화 특성상 제한될 수 있어 정확한 정책 안내 준비 중 — 문의 바랍니다; `TODO(F027)`). No invented terms.

### F028 `/contact` — 문의 (channels + untrusted() form)
전화·이메일 surfaced as **flagged placeholders** (`〔전화 추후 제공〕` / `〔이메일 추후 제공〕`,
`TODO(F028)`; brief §10), Instagram noted 추후 개설. Plus a client-side **문의 폼** (이름·연락처·문의
내용) that validates, **wraps captured input with `untrusted()`** (import from `src/lib/guardrails.ts`)
at the boundary, and on submit shows **honest guidance** to use the listed 전화/이메일 — no fake
"접수 완료" (no backend/mail sink). Server-action + mail = flagged TODO. No PII logged.

## Testing

One E2E spec per page in `tests/e2e/`. Each asserts: route loads; `<Nav>` brand visible; page
`<h1>`/key region renders; page-specific content:
- gallery → ≥1 placeholder tile visible;
- reviews → empty-state text + the beta-signal figure;
- faq → clicking a `<summary>` reveals its `<details>` body;
- contact → phone/email region + form fields + submit shows the honest guidance message;
and **375px → no horizontal overflow** (reuses the home spec pattern; also advances F035).

## Build loop (WIP=1 per feature, per track contract)

For each F024→F028 in order: `pnpm attempt <id>` → write the E2E spec first (TDD) → build page +
module + sub-components → `pnpm check` green **AND** `pnpm test:e2e -- <page>.spec.ts` green → set
`feature_list.json` entry `state:"passing"`/`passes:true` + dated `evidence` → `git commit` →
`pnpm attempt <id> --reset`. End: update `PROGRESS.md`, confirm `docs/clean-state-checklist.md`.

## Out of scope / explicit non-goals (YAGNI)

No edits to `globals.css`/`Nav`/`Footer`/`layout.tsx`/`playwright.config.ts` or any other track's
files. No fabricated testimonials / founder bio / refund terms / contact details. No backend/API
route. No global-nav links (Nav is F002-owned). All gaps are visible, flagged TODOs.
