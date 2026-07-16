import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "../../_components/Nav";
import styles from "../checkout.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "결제 미완료 · 그림책 제작소" };

/**
 * F015 — a Toss failure. Honest copy: NOT paid, the cart is preserved, so the buyer can retry.
 * F016 — a user CANCEL at Toss arrives here with code=PAY_PROCESS_CANCELED; we send them back to
 * /cart (the cart is intact — clearCart runs only after PAID), preserving the F016 contract.
 */
export default async function CheckoutFailedPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (code === "PAY_PROCESS_CANCELED") redirect("/cart");
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
    </>
  );
}
