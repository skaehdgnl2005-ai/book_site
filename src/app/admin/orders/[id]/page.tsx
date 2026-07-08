import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "../../../_components/Nav";
import { Footer } from "../../../_components/Footer";
import { formatWon, COVER_LABEL } from "../../../_components/order/format";
import { orderRepo } from "../../../api/payments/_lib/orders";
import { ORDER_STATUS_LABEL, canTransition } from "../../../api/payments/_lib/status";
import { TransitionPanel } from "./TransitionPanel";
import { RefundPanel } from "./RefundPanel";
import styles from "../../admin.module.css";

const GENDER_LABEL = { MALE: "남아", FEMALE: "여아" } as const;

/**
 * F059 — 관리자 주문 상세. Fulfillment needs the real data: buyer, shipping destination, and
 * per-book personalization (child name/gender — sensitive PII) are RENDERED here for the
 * operator, and only here + /account (owner). Render-only: no admin code path logs/traces any
 * of it (E3). Status transitions land with F060.
 */
export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await orderRepo().get(id);
  if (!order) notFound();

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="admin-order-title">
          <p className="eyebrow eyebrow--ko">관리자 · 주문</p>
          <h1 className="hero__title" id="admin-order-title">{order.id}</h1>
        </section>
        <section className={styles.panel} aria-label="주문 정보">
          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt className={styles.dt}>상태</dt>
              <dd className={styles.dd} data-testid="admin-order-status">{ORDER_STATUS_LABEL[order.status]}</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>종류</dt>
              <dd className={styles.dd}>{order.kind === "CUSTOM" ? "맞춤 제작" : "엔트리"}</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>주문 상품</dt>
              <dd className={styles.dd}>
                {order.kind === "CUSTOM"
                  ? order.orderName
                  : order.items
                      .map(
                        (it) =>
                          `${it.templateLabel} (${COVER_LABEL[it.coverType]}) — ${it.personalization.childName} · ${GENDER_LABEL[it.personalization.childGender]}`,
                      )
                      .join(" / ")}
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>결제 금액</dt>
              <dd className={styles.dd}>{formatWon(order.amountWon)}</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>구매자</dt>
              <dd className={styles.dd} data-testid="admin-order-buyer">
                {order.buyerName} · {order.buyerEmail}
              </dd>
            </div>
            {order.shipAddress ? (
              <div className={styles.row}>
                <dt className={styles.dt}>배송지</dt>
                <dd className={styles.dd} data-testid="admin-order-shipping">
                  {order.shipName} · {order.shipPhone}
                  <br />({order.shipZip}) {order.shipAddress}
                </dd>
              </div>
            ) : null}
            <div className={styles.row}>
              <dt className={styles.dt}>결제 키</dt>
              <dd className={styles.dd}>{order.tossPaymentKey ?? "— (미결제)"}</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>주문 일시</dt>
              <dd className={styles.dd}>{order.createdAt.replace("T", " ").slice(0, 16)}</dd>
            </div>
            {order.qrVideoAddon ? (
              <div className={styles.row}>
                <dt className={styles.dt}>옵션</dt>
                <dd className={styles.dd}>QR 영상 추가</dd>
              </div>
            ) : null}
            {order.trackingNumber ? (
              <div className={styles.row}>
                <dt className={styles.dt}>운송장</dt>
                <dd className={styles.dd} data-testid="admin-order-tracking">
                  {order.trackingCarrier} {order.trackingNumber}
                </dd>
              </div>
            ) : null}
            {order.cancelRequestedAt ? (
              <div className={styles.row}>
                <dt className={styles.dt}>취소 요청</dt>
                <dd className={styles.dd} data-testid="admin-order-cancel-request">
                  {order.cancelRequestedAt.slice(0, 10)} · {order.cancelReason}
                </dd>
              </div>
            ) : null}
          </dl>
          <TransitionPanel orderId={order.id} status={order.status} />
          {canTransition(order.status, "REFUNDED") && order.tossPaymentKey ? (
            <RefundPanel orderId={order.id} cancelRequested={order.cancelRequestedAt != null} />
          ) : null}
          <p className={styles.note}>
            <Link href="/admin/orders">← 주문 목록으로</Link>
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
