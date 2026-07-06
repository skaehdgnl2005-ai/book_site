"use client";
import type { CatalogTemplate } from "../../catalog/templates";
import { formatWon } from "../format";
import type { Draft } from "../OrderWizard";
import { BackAction, CtaPrimary } from "../../Button";
import { OrderSummary } from "../SummaryRail";
import styles from "../order.module.css";

export function ReviewStep({
  template, draft, unitPriceWon, onBack, onAddToCart,
}: {
  template: CatalogTemplate;
  draft: Draft;
  unitPriceWon: number;
  onBack: () => void;
  onAddToCart: () => void;
}) {
  return (
    <div className={styles.step}>
      {/* F050 — same summary component as the desktop rail (no drift). ≥1024px the
          sticky rail already shows this card, so the in-column copy hides there
          (summaryMobileOnly) instead of duplicating the same rows side by side. */}
      <OrderSummary
        template={template}
        draft={draft}
        stepIndex={3}
        unitPriceWon={unitPriceWon}
        testId="order-review-summary"
        className={styles.summaryMobileOnly}
      />
      <div className={styles.nav}>
        <BackAction data-testid="order-back" onClick={onBack} />
        <div className={styles.navGroup}>
          <p className={styles.navPrice} data-testid="order-line-price">{formatWon(unitPriceWon)}</p>
          <CtaPrimary data-testid="order-add-to-cart" onClick={onAddToCart}>장바구니에 담기</CtaPrimary>
        </div>
      </div>
    </div>
  );
}
