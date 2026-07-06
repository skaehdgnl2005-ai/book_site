import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import styles from "./form.module.css";

/** Merge a caller-supplied aria-describedby (e.g. an error id) with the hint id so both
 *  are announced — never drop the error reference when a hint is present. */
function describedBy(passed: string | undefined, hintId: string | null): string | undefined {
  return [passed, hintId].filter(Boolean).join(" ") || undefined;
}

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
  const hintId = useId();
  const hasHint = hint != null;
  return (
    <div className={styles.field}>
      <label className={styles.labelWrap}>
        <span className={styles.label} data-testid={labelTestId}>
          {label}
        </span>
        <input
          className={styles.input}
          {...input}
          aria-describedby={describedBy(input["aria-describedby"], hasHint ? hintId : null)}
        />
      </label>
      {hasHint ? <p className={styles.hint} id={hintId}>{hint}</p> : null}
    </div>
  );
}

export function UnderlineTextarea({
  label,
  labelTestId,
  hint,
  ...textarea
}: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const hintId = useId();
  const hasHint = hint != null;
  return (
    <div className={styles.field}>
      <label className={styles.labelWrap}>
        <span className={styles.label} data-testid={labelTestId}>
          {label}
        </span>
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          {...textarea}
          aria-describedby={describedBy(textarea["aria-describedby"], hasHint ? hintId : null)}
        />
      </label>
      {hasHint ? <p className={styles.hint} id={hintId}>{hint}</p> : null}
    </div>
  );
}
