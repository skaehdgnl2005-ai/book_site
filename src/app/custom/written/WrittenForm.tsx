"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { FormGroupDef } from "@/lib/customRequest";
import { requestTossPayment, type TossCheckout } from "../../checkout/_lib/tossClient";
import styles from "./page.module.css";

// `import type` is erased at build time, so this client bundle never pulls in the
// payments/Buffer code that `customRequest.ts` also exports. The form shape arrives
// as a serialized prop from the server page.
//
// Inputs are UNCONTROLLED + read via FormData on submit (the proven ContactForm pattern):
// typed values survive hydration, and the submit button stays disabled until mounted so a
// click can never fire before React attaches the handler (no pre-hydration native submit).
export function WrittenForm({ groups }: { groups: readonly FormGroupDef[] }) {
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"form" | "pay">("form");
  const [pending, setPending] = useState(false);
  const [checkout, setCheckout] = useState<TossCheckout | null>(null);

  useEffect(() => setMounted(true), []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "").trim();

    const childName = get("protagonist.name");
    const contactName = get("contactName");
    const contactPhone = get("contactPhone");
    const contactEmail = get("contactEmail");
    if (!childName || !contactName || !contactPhone || !contactEmail) {
      setError("아이 이름 · 의뢰인 이름 · 연락처 · 이메일은 필수입니다.");
      return;
    }
    // F067 — 청약철회 제한 동의(주문제작). 서버가 최종 게이트, 여기는 빠른 안내.
    const withdrawalConsent = fd.get("withdrawalConsent") != null;
    if (!withdrawalConsent) {
      setError("주문 제작 상품의 청약철회 제한 안내에 동의해 주세요.");
      return;
    }
    setError(null);
    setPending(true);

    const answers: Record<string, Record<string, string>> = {};
    for (const g of groups) {
      answers[g.key] = {};
      for (const f of g.fields) answers[g.key][f.key] = get(`${g.key}.${f.key}`);
    }

    try {
      const res = await fetch("/api/custom/written", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactName, contactPhone, contactEmail, withdrawalConsent, answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(Array.isArray(data.errors) ? data.errors.join(" ") : "제출에 실패했습니다.");
        setPending(false);
        return;
      }
      setCheckout(data.checkout as TossCheckout); // server-issued (amount authoritative, F052)
      setStage("pay");
      setPending(false);
    } catch {
      setError("네트워크 오류로 제출하지 못했습니다.");
      setPending(false);
    }
  }

  // F052: the REAL TossPayments SDK window (F044 parity) — no hardcoded paymentKey. Toss
  // redirects to the server-issued successUrl (/custom/complete/[id]?paymentKey=…), where the
  // server settles with its own amount. A closed/aborted window rejects → re-enable the button.
  async function onPay() {
    if (!checkout) return;
    setPending(true);
    setError(null);
    try {
      await requestTossPayment(checkout);
    } catch {
      setError("결제가 완료되지 않았습니다. 다시 시도해 주세요.");
      setPending(false);
    }
  }

  if (stage === "pay") {
    return (
      <div className={styles.pay} data-testid="pay-step">
        <h2 className={styles.payTitle}>결제</h2>
        <p className={styles.payLine}>
          <span>맞춤 제작 그림책</span>
          <span>{(checkout?.amount ?? 119000).toLocaleString("ko-KR")}원</span>
        </p>
        <p className={styles.payNote}>
          TossPayments 테스트/샌드박스 결제입니다 — 실제 청구는 일어나지 않습니다.
        </p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <button type="button" className="cta" onClick={onPay} disabled={pending}>
          {pending ? "처리 중…" : "결제하기 (테스트)"}
        </button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>의뢰인</legend>
        <label className={styles.field}>
          의뢰인 이름
          <input className={styles.input} name="contactName" type="text" />
        </label>
        <label className={styles.field}>
          의뢰인 연락처
          <input className={styles.input} name="contactPhone" type="text" />
        </label>
        <label className={styles.field}>
          의뢰인 이메일
          <input className={styles.input} name="contactEmail" type="email" />
        </label>
      </fieldset>

      {groups.map((g) => (
        <fieldset key={g.key} className={styles.group}>
          <legend className={styles.legend}>
            {g.title}
            {g.star ? (
              <span className={styles.star} aria-hidden="true">
                {" ★"}
              </span>
            ) : null}
          </legend>
          {g.fields.map((f) => {
            const name = `${g.key}.${f.key}`;
            if (g.key === "expression" && f.key === "delegateToExpert") {
              return (
                <label key={name} className={styles.checkField}>
                  <input type="checkbox" name={name} value="예" />
                  {f.label}
                </label>
              );
            }
            if (g.key === "protagonist" && f.key === "name") {
              return (
                <label key={name} className={styles.field}>
                  {f.label}
                  <input className={styles.input} name={name} type="text" />
                </label>
              );
            }
            return (
              <label key={name} className={styles.field}>
                {f.label}
                <textarea className={styles.input} name={name} rows={2} />
              </label>
            );
          })}
        </fieldset>
      ))}

      {/* F067 — 결제 전 청약철회 제한 고지 + 동의(주문제작 상품, 17조 2항 6호).
          uncontrolled(FormData) — 이 폼의 기존 패턴 그대로. 서버(validateWrittenInput)가 최종 게이트. */}
      <label className={styles.checkField} data-testid="written-consent">
        <input type="checkbox" name="withdrawalConsent" value="예" data-testid="written-withdrawal-consent" />
        <span>
          맞춤 제작 그림책은 의뢰 내용에 따라 새로 만드는 <strong>주문 제작 상품</strong>으로,
          제작이 시작된 뒤에는 청약철회(취소·환불)가 제한됩니다. 안내를 확인했으며 이에
          동의합니다.{" "}
          <a href="/refund-policy" target="_blank" rel="noreferrer">
            청약철회·환불 정책 보기
          </a>
        </span>
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="cta" disabled={!mounted || pending}>
        {pending ? "제출 중…" : "결제하고 의뢰서 제출하기"}
      </button>
    </form>
  );
}
