"use client";
import type { CatalogTemplate } from "../../catalog/templates";
import type { Draft } from "../OrderWizard";
import styles from "../order.module.css";

export function ReviewStep({ onBack, onAddToCart }: { template: CatalogTemplate; draft: Draft; unitPriceWon: number; onBack: () => void; onAddToCart: () => void }) {
  return (
    <div className={styles.step}>
      <div className={styles.nav}>
        <button className={styles.back} type="button" data-testid="order-back" onClick={onBack}>뒤로</button>
        <button className="cta" type="button" data-testid="order-add-to-cart" onClick={onAddToCart}>장바구니에 담기</button>
      </div>
    </div>
  );
}
