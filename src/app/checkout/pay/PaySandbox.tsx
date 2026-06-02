"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearCart } from "@/lib/cart";
import styles from "../checkout.module.css";

/**
 * The three Toss outcome branches, hermetic. 승인 confirms via /api/payments/confirm and —
 * ONLY on PAID — calls clearCart() (client-side localStorage) before navigating to the
 * order page. 실패 → /checkout/failed; 취소 → /cart. Neither touches the cart, so the cart
 * is preserved on failure/cancel (F015/F016). The synthetic paymentKey stands in for the
 * one a real Toss success redirect would carry.
 */
export function PaySandbox({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, paymentKey: `test_pk_${orderId}` }),
      });
      const data = (await res.json()) as { status?: string };
      if (res.ok && data.status === "PAID") {
        clearCart(); // only after PAID — preserves the cart on failure/cancel
        router.push(`/orders/${orderId}`);
        return;
      }
      setError("결제가 승인되지 않았습니다. 다시 시도해 주세요.");
      setBusy(false);
    } catch {
      setError("결제 처리 중 오류가 발생했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.payActions}>
      <button className="cta" type="button" data-testid="pay-approve" onClick={approve} disabled={busy}>
        결제 승인
      </button>
      <button
        className={styles.payAlt}
        type="button"
        data-testid="pay-fail"
        onClick={() => router.push("/checkout/failed")}
        disabled={busy}
      >
        결제 실패
      </button>
      <button
        className={styles.payAlt}
        type="button"
        data-testid="pay-cancel"
        onClick={() => router.push("/cart")}
        disabled={busy}
      >
        취소
      </button>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
