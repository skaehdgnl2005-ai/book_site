import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./form.module.css";

/**
 * WP2 — checkbox replacement: a hairline row with the label on the left and a
 * quiet state marker on the right (checked = navy). Same overlay technique as
 * ChoiceChip — the real checkbox covers the row, so [data-testid] check()/
 * toBeChecked() contracts survive. Both state spans are rendered and toggled
 * via CSS :has(:checked); they are aria-hidden (the checkbox itself announces
 * its state to AT).
 */
type ToggleRowProps = {
  label: ReactNode;
  onLabel?: string;
  offLabel?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function ToggleRow({
  label,
  onLabel = "추가됨",
  offLabel = "추가하기",
  ...input
}: ToggleRowProps) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" className={styles.overlayInput} {...input} />
      <span className={styles.toggleLabel}>{label}</span>
      <span className={styles.toggleState} aria-hidden="true">
        <span className={styles.stateOff}>{offLabel}</span>
        <span className={styles.stateOn}>{onLabel}</span>
      </span>
    </label>
  );
}
