"use client";
import { useState, type FormEvent } from "react";
import { untrusted } from "@/lib/guardrails";
import styles from "./ContactForm.module.css";

// F028 contact form (client). Validates, tags input untrusted() at the trust
// boundary (E4), then shows HONEST guidance to use 전화/이메일 — never a fake "접수
// 완료", because there is no backend/mail sink in scope. No PII is logged.
export function ContactForm() {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const contact = String(data.get("contact") ?? "").trim();
    const message = String(data.get("message") ?? "").trim();
    if (!name || !contact || !message) {
      setError("이름·연락처·문의 내용을 모두 입력해 주세요.");
      return;
    }
    // Trust boundary: buyer-supplied input is untrusted. No sink yet → guide, don't claim receipt.
    const inquiry = untrusted({ name, contact, message });
    setError(null);
    setDone(
      `${inquiry.value.name}님, 남겨 주셔서 감사합니다. 문의 폼은 준비 중이라, ` +
        `가장 빠른 답변은 위의 전화·이메일로 연락 주시는 것입니다.`,
    );
  }

  if (done) {
    return (
      <p className={styles.note} role="status">
        {done}
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <label className={styles.field}>
        이름
        <input className={styles.input} name="name" type="text" />
      </label>
      <label className={styles.field}>
        연락처
        <input className={styles.input} name="contact" type="text" />
      </label>
      <label className={styles.field}>
        문의 내용
        <textarea className={styles.input} name="message" rows={4} />
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="cta">
        보내기
      </button>
    </form>
  );
}
