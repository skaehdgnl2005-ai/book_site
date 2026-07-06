"use client";
import { useEffect, useState } from "react";
import { Nav } from "../Nav";
import { Footer } from "../Footer";
import { CtaPrimary, TextAction } from "../Button";
import { TypographicCover } from "../catalog/TypographicCover";
import { formatWon, COVER_LABEL } from "./format";
import { loadCart, saveCart, removeLine, grandTotalWon, type Cart } from "@/lib/cart";
import styles from "./cart.module.css";

export function CartView() {
  // SSR renders a deterministic empty shell; the real cart is read from localStorage on mount
  // (cart lives client-side so it survives the Toss redirect — enables F016).
  const [cart, setCart] = useState<Cart>({ lines: [], qrVideoAddon: false });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setCart(loadCart());
    setReady(true);
  }, []);
  const isEmpty = cart.lines.length === 0;

  // F051 — immediate, reversible line removal: pure removeLine + persist + re-render.
  // Reversible because the buyer can re-add from the template in seconds (no server state).
  function onRemove(lineId: string) {
    // Side effects (persist + change event) stay OUT of the setState updater —
    // React can run updaters during render, and saveCart notifies NavClient.
    const next = removeLine(cart, lineId);
    saveCart(next);
    setCart(next);
  }

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="cart-title">
          <p className="eyebrow">Cart</p>
          <h1 className="hero__title" id="cart-title">장바구니</h1>
        </section>
        <section className={styles.cart} aria-label="장바구니" data-testid="cart">
          {ready &&
            (isEmpty ? (
              <div className={styles.empty} data-testid="cart-empty">
                <p>장바구니가 비어 있습니다.</p>
                <CtaPrimary href="/anniversary">그림책 둘러보기</CtaPrimary>
              </div>
            ) : (
              <>
                {cart.lines.map((line) => (
                  <div key={line.id} className={styles.cartLine} data-testid="cart-line">
                    {/* Typographic cover thumbnail — decorative (aria-hidden inside);
                        the line's visible text carries the announced content. */}
                    <span className={styles.thumb}>
                      <TypographicCover title={`「${line.templateLabel}」`} />
                    </span>
                    <span className={styles.lineBody}>
                      <span className={styles.cartLineTitle} data-testid="cart-line-title">{line.templateLabel}</span>
                      <span className={styles.cartLineMeta} data-testid="cart-line-cover">{COVER_LABEL[line.coverType]}</span>
                      <span className={styles.cartLineMeta} data-testid="cart-line-person">
                        {line.personalization.childName} · {line.personalization.childGender === "MALE" ? "남아" : "여아"}
                      </span>
                    </span>
                    <span className={styles.lineEnd}>
                      <span className={styles.linePrice}>{formatWon(line.unitPriceWon)}</span>
                      <TextAction
                        onClick={() => onRemove(line.id)}
                        data-testid="cart-line-remove"
                        aria-label={`${line.templateLabel} 삭제`}
                      >
                        삭제
                      </TextAction>
                    </span>
                  </div>
                ))}
                {cart.qrVideoAddon && (
                  <p className={styles.qrTag} data-testid="cart-qr">QR 영상 옵션 · 기본 미포함 · 요금 추후 안내</p>
                )}
                <div className={styles.cartTotals}>
                  <span>총 결제 금액</span>
                  <span className={styles.grandTotal} data-testid="cart-grand-total">{formatWon(grandTotalWon(cart))}</span>
                </div>
                {/* F051 — on mobile this row pins to the viewport bottom (sticky bar with the
                    grand total); on desktop it is a plain row. ONE pill either way (#4). */}
                <div className={styles.payBar} data-testid="cart-paybar">
                  <span className={styles.payBarTotal} data-testid="cart-paybar-total">
                    {formatWon(grandTotalWon(cart))}
                  </span>
                  <CtaPrimary href="/checkout" data-testid="cart-checkout">결제하기</CtaPrimary>
                </div>
              </>
            ))}
        </section>
      </main>
      <Footer />
    </>
  );
}
