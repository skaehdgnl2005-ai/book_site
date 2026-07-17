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

/**
 * F069 — the TossPayments 결제위젯(payment widget) boundary. Unlike the single-method 결제창
 * (requestTossPayment above, still used by the 맞춤 written flow), the widget renders selectable
 * payment methods INCLUDING 간편결제(네이버페이·카카오페이·토스페이) into DOM containers, then
 * requestPayment opens the window for the method the buyer picked. Amount comes from setAmount
 * (NOT the request). Same SDK-isolation as requestTossPayment so E2E can plant window.TossPayments.
 */
export interface CheckoutWidgets {
  setAmount(amount: { currency: string; value: number }): Promise<void>;
  renderPaymentMethods(params: { selector: string; variantKey?: string }): Promise<unknown>;
  renderAgreement(params: { selector: string; variantKey?: string }): Promise<unknown>;
  requestPayment(req: {
    orderId: string;
    orderName: string;
    successUrl: string;
    failUrl: string;
  }): Promise<void>;
}

export async function loadCheckoutWidgets(clientKey: string): Promise<CheckoutWidgets> {
  const { loadTossPayments, ANONYMOUS } = await import("@tosspayments/tosspayments-sdk");
  const toss = await loadTossPayments(clientKey);
  return toss.widgets({ customerKey: ANONYMOUS }) as unknown as CheckoutWidgets;
}
