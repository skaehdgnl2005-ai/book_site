import { Nav } from "../_components/Nav";
import { Footer } from "../_components/Footer";
import styles from "./page.module.css";

// F026 — 후기. Honest empty state (no fabricated testimonials, 날조 금지) + the single
// real datum from brief §5 (beta 구매 예약율 80%), framed as an early beta signal, not
// as customer reviews. Styled via DESIGN tokens; the figure uses the navy accent once.
// WP8 — 4/8 asymmetric split; the beta stat is a hairline index row, not a box.
export default function ReviewsPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="section" aria-labelledby="reviews-title">
          <div className={styles.split}>
            <header className={styles.labelCol}>
              <p className="eyebrow">Reviews</p>
              <h1 id="reviews-title">후기</h1>
            </header>

            <div className={styles.bodyCol}>
              <p className={styles.empty}>
                후기는 준비 중입니다. 첫 책들이 가족에게 도착하고 있어요. 받아 보신 분들의
                이야기를 이곳에 정직하게 모아 두겠습니다.
              </p>

              {/* TODO(F026): real customer reviews once collected — never fabricate quotes. */}
              <figure className={styles.stat}>
                <span className={styles.statNum}>80%</span>
                <figcaption>
                  <span className={styles.statLabel}>베타 인터뷰 구매 예약율</span>
                  <span className={styles.statCap}>
                    정식 고객 후기가 아닌, 초기 베타 참여자의 반응입니다.
                  </span>
                </figcaption>
              </figure>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
