import Link from "next/link";
import { Nav } from "../_components/Nav";
import { Footer } from "../_components/Footer";
import { CUSTOM_PRICE_WON } from "@/lib/customRequest";
import styles from "./page.module.css";

// F020 — 맞춤 제작 landing. Two paths side-by-side (web-brief §4): a free phone-consultation
// booking, or writing the 의뢰서 directly. Both collect the same 6-group request (F023).
// WP8 — 4/8 asymmetric split; boxed path cards became a hairline two-column index
// (No. pattern, DESIGN.md edition-number sanction); price row hierarchy clarified.
export const metadata = {
  title: "맞춤 제작 — 그림책 제작소",
  description: "100% 풀 커스텀 그림책. 전화 상담 예약 또는 직접 작성으로 의뢰하세요.",
};

const PRICE = `${CUSTOM_PRICE_WON.toLocaleString("ko-KR")}원`;

export default function CustomLandingPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="section" aria-labelledby="custom-title">
          <div className={styles.split}>
            <header className={styles.labelCol}>
              <p className="eyebrow">Full custom</p>
              <h1 id="custom-title">맞춤 제작</h1>
            </header>

            <div className={styles.bodyCol}>
              <p className={styles.lead}>
                시놉시스·문체·삽화·교훈까지 100% 풀 커스텀으로 만드는, 한 아이만을 위한 단 하나의 책.
                자석 외함과 축하 카드가 기본으로 함께합니다.
              </p>
              <p className={styles.price}>
                <span className={styles.priceLabel}>가격</span>
                <span className={styles.priceValue}>{PRICE}</span>
                <span className={styles.priceNote}>제작 기간 — 양식 확정 또는 상담 완료 후 일주일 이내</span>
              </p>

              <div className={styles.paths} data-testid="custom-paths">
                <Link href="/custom/phone" className={styles.path}>
                  <span className={styles.pathNo} aria-hidden="true">
                    No. 01
                  </span>
                  <span className={styles.pathTitle}>전화로 상담 예약하기</span>
                  <span className={styles.pathDesc}>
                    캘린더에서 원하는 시간을 고르면 상담사가 전화로 의뢰서를 함께 채웁니다. 글로 적기
                    어려우신 분께. <strong>예약은 무료 — 결제는 상담 후</strong>.
                  </span>
                </Link>
                <Link href="/custom/written" className={styles.path}>
                  <span className={styles.pathNo} aria-hidden="true">
                    No. 02
                  </span>
                  <span className={styles.pathTitle}>직접 작성하기</span>
                  <span className={styles.pathDesc}>
                    6개 묶음 의뢰서를 차분히 직접 작성합니다. 밤에 천천히 적고 싶은 분께.{" "}
                    <strong>결제 후 제작 시작</strong>.
                  </span>
                </Link>
              </div>

              <p className={styles.foot}>
                두 경로 모두 같은 6묶음 의뢰서로 진행되어, 어느 길로 오셔도 제작 인풋은 동일합니다.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
