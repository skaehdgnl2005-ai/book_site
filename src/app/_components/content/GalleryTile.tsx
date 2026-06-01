import styles from "./GalleryTile.module.css";

// F025 placeholder mat — 4:5 panel + 1px hairline, honest "준비 중" caption. No real
// 내지/외함 asset yet (brief §10 추후 제공). data-testid lets the E2E assert presence.
export function GalleryTile({ label }: { label: string }) {
  return (
    <figure className={styles.tile} data-testid="gallery-tile">
      <span className={styles.mat} aria-hidden="true" />
      <figcaption className={styles.cap}>{label} · 준비 중</figcaption>
    </figure>
  );
}
