"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "../Nav";
import { Footer } from "../Footer";
import { formatWon } from "./format";
import { loadCart, grandTotalWon, type Cart } from "@/lib/cart";
import styles from "./order.module.css";

const COVER_LABEL = { SOFT: "소프트커버", HARD: "하드커버" } as const;

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
                <Link className="cta" href="/anniversary">그림책 둘러보기</Link>
              </div>
            ) : (
              <>
                {cart.lines.map((line) => (
                  <div key={line.id} className={styles.cartLine} data-testid="cart-line">
                    <span className={styles.cartLineTitle} data-testid="cart-line-title">{line.templateLabel}</span>
                    <span className={styles.cartLineMeta} data-testid="cart-line-cover">{COVER_LABEL[line.coverType]}</span>
                    <span className={styles.cartLineMeta} data-testid="cart-line-person">
                      {line.personalization.childName} · {line.personalization.childGender === "MALE" ? "남아" : "여아"}
                    </span>
                    <span className={styles.cartLineMeta}>{formatWon(line.unitPriceWon)}</span>
                  </div>
                ))}
                {cart.qrVideoAddon && (
                  <p className={styles.qrTag} data-testid="cart-qr">QR 영상 옵션 · 기본 미포함 · 요금 추후 안내</p>
                )}
                <div className={styles.cartTotals}>
                  <span>총 결제 금액</span>
                  <span className={styles.grandTotal} data-testid="cart-grand-total">{formatWon(grandTotalWon(cart))}</span>
                </div>
                <button className="cta" type="button" data-testid="cart-checkout" disabled>결제하기 (준비중)</button>
              </>
            ))}
        </section>
      </main>
      <Footer />
    </>
  );
}
