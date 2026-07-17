import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Nav } from "../../_components/Nav";
import { formatWon, COVER_LABEL } from "../../_components/order/format";
import { DepositNotice } from "../../_components/order/DepositNotice";
import { orderRepo } from "../../api/payments/_lib/orders";
import { isPaidFamily } from "../../api/payments/_lib/status";
import styles from "./orders.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "주문 확인 · 그림책 제작소" };

/**
 * F014 — order confirmation. Renders ONLY non-PII (order id, status, item label/cover/price,
 * total): order ids are sequential/guessable and this route is unauthenticated, so buyer/
 * child PII is never rendered here (it is stored server-side for fulfillment). Copy is gated
 * on the real status — a CREATED (unpaid) order never shows a phantom completion.
 */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await orderRepo().get(id);
  if (!order) notFound();
  const paid = isPaidFamily(order.status); // F054: fulfillment states remain "settled" here
  const waitingDeposit = order.status === "WAITING_FOR_DEPOSIT"; // F070 — 가상계좌 입금 대기

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="order-title">
          <p className="eyebrow eyebrow--ko">{paid ? "결제 완료" : waitingDeposit ? "입금 대기" : "결제 대기"}</p>
          <h1 className="hero__title" id="order-title">
            {paid ? "주문이 완료되었어요" : waitingDeposit ? "입금을 기다리고 있어요" : "결제가 완료되지 않았어요"}
          </h1>
        </section>
        <section className={styles.order} aria-label="주문 내역">
          <p className={styles.meta} data-testid="order-id">주문번호 {order.id}</p>
          <p className={styles.statusRow}>
            상태 <span className={styles.status} data-testid="order-status">{order.status}</span>
          </p>
          <ul className={styles.items} role="list">
            {order.items.map((it, i) => (
              <li key={i} className={styles.item} data-testid="order-item">
                <span className={styles.itemTitle} data-testid="order-item-title">{it.templateLabel}</span>
                <span className={styles.itemMeta} data-testid="order-item-cover">{COVER_LABEL[it.coverType]}</span>
                <span className={styles.itemPrice}>{formatWon(it.unitPriceWon)}</span>
              </li>
            ))}
          </ul>
          {order.qrVideoAddon && (
            <p className={styles.qrTag}>QR 영상 옵션 · 기본 미포함 · 요금 추후 안내</p>
          )}
          <div className={styles.totals}>
            <span>총 결제 금액</span>
            <span className={styles.grandTotal} data-testid="order-grand-total">{formatWon(order.amountWon)}</span>
          </div>
          {paid ? (
            <>
              <p className={styles.note}>
                결제가 완료되었습니다. 사진·헌정 문구 등 마무리는 마이페이지에서 이어갈 수 있어요. (테스트 결제)
              </p>
              <Link className="cta" href="/mypage" data-testid="order-finish-link">
                마이페이지에서 마무리하기
              </Link>
            </>
          ) : waitingDeposit ? (
            <>
              <DepositNotice
                bank={order.depositBank}
                account={order.depositAccount}
                amountWon={order.amountWon}
                dueDate={order.depositDueDate}
              />
              <Link className="cta" href="/mypage" data-testid="order-finish-link">
                마이페이지에서 주문 조회
              </Link>
            </>
          ) : (
            <p className={styles.note}>
              아직 결제가 완료되지 않았습니다. 장바구니에서 다시 결제를 시도해 주세요.
            </p>
          )}
        </section>
      </main>
    </>
  );
}
