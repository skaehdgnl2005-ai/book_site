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
      {/* F050 — the 04 확인 summary lives in the working column at every width: it IS the
          content of the review step, so the desktop left column is never an empty frame.
          On desktop the rail drops its own summary (SummaryRail showSummary={false} on
          review) and keeps only the cover mat, so the rows are shown once, never twice. */}
      <OrderSummary
        template={template}
        draft={draft}
        stepIndex={3}
        unitPriceWon={unitPriceWon}
        testId="order-review-summary"
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
