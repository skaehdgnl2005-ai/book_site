import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./form.module.css";

/**
 * WP2 — radio replacement chip. The REAL input overlays the whole chip
 * (absolute inset:0, opacity:0 — never display:none/visibility:hidden) so
 * Playwright click()/check() on [data-testid] and native keyboard behavior
 * keep working. Selected = navy hairline + navy label; input:focus-visible
 * draws the focus ring on the chip (see form.module.css :has rules).
 */
type ChoiceChipProps = {
  label: ReactNode;
  /** Optional secondary slot — e.g. the cover price. */
  sub?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

export function ChoiceChip({ label, sub, type, ...input }: ChoiceChipProps) {
  return (
    <label className={styles.chip}>
      <input type={type ?? "radio"} className={styles.overlayInput} {...input} />
      <span className={styles.chipLabel}>{label}</span>
      {sub != null ? <span className={styles.chipSub}>{sub}</span> : null}
    </label>
  );
}
