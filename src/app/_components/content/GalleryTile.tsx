import { TypographicCover } from "../catalog/TypographicCover";
import styles from "./GalleryTile.module.css";

// F025 placeholder tile — real 내지/외함 assets still pending (brief §10 추후 제공), so
// the mat is now a TypographicCover (serif plate title + "Sample" kicker) instead of an
// empty panel. Honesty lives OUTSIDE the mat: the "{label} · 준비 중" caption is kept
// verbatim (the gallery E2E matches it). data-testid preserved for the E2E count.
export function GalleryTile({ label }: { label: string }) {
  // Mat title = the plate name ("내지 샘플" → "내지"): the caption below already carries
  // the full "{label} · 준비 중" line, so the mat doesn't repeat "샘플". No 겹낫표 —
  // these are plate labels, not 책 제목.
  const title = label.replace(/\s*샘플\s*$/u, "") || label;
  return (
    <figure className={styles.tile} data-testid="gallery-tile">
      <TypographicCover title={title} kicker="Sample" />
      <figcaption className={styles.cap}>{label} · 준비 중</figcaption>
    </figure>
  );
}
