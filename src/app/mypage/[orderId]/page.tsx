import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "../../_components/Nav";
import { formatWon, COVER_LABEL } from "../../_components/order/format";
import { FinishingClient } from "../../_components/mypage/FinishingClient";
import { CancelRequestPanel } from "../../_components/order/CancelRequestPanel";
import { TrackingLink } from "../../_components/order/TrackingLink";
import { DepositNotice } from "../../_components/order/DepositNotice";
import { orderRepo } from "@/app/api/payments/_lib/orders";
import { isPaidFamily } from "@/app/api/payments/_lib/status";
import { hasOrderAccess } from "../_lib/orderAccess";
import styles from "../../_components/mypage/mypage.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "마이페이지 · 그림책 제작소",
  robots: { index: false, follow: false }, // R5
};

/**
 * F017/F018 — per-order finishing surface. `params` is a Promise in Next 15 (await it).
 *
 * R1 (no existence oracle): the capability cookie is verified BEFORE any order lookup. A
 * missing/invalid cookie yields ONE identical access prompt for EVERY orderId (existing or not) —
 * no `orderRepo().get`, no `notFound()` pre-gate — so this guessable-id route cannot be used to
 * probe which order ids exist. Only after the gate passes do we load the order (and a missing
 * order may then 404, since the caller already proved ownership). The shell renders NO buyer/child
 * PII; the dedication crosses only via the cookie-gated, no-store `/state` route the client fetches.
 */
export default async function MypageOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  // Capability cookie (guest OTP, checked first — no lookup) OR session ownership (F057).
  if (!(await hasOrderAccess(orderId))) {
    return (
      <>
        <Nav />
        <main>
          <section className="hero" aria-labelledby="mypage-gate-title">
            <p className="eyebrow eyebrow--ko">마이페이지</p>
            <h1 className="hero__title" id="mypage-gate-title" data-testid="mypage-access-prompt">
              주문을 먼저 조회해 주세요
            </h1>
            <p className="hero__sub">
              마이페이지는 주문번호와 결제 시 사용한 이메일로 조회한 뒤 이용할 수 있어요.
            </p>
            <Link className="cta" href="/mypage" data-testid="mypage-gate-lookup">주문 조회하기</Link>
          </section>
        </main>
      </>
    );
  }

  const order = await orderRepo().get(orderId);
  if (!order) notFound();
  const paid = isPaidFamily(order.status); // F054: finishing stays open through fulfillment

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="mypage-title">
          <p className="eyebrow eyebrow--ko">마이페이지</p>
          <h1 className="hero__title" id="mypage-title">책 마무리하기</h1>
          <p className={styles.meta} data-testid="mypage-order-id">주문번호 {order.id}</p>
          <p className={styles.statusRow}>
            상태 <span className={styles.status} data-testid="mypage-order-status">{order.status}</span>
          </p>
          {order.trackingNumber ? (
            <p className={styles.meta} data-testid="mypage-tracking">
              배송 <TrackingLink carrier={order.trackingCarrier ?? ""} trackingNumber={order.trackingNumber} />
            </p>
          ) : null}
        </section>
        {paid ? (
          <>
            <FinishingClient
              orderId={order.id}
              qrAddon={order.qrVideoAddon}
              items={order.items.map((it, index) => ({
                index,
                templateLabel: it.templateLabel,
                coverLabel: COVER_LABEL[it.coverType],
                unitPriceText: formatWon(it.unitPriceWon),
              }))}
            />
            <section className={styles.panel} aria-label="주문 취소">
              <CancelRequestPanel
                orderId={order.id}
                status={order.status}
                cancelRequestedAt={order.cancelRequestedAt ?? null}
              />
            </section>
          </>
        ) : order.status === "WAITING_FOR_DEPOSIT" ? (
          <section className={styles.panel} aria-label="입금 대기">
            <DepositNotice
              bank={order.depositBank}
              account={order.depositAccount}
              amountWon={order.amountWon}
              dueDate={order.depositDueDate}
            />
          </section>
        ) : (
          <section className={styles.panel} aria-label="결제 대기">
            <p className={styles.note} data-testid="mypage-not-paid">
              아직 결제가 완료되지 않았습니다. 결제를 완료하면 사진·헌정 문구·QR 영상 마무리를 진행할 수 있어요.
            </p>
          </section>
        )}
      </main>
    </>
  );
}
