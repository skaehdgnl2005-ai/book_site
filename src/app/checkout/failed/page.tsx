import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "../../_components/Nav";
import { Footer } from "../../_components/Footer";
import styles from "../checkout.module.css";

export const metadata: Metadata = { title: "결제 미완료 · 그림책 제작소" };

/**
 * F015 — a Toss failure. Honest copy: the order is NOT paid and the cart is preserved, so
 * the buyer can retry. No PAID order is created (the confirm route never approved it).
 */
export default function CheckoutFailedPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="failed-title">
          <p className="eyebrow">Checkout</p>
          <h1 className="hero__title" id="failed-title">결제가 완료되지 않았어요</h1>
        </section>
        <section className={styles.checkout} aria-label="결제 미완료">
          <div className={styles.payCard} data-testid="checkout-failed">
            <p>
              결제가 처리되지 않았습니다. 주문은 아직 결제 전 상태이며, 장바구니는 그대로 보관되어
              있습니다.
            </p>
            <p className={styles.note}>다시 시도하시거나 잠시 후 결제해 주세요.</p>
            <Link className="cta" href="/cart" data-testid="checkout-failed-back">
              장바구니로 돌아가기
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
