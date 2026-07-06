"use client";
import { useEffect, useState, type ChangeEvent } from "react";
import type { Draft } from "../OrderWizard";
import { uploadChildPhoto } from "../photo-action";
import { BackAction, CtaPrimary, TextAction } from "../../Button";
import { FileDrop } from "../../form/FileDrop";
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
  // Local blob: URL for the FileDrop thumbnail — created here, never logged
  // (no filename/PII in a blob URL). Revoked when replaced and on unmount.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
      if (res.ok) {
        onPatch({ photo: res.photo });
        setPreviewUrl(URL.createObjectURL(file));
      } else {
        setError(res.error);
        onPatch({ photo: null });
        setPreviewUrl(null);
      }
    } catch {
      setError("사진을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.");
      onPatch({ photo: null });
      setPreviewUrl(null);
    } finally {
      setBusy(false);
      input.value = ""; // allow re-selecting the same file to re-fire onChange
    }
  };

  return (
    <div className={styles.step}>
      <p className={styles.label} id="order-photo-label">아이 사진 (선택 — 나중에 마이페이지에서 올려도 됩니다)</p>
      {/* F048 — why we ask: the photo shapes the protagonist's look. Honest scope
          (참고합니다), no mechanism claims either way. */}
      <p className={styles.hint} data-testid="order-photo-hint">
        올려 주신 사진은 이야기 속 주인공의 모습을 담는 데 참고합니다. 지금 없어도 괜찮아요 —
        결제 후 마이페이지에서 올릴 수 있습니다.
      </p>
      <FileDrop data-testid="order-photo-input" accept="image/*" aria-labelledby="order-photo-label"
        onChange={onFile} disabled={busy}
        title={busy ? "올리는 중…" : draft.photo ? "다른 사진으로 바꾸기" : "사진 올리기"}
        hint="눌러서 사진을 선택하세요 · 건너뛰어도 됩니다"
        previewUrl={draft.photo ? previewUrl : null} />
      {draft.photo && <p className={styles.photoStatus} data-testid="order-photo-status">사진 첨부됨</p>}
      {error && <p className={styles.error} role="alert" data-testid="order-photo-error">{error}</p>}
      <div className={styles.nav}>
        <BackAction data-testid="order-back" onClick={onBack} />
        <div className={styles.navGroup}>
          <TextAction data-testid="order-photo-skip"
            onClick={() => { onPatch({ photo: null }); onNext(); }}>건너뛰기</TextAction>
          <CtaPrimary data-testid="order-next" onClick={onNext}>다음</CtaPrimary>
        </div>
      </div>
    </div>
  );
}
