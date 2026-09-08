"use client";
import type { CatalogTemplate } from "../../catalog/templates";
import type { Draft } from "../OrderWizard";
import { BackAction, CtaPrimary } from "../../Button";
import { ChoiceChip } from "../../form/ChoiceChip";
import { ToggleRow } from "../../form/ToggleRow";
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
          <ChoiceChip label={COVER_LABEL.SOFT} sub={formatWon(template.softPriceWon)}
            name="cover" data-testid="order-cover-soft"
            checked={draft.coverType === "SOFT"} onChange={() => onPatch({ coverType: "SOFT" })} />
          <ChoiceChip label={COVER_LABEL.HARD} sub={formatWon(template.hardPriceWon)}
            name="cover" data-testid="order-cover-hard"
            checked={draft.coverType === "HARD"} onChange={() => onPatch({ coverType: "HARD" })} />
        </div>
        {/* F048 — one honest line on what the choice means (no invented specs). */}
        <p className={styles.hint} data-testid="order-cover-hint">
          소프트커버는 가볍고 부드럽게, 하드커버는 오래 소장하도록 단단하게 제작됩니다.
        </p>
      </fieldset>

      <ToggleRow label="QR 영상 인사 메시지 옵션" data-testid="order-qr-toggle"
        checked={draft.qrVideoAddon} onChange={(e) => onPatch({ qrVideoAddon: e.target.checked })} />
      {draft.qrVideoAddon && <p className={styles.qrNote} data-testid="order-qr-note">기본 미포함 · 요금 추후 안내</p>}

      {/* F050 — the live line price sits in the action row (the mobile fixed bar shows
          금액 + CTA together from this step on; desktop reads it inline + in the rail). */}
      <div className={styles.nav}>
        <BackAction data-testid="order-back" onClick={onBack} />
        <div className={styles.navGroup}>
          <p className={styles.navPrice} data-testid="order-line-price">{formatWon(unitPriceWon)}</p>
          <CtaPrimary data-testid="order-next" data-analytics="order_next" onClick={onNext}>다음</CtaPrimary>
        </div>
      </div>
    </div>
  );
}
