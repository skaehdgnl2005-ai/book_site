import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./form.module.css";

/**
 * WP2 — file-input replacement: a low panel band (NOT a 4:5 mat) with
 * "사진 올리기" copy + hint. The real <input type="file"> overlays the band
 * (opacity:0, still in layout) so Playwright setInputFiles([data-testid])
 * and click-to-open keep working; the caller keeps naming it via
 * aria-labelledby / aria-label. `previewUrl` is a local blob: URL created by
 * the caller (URL.createObjectURL) — it carries no filename, and nothing here
 * is ever logged (PII rule).
 */
type FileDropProps = {
  title?: ReactNode;
  hint?: ReactNode;
  /** Local object URL for the uploaded photo thumbnail (no PII in the DOM). */
  previewUrl?: string | null;
} & InputHTMLAttributes<HTMLInputElement>;

export function FileDrop({ title = "사진 올리기", hint, previewUrl, ...input }: FileDropProps) {
  return (
    <div className={styles.drop}>
      <input type="file" className={styles.overlayInput} {...input} />
      {previewUrl ? (
        <span className={styles.dropThumb} aria-hidden="true">
          {/* plain <img>: next/image cannot optimize ephemeral blob: URLs */}
          <img src={previewUrl} alt="" />
        </span>
      ) : null}
      <span className={styles.dropCopy}>
        <span className={styles.dropTitle}>{title}</span>
        {hint != null ? <span className={styles.dropHint}>{hint}</span> : null}
      </span>
    </div>
  );
}
