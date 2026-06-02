"use client";
import type { Draft } from "../OrderWizard";
import styles from "../order.module.css";

export function PhotoStep({ onNext, onBack }: { draft: Draft; onPatch: (p: Partial<Draft>) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div className={styles.step}>
      <div className={styles.nav}>
        <button className={styles.back} type="button" data-testid="order-back" onClick={onBack}>뒤로</button>
        <button className="cta" type="button" data-testid="order-next" onClick={onNext}>다음</button>
      </div>
    </div>
  );
}
