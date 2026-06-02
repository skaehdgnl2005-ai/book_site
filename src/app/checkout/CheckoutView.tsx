"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nav } from "../_components/Nav";
import { Footer } from "../_components/Footer";
import { formatWon, COVER_LABEL } from "../_components/order/format";
import { loadCart, grandTotalWon, type Cart } from "@/lib/cart";
import styles from "./checkout.module.css";

/**
 * F012 — the checkout buyer step. Reads the cart from localStorage (client; survives the
 * Toss redirect round-trip — F016), collects buyer identity (NOT in the cart, per the
 * ADR-0011 handoff), and POSTs to /api/payments/create. On success it redirects to the
 * server-returned payUrl (the sandbox Toss stand-in outside production).
 */
export function CheckoutView() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart>({ lines: [], qrVideoAddon: false });
  const [ready, setReady] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCart(loadCart());
    setReady(true);
  }, []);

  const isEmpty = cart.lines.length === 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName,
          buyerEmail,
          qrVideoAddon: cart.qrVideoAddon,
          lines: cart.lines,
        }),
      });
      const data = (await res.json()) as { payUrl?: string; errors?: string[] };
      if (!res.ok || !data.payUrl) {
        setError(data.errors?.[0] ?? "결제를 시작할 수 없습니다.");
        setSubmitting(false);
        return;
      }
      router.push(data.payUrl);
    } catch {
      setError("결제를 시작할 수 없습니다.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="checkout-title">
          <p className="eyebrow">Checkout</p>
          <h1 className="hero__title" id="checkout-title">결제</h1>
        </section>
        <section className={styles.checkout} aria-label="결제">
          {ready &&
            (isEmpty ? (
              <div className={styles.empty} data-testid="checkout-empty">
                <p>장바구니가 비어 있습니다.</p>
                <Link className="cta" href="/anniversary">그림책 둘러보기</Link>
              </div>
            ) : (
              <div className={styles.grid}>
                <form className={styles.form} onSubmit={onSubmit} noValidate>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="buyer-name">보호자 이름</label>
                    <input
                      id="buyer-name"
                      className={styles.input}
                      data-testid="checkout-buyer-name"
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="buyer-email">이메일</label>
                    <input
                      id="buyer-email"
                      type="email"
                      className={styles.input}
                      data-testid="checkout-buyer-email"
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  {error && (
                    <p className={styles.error} data-testid="checkout-error" role="alert">{error}</p>
                  )}
                  <button className="cta" type="submit" data-testid="checkout-pay" disabled={submitting}>
                    {submitting ? "결제 준비 중…" : "결제하기"}
                  </button>
                  <p className={styles.note}>TossPayments 테스트(샌드박스) 결제로 진행됩니다.</p>
                </form>
                <aside className={styles.summary} aria-label="주문 요약">
                  {cart.lines.map((line) => (
                    <div key={line.id} className={styles.summaryRow}>
                      <span>{line.templateLabel} · {COVER_LABEL[line.coverType]}</span>
                      <span>{formatWon(line.unitPriceWon)}</span>
                    </div>
                  ))}
                  {cart.qrVideoAddon && (
                    <p className={styles.qrTag}>QR 영상 옵션 · 기본 미포함 · 요금 추후 안내</p>
                  )}
                  <div className={styles.totalRow}>
                    <span>총 결제 금액</span>
                    <span className={styles.grandTotal} data-testid="checkout-grand-total">
                      {formatWon(grandTotalWon(cart))}
                    </span>
                  </div>
                </aside>
              </div>
            ))}
        </section>
      </main>
      <Footer />
    </>
  );
}
