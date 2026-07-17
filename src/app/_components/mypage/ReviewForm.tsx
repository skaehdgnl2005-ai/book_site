"use client";
import { useActionState, useEffect, useState } from "react";
import { submitReview, type ReviewActionState } from "@/app/reviews/_lib/actions";
import { RATING_MAX } from "@/app/reviews/_lib/reviews";
import styles from "./mypage.module.css";

/**
 * F071 — 구매 인증 후기 작성 폼 (결제 완료 주문의 마이페이지에 노출). 서버 액션(submitReview)이
 * 작성 권한(hasOrderAccess)·구매 인증(paid)·중복(주문당 1개)을 재검증한다(UX ≠ 게이트). 이미 작성한
 * 주문이면 감사 안내만. 별점은 라디오(별점 미선택은 서버가 거부).
 */
export function ReviewForm({ orderId, alreadyReviewed }: { orderId: string; alreadyReviewed: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [state, action, pending] = useActionState(submitReview, {} as ReviewActionState);

  // state.ok is checked FIRST: this form's own submit revalidates /mypage, which re-renders us with
  // alreadyReviewed=true — so the success acknowledgement must win over the already-reviewed branch
  // (a FRESH page load has state.ok=false and shows review-done).
  if (state.ok) {
    return (
      <p className={styles.note} data-testid="review-success">
        후기가 등록되었어요. 감사합니다! 후기 페이지에서 확인하실 수 있어요.
      </p>
    );
  }
  if (alreadyReviewed) {
    return (
      <p className={styles.note} data-testid="review-done">
        이 주문의 후기를 남겨 주셨어요. 감사합니다!
      </p>
    );
  }

  return (
    <form action={action} className={styles.form} data-testid="review-form">
      <input type="hidden" name="orderId" value={orderId} />
      <fieldset className={styles.ratingGroup}>
        <legend className={styles.note}>별점</legend>
        {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((n) => (
          <label key={n} className={styles.ratingLabel}>
            <input type="radio" name="rating" value={n} data-testid={`review-rating-${n}`} />
            <span>{n}점 {"★".repeat(n)}</span>
          </label>
        ))}
      </fieldset>
      <label className={styles.note} htmlFor="review-body">
        후기 — 실명·아이 이름 등 개인정보는 남기지 말아 주세요.
      </label>
      <textarea id="review-body" name="body" rows={3} className={styles.control} data-testid="review-body" />
      <label className={styles.note} htmlFor="review-author">표시 이름 (선택 · 닉네임)</label>
      <input id="review-author" name="authorName" className={styles.control} data-testid="review-author" maxLength={40} />
      {state.error ? (
        <p role="alert" className={styles.error} data-testid="review-error">{state.error}</p>
      ) : null}
      <button type="submit" className="cta" data-testid="review-submit" disabled={!mounted || pending}>
        {pending ? "등록 중…" : "후기 남기기"}
      </button>
    </form>
  );
}
