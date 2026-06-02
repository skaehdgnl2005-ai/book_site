"use client";
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { saveDedication, uploadFinishingPhoto } from "@/app/mypage/_lib/actions";
import styles from "./mypage.module.css";

type ItemMeta = { index: number; templateLabel: string; coverLabel: string; unitPriceText: string };
type StateItem = { index: number; dedication: string; photoOnFile: boolean };
type FinishingState = { status: string; items: StateItem[] };

/**
 * F017/F018 — the post-pay finishing panel (client). The SSR shell carries only non-PII item meta;
 * the dedication (PII) + "on file" flags come from the cookie-gated, no-store `/state` route fetched
 * here. One finishing card per OrderItem (per-item photo + dedication); one order-level QR block
 * (rendered only when the add-on was chosen). bfcache (R4): on a back/forward restore we reload so a
 * shared-PC Back never shows stale prefilled PII.
 */
export function FinishingClient({
  orderId,
  qrAddon,
  items,
}: {
  orderId: string;
  qrAddon: boolean;
  items: ItemMeta[];
}) {
  const [state, setState] = useState<FinishingState | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/mypage/${orderId}/state`, { cache: "no-store" });
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      setState((await res.json()) as FinishingState);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setState(null); // drop any bfcache-restored PII from the DOM immediately
        window.location.reload(); // then force a fresh server-gated render (re-checks the cookie)
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  if (loadError) {
    return (
      <section className={styles.panel}>
        <p className={styles.error} role="alert">마무리 정보를 불러오지 못했습니다. 다시 시도해 주세요.</p>
      </section>
    );
  }
  if (!state) {
    return (
      <section className={styles.panel}>
        <p className={styles.note} data-testid="mypage-loading">불러오는 중…</p>
      </section>
    );
  }

  const byIndex = new Map(state.items.map((s) => [s.index, s]));

  return (
    <section className={styles.panel} aria-label="책 마무리">
      <ul className={styles.items} role="list" data-testid="mypage-items">
        {items.map((item) => {
          const s = byIndex.get(item.index) ?? { index: item.index, dedication: "", photoOnFile: false };
          return <FinishingItem key={item.index} orderId={orderId} meta={item} initial={s} />;
        })}
      </ul>
      {qrAddon ? <QrSection /> : null}
    </section>
  );
}

function FinishingItem({
  orderId,
  meta,
  initial,
}: {
  orderId: string;
  meta: ItemMeta;
  initial: StateItem;
}) {
  const [photoOnFile, setPhotoOnFile] = useState(initial.photoOnFile);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dedication, setDedication] = useState(initial.dedication);
  const [saved, setSaved] = useState(false);
  const [savingError, setSavingError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadFinishingPhoto(orderId, meta.index, fd);
      if (res.ok) setPhotoOnFile(true);
      else setPhotoError(res.error);
    } catch {
      setPhotoError("사진을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPhotoBusy(false);
      input.value = ""; // allow re-selecting the same file
    }
  };

  const onSaveDedication = async () => {
    setSaving(true);
    setSavingError(null);
    try {
      const res = await saveDedication(orderId, meta.index, dedication);
      if (res.ok) setSaved(true);
      else setSavingError(res.error);
    } catch {
      setSavingError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={styles.item}>
      <p className={styles.itemTitle}>
        <span data-testid={`mypage-item-title-${meta.index}`}>{meta.templateLabel}</span>
        <span className={styles.itemMeta}> · {meta.coverLabel} · {meta.unitPriceText}</span>
      </p>

      <div className={styles.control}>
        <p className={styles.controlLabel}>아이 사진</p>
        {photoOnFile ? (
          <p className={styles.photoStatus} data-testid={`mypage-photo-status-${meta.index}`}>
            사진이 등록되었습니다
          </p>
        ) : (
          <input
            type="file"
            accept="image/*"
            aria-label={`${meta.templateLabel} 아이 사진 파일 선택`}
            data-testid={`mypage-photo-input-${meta.index}`}
            onChange={onPhoto}
            disabled={photoBusy}
          />
        )}
        {photoError ? (
          <p className={styles.error} role="alert" data-testid={`mypage-photo-error-${meta.index}`}>{photoError}</p>
        ) : null}
      </div>

      <div className={styles.control}>
        <label className={styles.controlLabel} htmlFor={`mypage-dedication-${meta.index}`}>
          헌정 문구
        </label>
        <textarea
          id={`mypage-dedication-${meta.index}`}
          className={styles.textarea}
          data-testid={`mypage-dedication-${meta.index}`}
          rows={3}
          value={dedication}
          maxLength={500}
          onChange={(e) => {
            setDedication(e.target.value);
            setSaved(false);
          }}
        />
        <div className={styles.controlRow}>
          <button
            type="button"
            className="cta"
            data-testid={`mypage-dedication-save-${meta.index}`}
            onClick={onSaveDedication}
            disabled={saving}
          >
            {saving ? "저장 중…" : "헌정 문구 저장"}
          </button>
          {saved ? (
            <span className={styles.savedNote} role="status" data-testid={`mypage-dedication-saved-${meta.index}`}>
              저장되었습니다
            </span>
          ) : null}
        </div>
        {savingError ? (
          <p className={styles.error} role="alert">{savingError}</p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * QR 영상 옵션 안내 (option B / ADR-0016). The studio collects the video backstage — the web app
 * never receives or stores the file. So this is an honest notice, not an upload control.
 */
function QrSection() {
  return (
    <div className={styles.qrSection} aria-label="QR 영상">
      <p className={styles.controlLabel}>QR 영상 인사 메시지</p>
      <p className={styles.note} data-testid="mypage-qr-scope">이 QR 영상은 주문 전체에 한 번 적용됩니다.</p>
      <p className={styles.qrNote} data-testid="mypage-qr-note">QR 영상 옵션 · 기본 미포함 · 요금 추후 안내</p>
      <p className={styles.note} data-testid="mypage-qr-backstage">
        영상은 제작팀이 카카오톡·이메일로 따로 안내드려 받습니다. 여기서 업로드하지 않으셔도 됩니다.
      </p>
    </div>
  );
}
