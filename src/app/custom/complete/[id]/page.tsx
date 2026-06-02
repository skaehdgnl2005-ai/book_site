import Link from "next/link";
import { Nav } from "../../../_components/Nav";
import { Footer } from "../../../_components/Footer";
import { customRequestStore } from "@/lib/customRequest";
import styles from "./page.module.css";

// Shared confirmation for both paths (F021 WRITTEN → SUBMITTED, F022 PHONE → REQUESTED).
// Reads the in-memory store by id; an unknown id is reported honestly (no fabricated record),
// and a WRITTEN record's payment-complete copy is gated on rec.status so an unpaid
// (PENDING_PAYMENT) request never shows a phantom "결제 완료" (design spec §5 honesty).
const WRITTEN_PAID: ReadonlySet<string> = new Set([
  "SUBMITTED",
  "IN_REVIEW",
  "IN_PRODUCTION",
  "COMPLETED",
]);

export default async function CustomCompletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rec = await customRequestStore.get(id);

  if (!rec) {
    return (
      <>
        <Nav />
        <main>
          <section className="section" aria-labelledby="complete-title">
            <p className="eyebrow">Not found</p>
            <h1 id="complete-title">접수 내역을 찾을 수 없습니다</h1>
            <p className={styles.lead}>
              주소가 정확한지 확인해 주세요. 문제가 계속되면 문의해 주세요.
            </p>
            <Link href="/custom" className="cta">
              맞춤 제작으로 돌아가기
            </Link>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  const isPhone = rec.consultation !== undefined;
  const writtenPaid = !isPhone && WRITTEN_PAID.has(rec.status);
  const status = rec.consultation ? rec.consultation.status : rec.status;

  // Copy varies by real state — never claim completion for an unpaid request.
  const eyebrow = isPhone ? "상담 예약 접수" : writtenPaid ? "의뢰서 접수 완료" : "결제 대기";
  const heading = isPhone
    ? "전화 상담이 예약되었습니다"
    : writtenPaid
      ? "맞춤 제작 의뢰가 접수되었습니다"
      : "아직 결제가 완료되지 않았습니다";
  const note = isPhone
    ? "예약하신 시간에 상담사가 전화로 의뢰서를 함께 작성합니다."
    : writtenPaid
      ? "제작이 곧 시작됩니다. 아이 사진은 마이페이지에서 올릴 수 있습니다."
      : "결제를 마쳐야 의뢰가 접수됩니다. 결제를 완료해 주세요.";

  return (
    <>
      <Nav />
      <main>
        <section className="section" aria-labelledby="complete-title">
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="complete-title">{heading}</h1>

          <dl className={styles.summary}>
            <div className={styles.row}>
              <dt className={styles.dt}>접수번호</dt>
              <dd className={styles.dd} data-testid="request-id">
                {rec.id}
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>상태</dt>
              <dd className={styles.dd} data-testid="status">
                {status}
              </dd>
            </div>
            {isPhone && rec.consultation ? (
              <>
                <div className={styles.row}>
                  <dt className={styles.dt}>희망 시간</dt>
                  <dd className={styles.dd}>{rec.consultation.requestedSlot}</dd>
                </div>
                <div className={styles.row}>
                  <dt className={styles.dt}>결제</dt>
                  <dd className={styles.dd}>상담 후 결제 — 지금은 비용이 청구되지 않습니다.</dd>
                </div>
              </>
            ) : (
              <div className={styles.row}>
                <dt className={styles.dt}>결제</dt>
                <dd className={styles.dd} data-testid="payment">
                  {writtenPaid
                    ? `${rec.amountWon.toLocaleString("ko-KR")}원 · 테스트 결제 완료`
                    : "아직 결제가 완료되지 않았습니다."}
                </dd>
              </div>
            )}
          </dl>

          <p className={styles.note}>{note}</p>
          {!isPhone && !writtenPaid ? (
            <Link href="/custom/written" className="cta">
              의뢰서로 돌아가 결제 마치기
            </Link>
          ) : (
            <Link href="/" className="cta">
              홈으로
            </Link>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
