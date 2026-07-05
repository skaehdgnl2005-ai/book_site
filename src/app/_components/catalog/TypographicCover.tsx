import type { CSSProperties } from "react";
import styles from "./TypographicCover.module.css";

// Typographic cover — the default "책 표지" for catalog/gallery mats while the real
// photography waits on the backstage pipeline. Pure display: a --panel mat with a 1px
// --line hairline (radius 0), a centered serif 책 제목 (the ONLY serif — DESIGN.md
// signature), an optional edition number (navy — omit when the host card already shows
// No. outside the mat; never duplicate), and a bottom English kicker (microLabel).
// Restraint by construction: no gradients, no icons, no ornament — type + whitespace only.
// aria-hidden: the hosts (TemplateCard title / GalleryTile caption) carry the visible,
// announced text; the mat is decorative, like the empty mat it replaces.
export function TypographicCover({
  title,
  kicker,
  edition,
  aspectRatio,
}: {
  /** Serif book title, verbatim (caller decides 겹낫표 「」/『』). */
  title: string;
  /** English microLabel at the mat's foot (uppercased by CSS). */
  kicker?: string;
  /** e.g. "No. 01" — omit when the host card already shows the number. */
  edition?: string;
  /** CSS aspect-ratio, default 4 / 5. Set as --cover-aspect so a host's media query can override. */
  aspectRatio?: string;
}) {
  const style = aspectRatio
    ? ({ "--cover-aspect": aspectRatio } as CSSProperties)
    : undefined;
  return (
    <span className={styles.cover} style={style} aria-hidden="true">
      {edition ? <span className={styles.edition}>{edition}</span> : null}
      <span className={styles.title}>{title}</span>
      {kicker ? <span className={styles.kicker}>{kicker}</span> : null}
    </span>
  );
}
