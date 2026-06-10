/**
 * F044 — the TossPayments browser SDK boundary. ONE function so the SDK call site is isolated
 * (and E2E can stand it in by planting window.TossPayments via addInitScript). Dynamic import
 * keeps the browser-only SDK out of the SSR module graph. amount MUST be the server-issued value
 * (from /api/payments/create); it must equal the confirm-time server amount or Toss rejects it.
 */
export interface TossCheckout {
  orderId: string;
  clientKey: string;
  amount: number; // KRW won (integer) — server-issued, forwarded as-is
  orderName: string;
  successUrl: string;
  failUrl: string;
}

export async function requestTossPayment(checkout: TossCheckout): Promise<void> {
  const { loadTossPayments, ANONYMOUS } = await import("@tosspayments/tosspayments-sdk");
  const toss = await loadTossPayments(checkout.clientKey);
  const payment = toss.payment({ customerKey: ANONYMOUS }); // 게스트 결제(buyer 인증 없음)
  await payment.requestPayment({
    method: "CARD",
    amount: { currency: "KRW", value: checkout.amount },
    orderId: checkout.orderId,
    orderName: checkout.orderName,
    successUrl: checkout.successUrl,
    failUrl: checkout.failUrl,
  });
}
