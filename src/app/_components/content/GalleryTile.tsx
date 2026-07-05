import { TypographicCover } from "../catalog/TypographicCover";
import styles from "./GalleryTile.module.css";

// F025 placeholder tile — real 내지/외함 assets still pending (brief §10 추후 제공), so
// the mat is a TypographicCover with variant="label" (grotesk plate name + "Sample"
// kicker) instead of an empty panel — NOT the serif title slot: 내지/외함 are plate
// labels, not 책 제목, and DESIGN.md reserves serif for book/story titles only.
// Honesty lives OUTSIDE the mat: the "{label} · 준비 중" caption is kept verbatim
// (the gallery E2E matches it). data-testid preserved for the E2E count.
export function GalleryTile({ label }: { label: string }) {
  // Mat text = the plate name ("내지 샘플" → "내지"): the caption below already carries
  // the full "{label} · 준비 중" line, so the mat doesn't repeat "샘플".
  const plate = label.replace(/\s*샘플\s*$/u, "") || label;
  return (
    <figure className={styles.tile} data-testid="gallery-tile">
      <TypographicCover title={plate} variant="label" kicker="Sample" />
      <figcaption className={styles.cap}>{label} · 준비 중</figcaption>
    </figure>
  );
}
