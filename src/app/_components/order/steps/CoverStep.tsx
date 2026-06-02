"use client";
import type { CatalogTemplate } from "../../catalog/templates";
import type { Draft } from "../OrderWizard";
import styles from "../order.module.css";
import { formatWon, COVER_LABEL } from "../format";

export function CoverStep({
  template, draft, unitPriceWon, onPatch, onNext, onBack,
}: {
  template: CatalogTemplate;
  draft: Draft;
  unitPriceWon: number;
  onPatch: (p: Partial<Draft>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className={styles.step}>
      <fieldset className={styles.field}>
        <legend className={styles.label}>커버 선택</legend>
        <div className={styles.choices}>
          <label className={`${styles.choice} ${draft.coverType === "SOFT" ? styles.choiceActive : ""}`}>
            <input type="radio" name="cover" data-testid="order-cover-soft"
              checked={draft.coverType === "SOFT"} onChange={() => onPatch({ coverType: "SOFT" })} />
            {COVER_LABEL.SOFT} <span className={styles.choicePrice}>{formatWon(template.softPriceWon)}</span>
          </label>
          <label className={`${styles.choice} ${draft.coverType === "HARD" ? styles.choiceActive : ""}`}>
            <input type="radio" name="cover" data-testid="order-cover-hard"
              checked={draft.coverType === "HARD"} onChange={() => onPatch({ coverType: "HARD" })} />
            {COVER_LABEL.HARD} <span className={styles.choicePrice}>{formatWon(template.hardPriceWon)}</span>
          </label>
        </div>
      </fieldset>

      <div className={styles.qrRow}>
        <label>
          <input type="checkbox" data-testid="order-qr-toggle"
            checked={draft.qrVideoAddon} onChange={(e) => onPatch({ qrVideoAddon: e.target.checked })} />
          {" "}QR 영상 인사 메시지 옵션
        </label>
      </div>
      {draft.qrVideoAddon && <p className={styles.qrNote} data-testid="order-qr-note">기본 미포함 · 요금 추후 안내</p>}

      <p className={styles.linePrice} data-testid="order-line-price">{formatWon(unitPriceWon)}</p>

      <div className={styles.nav}>
        <button className={styles.back} type="button" data-testid="order-back" onClick={onBack}>뒤로</button>
        <button className="cta" type="button" data-testid="order-next" onClick={onNext}>다음</button>
      </div>
    </div>
  );
}
