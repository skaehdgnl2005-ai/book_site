"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Nav } from "../_components/Nav";
import { Footer } from "../_components/Footer";
import { CtaPrimary } from "../_components/Button";
import { TypographicCover } from "../_components/catalog/TypographicCover";
import { formatWon, COVER_LABEL } from "../_components/order/format";
import { loadCart, grandTotalWon, type Cart } from "@/lib/cart";
import { requestTossPayment } from "./_lib/tossClient";
import styles from "./checkout.module.css";

/**
 * F012/F044 — the checkout buyer step. Reads the cart from localStorage (client; survives the
 * Toss redirect round-trip — F016), collects buyer identity (NOT in the cart, per the
 * ADR-0011 handoff), and POSTs to /api/payments/create. On success it forwards the server-issued
 * checkout fields to requestTossPayment, which opens the real TossPayments hosted payment window.
 */
export function CheckoutView() {
  const [cart, setCart] = useState<Cart>({ lines: [], qrVideoAddon: false });
  const [ready, setReady] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  // F053 — shipping destination (PII; posted to the server, never logged).
  const [shipName, setShipName] = useState("");
  const [shipPhone, setShipPhone] = useState("");
  const [shipZip, setShipZip] = useState("");
  const [shipAddress, setShipAddress] = useState("");
  const [shipAddressDetail, setShipAddressDetail] = useState("");
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
          shipName,
          shipPhone,
          shipZip,
          shipAddress,
          shipAddressDetail,
          qrVideoAddon: cart.qrVideoAddon,
          lines: cart.lines,
        }),
      });
      const data = (await res.json()) as {
        orderId?: string;
        clientKey?: string;
        amount?: number;
        orderName?: string;
        successUrl?: string;
        failUrl?: string;
        errors?: string[];
      };
      if (!res.ok || !data.orderId || !data.clientKey) {
        setError(data.errors?.[0] ?? "결제를 시작할 수 없습니다.");
        setSubmitting(false);
        return;
      }
      // Forward the SERVER-issued amount as-is (NOT grandTotalWon(cart)) — it must equal the
      // confirm-time server amount or Toss rejects the payment. Opens the real hosted window.
      await requestTossPayment({
        orderId: data.orderId,
        clientKey: data.clientKey,
        amount: data.amount as number,
        orderName: data.orderName as string,
        successUrl: data.successUrl as string,
        failUrl: data.failUrl as string,
      });
      // requestPayment redirects the browser. If it returns without redirecting, re-enable the button.
      setSubmitting(false);
    } catch {
      setError("결제창을 여는 중 오류가 발생했습니다. 다시 시도해 주세요.");
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
                <form id="checkout-form" className={styles.form} onSubmit={onSubmit} noValidate>
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
                  {/* F053 — 배송지 (실물 기념물: 자석 케이스 + 카드). 헤어라인으로 구획. */}
                  <fieldset className={styles.shipGroup}>
                    <legend className={styles.shipLegend}>배송지</legend>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="ship-name">받는 분 이름</label>
                      <input
                        id="ship-name"
                        className={styles.input}
                        data-testid="checkout-ship-name"
                        value={shipName}
                        onChange={(e) => setShipName(e.target.value)}
                        autoComplete="shipping name"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="ship-phone">받는 분 연락처</label>
                      <input
                        id="ship-phone"
                        type="tel"
                        className={styles.input}
                        data-testid="checkout-ship-phone"
                        value={shipPhone}
                        onChange={(e) => setShipPhone(e.target.value)}
                        autoComplete="shipping tel"
                        placeholder="010-0000-0000"
                      />
                    </div>
                    <div className={styles.shipRow}>
                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="ship-zip">우편번호</label>
                        <input
                          id="ship-zip"
                          className={styles.input}
                          data-testid="checkout-ship-zip"
                          value={shipZip}
                          onChange={(e) => setShipZip(e.target.value)}
                          autoComplete="shipping postal-code"
                          inputMode="numeric"
                          maxLength={5}
                          placeholder="00000"
                        />
                      </div>
                      <div className={`${styles.field} ${styles.shipRowGrow}`}>
                        <label className={styles.label} htmlFor="ship-address">주소</label>
                        <input
                          id="ship-address"
                          className={styles.input}
                          data-testid="checkout-ship-address"
                          value={shipAddress}
                          onChange={(e) => setShipAddress(e.target.value)}
                          autoComplete="shipping street-address"
                        />
                      </div>
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="ship-address-detail">상세주소 (선택)</label>
                      <input
                        id="ship-address-detail"
                        className={styles.input}
                        data-testid="checkout-ship-address-detail"
                        value={shipAddressDetail}
                        onChange={(e) => setShipAddressDetail(e.target.value)}
                      />
                    </div>
                  </fieldset>
                  {error && (
                    <p className={styles.error} data-testid="checkout-error" role="alert">{error}</p>
                  )}
                  {/* 문구 원문 보존 (F012) — 톤만 microLabel급으로 낮춤(한글: 자간 0·소문자 유지) */}
                  <p className={styles.note}>TossPayments 테스트(샌드박스) 결제로 진행됩니다.</p>
                </form>
                <aside className={styles.summary} aria-label="주문 요약">
                  {cart.lines.map((line) => (
                    <div key={line.id} className={styles.summaryRow}>
                      {/* decorative typographic-cover thumb; the row text is the announced content */}
                      <span className={styles.summaryThumb}>
                        <TypographicCover title={`「${line.templateLabel}」`} />
                      </span>
                      <span className={styles.summaryLabel}>{line.templateLabel} · {COVER_LABEL[line.coverType]}</span>
                      <span className={styles.summaryPrice}>{formatWon(line.unitPriceWon)}</span>
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
                {/* F051 — the ONE pill of the screen. Desktop: a quiet row under the form.
                    Mobile: pins to the viewport bottom with the grand total (sticky bar).
                    Submits via form="checkout-form" so it can live outside the <form>. */}
                <div className={styles.payBar} data-testid="checkout-paybar">
                  <span className={styles.payBarTotal} data-testid="checkout-paybar-total">
                    {formatWon(grandTotalWon(cart))}
                  </span>
                  <CtaPrimary
                    type="submit"
                    form="checkout-form"
                    data-testid="checkout-pay"
                    disabled={submitting}
                  >
                    {submitting ? "결제 준비 중…" : "결제하기"}
                  </CtaPrimary>
                </div>
              </div>
            ))}
        </section>
      </main>
      <Footer />
    </>
  );
}
