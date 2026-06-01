# src/app — UI Agent Guide
> Nearest-wins; extends the root AGENTS.md. All UI under this tree follows **/DESIGN.md**
> (YEOBAEK BOOKS — Atelier Sans). Style via the CSS-var tokens in `globals.css` — never
> ad-hoc colors/spacing/shadows. Full system + rationale live in /DESIGN.md.

## Non-negotiable design rules (summary — /DESIGN.md is authoritative)
- **Color** — warm neutrals only (`--bg` / `--surface` / `--panel` / `--line` / `--ink`).
  Ink-navy (`--accent`) is the **only** accent and stays < 5% of the screen: one primary
  CTA, active nav, stock dot, edition number, eyebrow bar, focus ring. No pure white/black,
  no second accent, no wide navy fills. *(pure #fff/#000 blocked by check-constraints R7)*
- **Type** — grotesk (`--font-grotesk`) for structure/labels/headings/price, UPPERCASE for
  labels & nav; Pretendard (`--font-sans`) for body/UI; **serif (`--font-serif-ko`) ONLY for
  Korean book/story titles** — that contrast is the signature. ≤ 2 font weights per screen.
  Korean body: line-height 1.75, letter-spacing 0, `word-break: keep-all`.
- **Shape & depth** — `--radius` is 0 everywhere (buttons, images, inputs, tags). Build depth
  with tone steps (`surface`/`panel`) + 1px `--line` hairlines, **never `box-shadow`**.
  *(box-shadow blocked by check-constraints R6)*
- **Layout** — content max-width `--max-width`; outer `--gutter`; only hero + dark editorial
  bands go full-bleed. Asymmetric splits; product grid row-gap > col-gap.
- **Motion** — 200–700ms `--ease`, transform + opacity only (max scale 1.03); always guard
  `prefers-reduced-motion`.
- **Never build** — SALE ribbons, red prices, %/stars, countdowns, sticky promo bars,
  autoplay carousels, popups. Quiet is enforced by absence.

> Reference page (visual ground truth), when present: `designs/09-atelier-sans.html`.
