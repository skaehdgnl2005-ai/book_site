import { redirect } from "next/navigation";
import { confirmPayment, checkoutProvider } from "../../api/payments/_lib/checkout";
import { orderRepo } from "../../api/payments/_lib/orders";
import { orderConfirmationNotifier } from "../../api/payments/_lib/notify";
import { ClearCartRedirect } from "./ClearCartRedirect";

export const dynamic = "force-dynamic";

/**
 * F044/F070 — TossPayments success redirect lands here with ?paymentKey&orderId(&amount). We settle
 * server-side with the SERVER-held amount (the `amount` query is IGNORED — anti-tamper). confirmPayment
 * is idempotent (already-settled short-circuits), so a reload / webhook-first is safe. On PAID **or**
 * WAITING_FOR_DEPOSIT (F070 가상계좌 — order placed, deposit pending) a tiny client child clears the
 * localStorage cart and navigates to the canonical /orders/[id]; any other outcome → failed.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ paymentKey?: string; orderId?: string }>;
}) {
  const { paymentKey, orderId } = await searchParams;
  const res = await confirmPayment(orderRepo(), checkoutProvider(), { orderId, paymentKey }, orderConfirmationNotifier());
  const placed = res.status === 200 && (res.body.status === "PAID" || res.body.status === "WAITING_FOR_DEPOSIT");
  if (!placed) {
    redirect("/checkout/failed?code=CONFIRM_FAILED");
  }
  return <ClearCartRedirect orderId={String(orderId)} />;
}
