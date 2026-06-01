import type { ReactNode } from "react";
import styles from "./FaqItem.module.css";

// F027 one Q&A — native <details>/<summary> (no JS, accessible group). Answer
// collapses by default; clicking the summary reveals it. Styled via DESIGN tokens.
export function FaqItem({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className={styles.item}>
      <summary className={styles.q}>{q}</summary>
      <div className={styles.a}>{children}</div>
    </details>
  );
}
