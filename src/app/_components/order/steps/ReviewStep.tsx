"use client";
import type { CatalogTemplate } from "../../catalog/templates";
import { formatWon, COVER_LABEL } from "../format";
import type { Draft } from "../OrderWizard";
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
      <div className={styles.summary} data-testid="order-review-summary">
        <span className={styles.summaryTitle}>{template.label}</span>
        <span className={styles.summaryRow}><span>아이</span><span>{draft.childName} · {draft.childGender === "MALE" ? "남아" : "여아"}</span></span>
        <span className={styles.summaryRow}><span>커버</span><span>{COVER_LABEL[draft.coverType]}</span></span>
        <span className={styles.summaryRow}><span>사진</span><span>{draft.photo ? "첨부됨" : "나중에 올리기"}</span></span>
        <span className={styles.summaryRow}><span>QR 영상</span><span>{draft.qrVideoAddon ? "옵션 추가 (요금 추후 안내)" : "미포함"}</span></span>
        <span className={styles.summaryRow}><span>금액</span><span>{formatWon(unitPriceWon)}</span></span>
      </div>
      <div className={styles.nav}>
        <button className={styles.back} type="button" data-testid="order-back" onClick={onBack}>뒤로</button>
        <button className="cta" type="button" data-testid="order-add-to-cart" onClick={onAddToCart}>장바구니에 담기</button>
      </div>
    </div>
  );
}
