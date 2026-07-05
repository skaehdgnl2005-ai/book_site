import type { CSSProperties } from "react";
import styles from "./TypographicCover.module.css";

// Typographic cover — the default "책 표지" for catalog/gallery mats while the real
// photography waits on the backstage pipeline. Pure display: a --panel mat with a 1px
// --line hairline (radius 0), a centered title — serif ONLY when it is a real 책 제목
// (variant "title", the DESIGN.md signature; serif is forbidden anywhere else), grotesk
// for non-title text like gallery plate labels (variant "label") — an optional edition
// number (navy — omit when the host card already shows No. outside the mat; never
// duplicate), and a bottom English kicker (microLabel).
// Restraint by construction: no gradients, no icons, no ornament — type + whitespace only.
// aria-hidden: the hosts (TemplateCard title / GalleryTile caption) carry the visible,
// announced text; the mat is decorative, like the empty mat it replaces.
export function TypographicCover({
  title,
  variant = "title",
  kicker,
  edition,
  aspectRatio,
}: {
  /**
   * Centered text, verbatim. variant "title": a real 책/이야기 제목 (caller decides
   * 겹낫표 「」/『』). variant "label": any non-title text (e.g. 내지/외함 plate names).
   */
  title: string;
  /** "title" = serif 책 제목 (default); "label" = grotesk, for non-book-title text. */
  variant?: "title" | "label";
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
      <span className={variant === "label" ? styles.label : styles.title}>
        {title}
      </span>
      {kicker ? <span className={styles.kicker}>{kicker}</span> : null}
    </span>
  );
}
