import { Nav } from "../_components/Nav";
import { reviewStore } from "./_lib/reviews";
import styles from "./page.module.css";

export const dynamic = "force-dynamic"; // F071 — the published review list is live

// F026/F071 — 후기. 정직한 도입 문구(아직 '준비 중'인 초기 베타) + brief §5의 단일 실측치
// (베타 구매 예약율 80%, 고객 후기 아님으로 명시)는 그대로 보존하고, F071이 구매 인증 후기 목록 +
// 후기 운영정책 고지(2026-07-21 시행)를 얹는다. 후기는 결제 완료 구매자가 마이페이지에서 작성한다.
export default async function ReviewsPage() {
  const reviews = await reviewStore().listPublished();
  // F071 — 게시된 후기의 산술 평균 평점(운영정책의 '등급 기준'이 표시한다고 고지하는 값).
  const avgRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
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
                구매 인증 후기를 이제 막 모으기 시작했어요. 아직 초기라 준비 중이며, 받아 보신 분들의
                이야기를 아래에 정직하게 쌓아 갑니다. 후기는 결제하신 분이 마이페이지에서 직접 남기실 수 있어요.
              </p>

              {reviews.length > 0 ? (
                <p className={styles.reviewAvg} data-testid="review-average">
                  <span className={styles.reviewAvgStars} aria-hidden="true">
                    {"★".repeat(Math.round(avgRating))}
                    {"☆".repeat(5 - Math.round(avgRating))}
                  </span>
                  평균 <strong>{avgRating.toFixed(1)}</strong>점 · 게시된 후기 {reviews.length}개
                </p>
              ) : null}

              {reviews.length > 0 ? (
                <ul className={styles.reviewList} role="list" data-testid="review-list">
                  {reviews.map((r) => (
                    <li key={r.id} className={styles.reviewItem} data-testid="review-item">
                      <div className={styles.reviewHead}>
                        <span className={styles.reviewStars} aria-label={`별점 ${r.rating}점`}>
                          {"★".repeat(r.rating)}
                          {"☆".repeat(5 - r.rating)}
                        </span>
                        <span className={styles.reviewMeta}>
                          {r.authorName} · {r.createdAt.slice(0, 10)}
                        </span>
                      </div>
                      <p className={styles.reviewBody}>{r.body}</p>
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* brief §5 — the one real datum; framed as a beta signal, NOT a customer review. */}
              <figure className={styles.stat}>
                <span className={styles.statNum}>80%</span>
                <figcaption>
                  <span className={styles.statLabel}>베타 인터뷰 구매 예약율</span>
                  <span className={styles.statCap}>정식 고객 후기가 아닌, 초기 베타 참여자의 반응입니다.</span>
                </figcaption>
              </figure>

              {/* F071 — 후기 운영정책 고지 (2026-07-21 시행). "준비 중"은 위 도입 1회만 (F026 로케이터). */}
              <section className={styles.policy} aria-labelledby="review-policy-title" data-testid="review-policy">
                <h2 id="review-policy-title" className={styles.policyTitle}>후기 운영정책</h2>
                <p className={styles.policyMeta}>시행일 2026-07-21</p>
                <ul className={styles.policyList}>
                  <li>
                    <strong>작성 권한</strong> — 실제 구매(주문 인증)를 완료하신 고객만 작성할 수 있으며,
                    한 주문당 후기 1개가 등록됩니다.
                  </li>
                  <li>
                    <strong>게시 기간</strong> — 등록 즉시 게시되며, 상품·서비스가 제공되는 동안 게시됩니다.
                    관련 법령에 따른 보존 기간이 적용될 수 있습니다.
                  </li>
                  <li>
                    <strong>등급 기준</strong> — 별점은 1~5점이며, 표시되는 평점은 게시된 후기의 산술 평균입니다.
                  </li>
                  <li>
                    <strong>삭제·비게시 기준</strong> — 욕설·비방·허위 사실, 개인정보(실명·연락처·아동 정보 등)나
                    타인의 저작권 침해, 광고·홍보성 내용은 사전 통지 없이 삭제되거나 게시가 제한될 수 있습니다.
                  </li>
                  <li>
                    <strong>이의 제기</strong> — 삭제·비게시에 이의가 있으시면 문의 페이지의 고객센터로 접수해
                    주세요. 접수 후 처리 결과를 안내드립니다.
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
