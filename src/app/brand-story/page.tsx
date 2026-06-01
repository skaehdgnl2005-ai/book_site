import { Nav } from "../_components/Nav";
import { Footer } from "../_components/Footer";
import { CtaLink } from "../_components/Button";
import styles from "./page.module.css";

// F024 — 브랜드 스토리 (번역가의 시작 이야기 = 신뢰의 핵심). Copy is grounded ONLY in
// known facts (brief §1/§5): translator-curated keepsake, character consistency,
// gift + record sentiment. The personal origin story is an honest, flagged "준비 중"
// placeholder — no fabricated biography (AGENTS.md 날조 금지). Styled via DESIGN tokens.
export default function BrandStoryPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="section" aria-labelledby="brand-story-title">
          <p className="eyebrow">Brand story</p>
          <h1 id="brand-story-title">브랜드 스토리</h1>

          <p className={styles.lead}>
            수많은 그림책을 우리말로 옮겨 온 번역가가, 이제 한 아이의 이름으로 시작되는 단
            하나의 이야기를 한 권 한 권 큐레이션합니다.
          </p>

          <div className={styles.prose}>
            <p>
              우리는 ‘책’이 아니라 ‘기념물’을 만듭니다. 자석 외함과 축하 카드로, 아이가 책을
              펼치는 순간까지 설계합니다.
            </p>
            <p>
              한 권 안에서 아이 캐릭터의 일관성을 지키고, 다음 책에서도 같은 캐릭터를 이어 가
              아이만의 이야기를 책꽂이에 쌓아 갑니다.
            </p>
            <p>선물하는 마음과 기록하는 마음, 그 둘 다를 위한 책입니다.</p>
          </div>

          {/* TODO(F024): real founder narrative — brief §10 마크 '추후 제공'. Until the
              maker provides it, an honest placeholder rather than a fabricated story. */}
          <p className={styles.note}>
            번역가의 시작 이야기는 곧 이 자리에 정식으로 담깁니다. (준비 중)
          </p>

          <div className={styles.ctaRow}>
            <CtaLink href="/anniversary">내 아이의 책 만들기</CtaLink>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
