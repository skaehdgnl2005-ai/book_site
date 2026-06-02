import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Nav } from "../../_components/Nav";
import { Footer } from "../../_components/Footer";
import { formatWon } from "../../_components/order/format";
import { orderRepo } from "../../api/payments/_lib/orders";
import { PaySandbox } from "./PaySandbox";
import styles from "../checkout.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "테스트 결제 · 그림책 제작소" };

/**
 * Hermetic stand-in for the TossPayments hosted payment window (outside production only).
 * Shows the authoritative order (amount + PII-free orderName — no buyer/child data) and the
 * three Toss outcome branches. In production this route is unreachable (the real Toss SDK
 * opens the hosted window); the guard below enforces it.
 */
export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  if (process.env.APP_ENV === "production") notFound();
  const { order: orderId } = await searchParams;
  const order = orderId ? await orderRepo().get(orderId) : undefined;
  if (!order || order.status !== "CREATED") notFound();

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="pay-title">
          <p className="eyebrow">TossPayments · 테스트</p>
          <h1 className="hero__title" id="pay-title">테스트 결제</h1>
        </section>
        <section className={styles.checkout} aria-label="테스트 결제">
          <div className={styles.payCard}>
            <div className={styles.summaryRow}>
              <span data-testid="pay-order-name">{order.orderName}</span>
              <span className={styles.grandTotal} data-testid="pay-amount">{formatWon(order.amountWon)}</span>
            </div>
            <p className={styles.note}>
              실제 결제가 아닌 TossPayments 샌드박스입니다. 아래에서 결제 결과를 선택하세요.
            </p>
            <PaySandbox orderId={order.id} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
