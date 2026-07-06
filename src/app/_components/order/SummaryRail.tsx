import type { CatalogTemplate } from "../catalog/templates";
import { TypographicCover } from "../catalog/TypographicCover";
import type { Draft } from "./OrderWizard";
import { formatWon, COVER_LABEL } from "./format";
import styles from "./order.module.css";

// F050 — the order-summary block, shared by the desktop rail AND the review (04 확인)
// step so the two can never drift. Rows fill in as the buyer completes each step; a
// not-yet-answered row shows a muted "—" (never a pretend value). The price is only
// stated once the cover step is reached (the buyer hasn't picked a cover before that) —
// earlier steps show the honest soft-cover base price as "…부터".
const PENDING = "—";

export function OrderSummary({
  template,
  draft,
  stepIndex,
  unitPriceWon,
  showTitle = true,
  testId,
  className,
}: {
  template: CatalogTemplate;
  draft: Draft;
  stepIndex: number;
  unitPriceWon: number;
  /** false in the rail: the TypographicCover mat above already names the book. */
  showTitle?: boolean;
  testId?: string;
  className?: string;
}) {
  const infoDone = stepIndex >= 1; // 아이 정보 completed
  const photoDecided = stepIndex >= 2; // photo uploaded or explicitly skipped
  const coverReached = stepIndex >= 2; // cover choice is live from the cover step on
  return (
    <div
      className={className ? `${styles.summary} ${className}` : styles.summary}
      data-testid={testId}
    >
      {showTitle && <span className={styles.summaryTitle}>{template.label}</span>}
      <span className={styles.summaryRow}>
        <span>아이</span>
        <span className={infoDone ? undefined : styles.summaryPending}>
          {infoDone
            ? `${draft.childName} · ${draft.childGender === "MALE" ? "남아" : "여아"}`
            : PENDING}
        </span>
      </span>
      <span className={styles.summaryRow}>
        <span>커버</span>
        <span className={coverReached ? undefined : styles.summaryPending}>
          {coverReached ? COVER_LABEL[draft.coverType] : PENDING}
        </span>
      </span>
      <span className={styles.summaryRow}>
        <span>사진</span>
        <span className={photoDecided ? undefined : styles.summaryPending}>
          {photoDecided ? (draft.photo ? "첨부됨" : "나중에 올리기") : PENDING}
        </span>
      </span>
      <span className={styles.summaryRow}>
        <span>QR 영상</span>
        <span className={coverReached ? undefined : styles.summaryPending}>
          {coverReached
            ? draft.qrVideoAddon
              ? "옵션 추가 (요금 추후 안내)"
              : "미포함"
            : PENDING}
        </span>
      </span>
      <span className={styles.summaryRow}>
        <span>금액</span>
        <span className={coverReached ? undefined : styles.summaryPending}>
          {coverReached
            ? formatWon(unitPriceWon)
            : `${formatWon(template.softPriceWon)}부터`}
        </span>
      </span>
    </div>
  );
}

// F050 — desktop (≥1024px) sticky rail: the book's visual anchor (typographic cover
// mat, 4:5 — same component as the catalog cards) + the filling order summary above.
// Hidden below 1024px (the mobile action bar takes over); sticky so the product stays
// in view while the left column's form scrolls. aria-hidden mat (decorative — the rail's
// text rows carry the announced content, and the compact header already names the book).
export function SummaryRail({
  template,
  draft,
  stepIndex,
  unitPriceWon,
}: {
  template: CatalogTemplate;
  draft: Draft;
  stepIndex: number;
  unitPriceWon: number;
}) {
  return (
    <aside className={styles.rail} aria-label="주문 요약" data-testid="order-summary-rail">
      <TypographicCover title={`「${template.label}」`} kicker="Picture book" />
      <OrderSummary
        template={template}
        draft={draft}
        stepIndex={stepIndex}
        unitPriceWon={unitPriceWon}
        showTitle={false}
      />
    </aside>
  );
}
