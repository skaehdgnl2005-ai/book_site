"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Nav } from "../_components/Nav";
import { CtaPrimary } from "../_components/Button";
import { TypographicCover } from "../_components/catalog/TypographicCover";
import { formatWon, COVER_LABEL } from "../_components/order/format";
import { loadCart, grandTotalWon, type Cart } from "@/lib/cart";
import { loadCheckoutWidgets, type CheckoutWidgets } from "./_lib/tossClient";
import styles from "./checkout.module.css";

/**
 * F012/F044/F069 — the checkout buyer step. Reads the cart from localStorage (client; survives the
 * Toss redirect round-trip — F016), collects buyer identity (NOT in the cart, per the ADR-0011
 * handoff), and POSTs to /api/payments/create. F069: the TossPayments 결제위젯 renders selectable
 * methods (카드 + 간편결제 네이버·카카오·토스페이) on load; on submit the server-issued amount is set
 * on the widget and requestPayment opens the window for the buyer's chosen method. The server
 * (create/confirm/webhook) is method-agnostic — unchanged.
 */
export function CheckoutView({
  defaultBuyerEmail = "",
  clientKey,
}: {
  defaultBuyerEmail?: string;
  clientKey: string;
}) {
  const [cart, setCart] = useState<Cart>({ lines: [], qrVideoAddon: false });
  const [ready, setReady] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState(defaultBuyerEmail); // F057 — member prefill
  // F053 — shipping destination (PII; posted to the server, never logged).
  const [shipName, setShipName] = useState("");
  const [shipPhone, setShipPhone] = useState("");
  const [shipZip, setShipZip] = useState("");
  const [shipAddress, setShipAddress] = useState("");
  const [shipAddressDetail, setShipAddressDetail] = useState("");
  // F067 — 청약철회 제한 고지 동의(주문제작 상품, 전자상거래법 17조 2항 6호). 기본 꺼짐
  // (다크패턴 금지 — 사전선택 없음); 서버(buildOrderDraft)가 최종 게이트.
  const [withdrawalConsent, setWithdrawalConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // F069 — the payment widget: rendered once the cart is known; pay is gated until it's ready.
  const widgetsRef = useRef<CheckoutWidgets | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [widgetError, setWidgetError] = useState(false); // load failed → offer retry (not a dead end)
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setCart(loadCart());
    setReady(true);
  }, []);

  const isEmpty = cart.lines.length === 0;

  // F069 — render the 결제위젯 once (payment methods incl. 간편결제 + Toss agreement). The initial
  // amount is the client cart total for display; the server-authoritative amount is re-set at submit.
  useEffect(() => {
    if (!ready || isEmpty || widgetsRef.current) return;
    let cancelled = false;
    setWidgetError(false); // a retry (retryCount bump) re-enters here with a clean slate
    (async () => {
      try {
        const widgets = await loadCheckoutWidgets(clientKey);
        if (cancelled) return;
        await widgets.setAmount({ currency: "KRW", value: grandTotalWon(cart) });
        await Promise.all([
          widgets.renderPaymentMethods({ selector: "#toss-payment-method", variantKey: "DEFAULT" }),
          widgets.renderAgreement({ selector: "#toss-agreement", variantKey: "AGREEMENT" }),
        ]);
        if (cancelled) return;
        widgetsRef.current = widgets;
        setWidgetReady(true);
      } catch {
        if (!cancelled) setWidgetError(true); // recoverable — the '다시 불러오기' button re-runs this effect
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, isEmpty, clientKey, cart, retryCount]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!withdrawalConsent) {
      setError("주문 제작 상품의 청약철회 제한 안내에 동의해 주세요.");
      return;
    }
    const widgets = widgetsRef.current;
    if (!widgets) {
      setError("결제 수단을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
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
          withdrawalConsent,
          qrVideoAddon: cart.qrVideoAddon,
          lines: cart.lines,
        }),
      });
      const data = (await res.json()) as {
        orderId?: string;
        amount?: number;
        orderName?: string;
        successUrl?: string;
        failUrl?: string;
        errors?: string[];
      };
      if (!res.ok || !data.orderId || typeof data.amount !== "number") {
        setError(data.errors?.[0] ?? "결제를 시작할 수 없습니다.");
        setSubmitting(false);
        return;
      }
      // Reconcile the widget amount to the SERVER-authoritative value (NOT grandTotalWon(cart)) —
      // confirm recomputes it independently, so this is what actually gets charged. Then request
      // payment for the method the buyer selected in the widget (opens the real window / redirects).
      await widgets.setAmount({ currency: "KRW", value: data.amount });
      await widgets.requestPayment({
        orderId: data.orderId,
        orderName: data.orderName as string,
        successUrl: data.successUrl as string,
        failUrl: data.failUrl as string,
      });
      // requestPayment redirects the browser. If it returns without redirecting, re-enable the button.
      setSubmitting(false);
    } catch {
      setError("결제를 시작하는 중 오류가 발생했습니다. 다시 시도해 주세요.");
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
                  {/* F069 — TossPayments 결제위젯: 결제수단(카드 + 간편결제) + 이용약관 UI.
                      위젯이 방법 선택을 담당하고, 제출 시 서버 금액으로 requestPayment. */}
                  <fieldset className={styles.methodGroup}>
                    <legend className={styles.shipLegend}>결제 수단</legend>
                    <div id="toss-payment-method" className={styles.widgetSlot} />
                    <div id="toss-agreement" className={styles.widgetSlot} />
                    {!widgetReady && !widgetError && (
                      <p className={styles.widgetLoading} data-testid="checkout-widget-loading">
                        결제 수단을 불러오는 중…
                      </p>
                    )}
                    {widgetError && (
                      <div className={styles.widgetError} data-testid="checkout-widget-error">
                        <p className={styles.widgetLoading}>결제 수단을 불러오지 못했습니다.</p>
                        <button
                          type="button"
                          className={styles.widgetRetry}
                          data-testid="checkout-widget-retry"
                          onClick={() => {
                            setError(null);
                            setRetryCount((c) => c + 1);
                          }}
                        >
                          결제 수단 다시 불러오기
                        </button>
                      </div>
                    )}
                  </fieldset>
                  {/* F067 — 결제 버튼 위 청약철회 제한 고지 + 동의(전자상거래법 17조 2항 6호). */}
                  <div className={styles.consent} data-testid="checkout-consent">
                    <input
                      id="withdrawal-consent"
                      type="checkbox"
                      className={styles.consentBox}
                      data-testid="checkout-withdrawal-consent"
                      checked={withdrawalConsent}
                      onChange={(e) => setWithdrawalConsent(e.target.checked)}
                    />
                    <label className={styles.consentText} htmlFor="withdrawal-consent">
                      이 책은 아이의 이름으로 새로 만드는 <strong>주문 제작 상품</strong>으로, 제작이
                      시작된 뒤에는 청약철회(취소·환불)가 제한됩니다. 안내를 확인했으며 이에
                      동의합니다.{" "}
                      <Link href="/refund-policy" target="_blank">
                        청약철회·환불 정책 보기
                      </Link>
                    </label>
                  </div>
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
                    disabled={submitting || !widgetReady}
                  >
                    {submitting
                      ? "결제 준비 중…"
                      : widgetError
                        ? "결제 수단 불러오기 실패"
                        : !widgetReady
                          ? "결제 수단 불러오는 중…"
                          : "결제하기"}
                  </CtaPrimary>
                </div>
              </div>
            ))}
        </section>
      </main>
    </>
  );
}
