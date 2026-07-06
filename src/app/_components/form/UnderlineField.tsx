import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import styles from "./form.module.css";

/**
 * WP2 — underline text field (DESIGN.md #4: 폼은 밑줄 1줄, :focus = 네이비).
 * Wrapping <label> gives the control its accessible name (a11y.spec audit);
 * everything else (data-testid, aria-invalid, aria-describedby, value/onChange)
 * passes straight through to the native input, so E2E contracts stay intact.
 * `type="date"` keeps the native picker — pair it with a Korean `hint` caption.
 * Errors stay OUTSIDE (callers keep their existing <p role="alert"> siblings).
 */
type BaseProps = {
  label: ReactNode;
  /** data-testid rendered on the label span (e.g. order-extravar-label). */
  labelTestId?: string;
  /** Quiet caption under the field, e.g. 날짜 형식 예시. */
  hint?: ReactNode;
};

export function UnderlineField({
  label,
  labelTestId,
  hint,
  ...input
}: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={styles.field}>
      <label className={styles.labelWrap}>
        <span className={styles.label} data-testid={labelTestId}>
          {label}
        </span>
        <input className={styles.input} {...input} />
      </label>
      {hint != null ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

export function UnderlineTextarea({
  label,
  labelTestId,
  hint,
  ...textarea
}: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={styles.field}>
      <label className={styles.labelWrap}>
        <span className={styles.label} data-testid={labelTestId}>
          {label}
        </span>
        <textarea className={`${styles.input} ${styles.textarea}`} {...textarea} />
      </label>
      {hint != null ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}
