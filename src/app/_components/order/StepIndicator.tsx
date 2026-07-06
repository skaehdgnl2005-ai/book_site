import styles from "./order.module.css";

// F050 — the wizard's 4-step progress indicator (01 아이 정보 → 04 확인).
// Grotesk structure text: tracking lives ONLY on the Latin step numbers; the Korean
// labels stay at letter-spacing 0 (DESIGN.md 자간 3단 규칙). The active step is the
// screen's quiet navy moment #2 (활성 내비): navy text + a 1px navy underline, and it
// carries aria-current="step" for AT. Driven by the wizard reducer's stepIndex.
const STEP_ITEMS = [
  { num: "01", label: "아이 정보" },
  { num: "02", label: "사진" },
  { num: "03", label: "커버" },
  { num: "04", label: "확인" },
] as const;

export function StepIndicator({ stepIndex }: { stepIndex: number }) {
  return (
    <ol
      className={styles.stepIndicator}
      data-testid="order-step-indicator"
      aria-label="주문 진행 단계"
    >
      {STEP_ITEMS.map((item, i) => (
        <li
          key={item.num}
          className={i === stepIndex ? `${styles.stepItem} ${styles.stepItemActive}` : styles.stepItem}
          aria-current={i === stepIndex ? "step" : undefined}
        >
          <span className={styles.stepNum} aria-hidden="true">{item.num}</span>
          <span className={styles.stepLabel}>{item.label}</span>
        </li>
      ))}
    </ol>
  );
}
