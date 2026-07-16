import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "../../../_components/Nav";
import { formatWon, COVER_LABEL } from "../../../_components/order/format";
import { orderRepo } from "../../../api/payments/_lib/orders";
import { ORDER_STATUS_LABEL, isPaidFamily } from "../../../api/payments/_lib/status";
import { getSessionUser } from "../../_lib/sessionUser";
import { CancelRequestPanel } from "../../../_components/order/CancelRequestPanel";
import { TrackingLink } from "../../../_components/order/TrackingLink";
import styles from "../../account.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "주문 상세 · 그림책 제작소",
  robots: { index: false, follow: false },
};

/**
 * F057 — 내 주문 상세 (member-only). Strict ownership gate: session user must own the order
 * (order.userId === user.id) or the page 404s uniformly — a member can never probe another
 * member's (or a guest's) order. Unlike the unauthenticated /orders/[id], the OWNER may see
 * their own shipping destination here. 마무리하기 links into /mypage/[orderId], which accepts
 * session ownership (no OTP round-trip for members).
 */
export default async function AccountOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) notFound();
  const order = await orderRepo().get(id);
  if (!order || order.userId !== user.id) notFound();

  const paid = isPaidFamily(order.status);

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="account-order-title">
          <p className="eyebrow eyebrow--ko">내 주문</p>
          <h1 className="hero__title" id="account-order-title">주문 상세</h1>
        </section>
        <section className={styles.panel} aria-label="주문 정보">
          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt className={styles.dt}>주문번호</dt>
              <dd className={styles.dd} data-testid="account-order-id">{order.id}</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>상태</dt>
              <dd className={styles.dd} data-testid="account-order-status">
                {ORDER_STATUS_LABEL[order.status]}
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>주문 상품</dt>
              <dd className={styles.dd}>
                {order.kind === "CUSTOM"
                  ? order.orderName
                  : order.items.map((it) => `${it.templateLabel} (${COVER_LABEL[it.coverType]})`).join(", ")}
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>결제 금액</dt>
              <dd className={styles.dd}>{formatWon(order.amountWon)}</dd>
            </div>
            {order.shipAddress ? (
              <div className={styles.row}>
                <dt className={styles.dt}>배송지</dt>
                <dd className={styles.dd} data-testid="account-order-shipping">
                  {order.shipName} · {order.shipPhone}
                  <br />({order.shipZip}) {order.shipAddress}
                </dd>
              </div>
            ) : null}
            {order.trackingNumber ? (
              <div className={styles.row}>
                <dt className={styles.dt}>배송 조회</dt>
                <dd className={styles.dd} data-testid="account-order-tracking">
                  <TrackingLink carrier={order.trackingCarrier ?? ""} trackingNumber={order.trackingNumber} />
                </dd>
              </div>
            ) : null}
          </dl>
          {paid && order.kind === "ENTRY" ? (
            <Link className="cta" href={`/mypage/${order.id}`} data-testid="account-order-finish">
              책 마무리하기 (사진·헌정 문구)
            </Link>
          ) : null}
          <CancelRequestPanel
            orderId={order.id}
            status={order.status}
            cancelRequestedAt={order.cancelRequestedAt ?? null}
          />
        </section>
        <section className={styles.panel} aria-label="돌아가기">
          <p className={styles.note}>
            <Link href="/account">← 내 계정으로</Link>
          </p>
        </section>
      </main>
    </>
  );
}
