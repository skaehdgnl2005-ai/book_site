"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

export interface Slot {
  value: string;
  label: string;
}

// Uncontrolled inputs + FormData + mounted-gated submit (same hydration-safe pattern as the
// written form). Slots are computed on the server and passed in as props.
export function PhoneForm({ slots }: { slots: Slot[] }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => setMounted(true), []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const slot = String(fd.get("slot") ?? "").trim();
    const name = String(fd.get("name") ?? "").trim();
    const phone = String(fd.get("phone") ?? "").trim();
    const memo = String(fd.get("memo") ?? "").trim();
    if (!slot || !name || !phone) {
      setError("상담 시간 · 이름 · 연락처를 입력해 주세요.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/custom/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, name, phone, memo }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        router.push(`/custom/complete/${data.id}`);
        return;
      }
      setError(Array.isArray(data.errors) ? data.errors.join(" ") : "예약에 실패했습니다.");
      setPending(false);
    } catch {
      setError("네트워크 오류로 예약하지 못했습니다.");
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>예약 가능 시간</legend>
        <div className={styles.slots}>
          {slots.map((s) => (
            <label key={s.value} className={styles.slot}>
              <input type="radio" name="slot" value={s.value} data-testid="slot" />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>예약자 정보</legend>
        <label className={styles.field}>
          이름
          <input className={styles.input} name="name" type="text" />
        </label>
        <label className={styles.field}>
          연락처
          <input className={styles.input} name="phone" type="text" />
        </label>
        <label className={styles.field}>
          한 줄 메모 (선택)
          <textarea className={styles.input} name="memo" rows={2} />
        </label>
      </fieldset>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="cta" disabled={!mounted || pending}>
        {pending ? "예약 중…" : "이 시간으로 상담 예약하기"}
      </button>
    </form>
  );
}
