import { Nav } from "../_components/Nav";
import { GalleryTile } from "../_components/content/GalleryTile";
import styles from "./page.module.css";

// F025 — 갤러리/포트폴리오. Honest placeholder grid until the maker provides real
// sample 내지·외함 images (brief §10). Styled via DESIGN tokens.
const SAMPLES = ["내지 샘플", "외함 샘플", "내지 샘플", "외함 샘플", "내지 샘플", "외함 샘플"];

export default function GalleryPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="section" aria-labelledby="gallery-title">
          <p className="eyebrow">Gallery</p>
          <h1 id="gallery-title">갤러리</h1>
          <p className={styles.caption}>
            샘플 책의 내지와 외함입니다. 실제 이미지는 제작 중이며 곧 공개됩니다.
          </p>
          {/* TODO(F025): replace placeholder mats with real 내지/외함 assets — brief §10. */}
          <div className={styles.grid}>
            {SAMPLES.map((label, i) => (
              <GalleryTile key={`${label}-${i}`} label={label} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
