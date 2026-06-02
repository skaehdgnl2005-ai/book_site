"use client";
import { useState, type ChangeEvent } from "react";
import type { Draft } from "../OrderWizard";
import { uploadChildPhoto } from "../photo-action";
import styles from "../order.module.css";

export function PhotoStep({
  draft, onPatch, onNext, onBack,
}: {
  draft: Draft;
  onPatch: (p: Partial<Draft>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("photo", file);
      const res = await uploadChildPhoto(fd);
      if (res.ok) onPatch({ photo: res.photo });
      else {
        setError(res.error);
        onPatch({ photo: null });
      }
    } catch {
      setError("사진을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.");
      onPatch({ photo: null });
    } finally {
      setBusy(false);
      input.value = ""; // allow re-selecting the same file to re-fire onChange
    }
  };

  return (
    <div className={styles.step}>
      <p className={styles.label}>아이 사진 (선택 — 나중에 마이페이지에서 올려도 됩니다)</p>
      <input type="file" accept="image/*" data-testid="order-photo-input" onChange={onFile} disabled={busy} />
      {draft.photo && <p className={styles.photoStatus} data-testid="order-photo-status">사진 첨부됨</p>}
      {error && <p className={styles.error} data-testid="order-photo-error">{error}</p>}
      <div className={styles.nav}>
        <button className={styles.back} type="button" data-testid="order-back" onClick={onBack}>뒤로</button>
        <div className={styles.navGroup}>
          <button className={styles.back} type="button" data-testid="order-photo-skip"
            onClick={() => { onPatch({ photo: null }); onNext(); }}>건너뛰기</button>
          <button className="cta" type="button" data-testid="order-next" onClick={onNext}>다음</button>
        </div>
      </div>
    </div>
  );
}
