import { NextResponse } from "next/server";
import { untrusted } from "@/lib/guardrails";
import { confirmPayment, checkoutProvider } from "../_lib/checkout";
import { orderRepo } from "../_lib/orders";
import { orderConfirmationNotifier } from "../_lib/notify";

export const dynamic = "force-dynamic";

/**
 * F013 (sync) — settle a payment after the buyer returns from the gateway. The client
 * sends `{orderId, paymentKey}` (untrusted); the confirm amount is the SERVER-held
 * `order.amountWon`, never a client value. A non-PAID result returns 402 and leaves the
 * order CREATED (F015: no PAID order). Marking PAID is idempotent (see orders.markPaid).
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errors: ["잘못된 요청입니다."] }, { status: 400 });
  }
  const v = untrusted(body).value as { orderId?: unknown; paymentKey?: unknown };
  const res = await confirmPayment(
    orderRepo(),
    checkoutProvider(),
    { orderId: v?.orderId, paymentKey: v?.paymentKey },
    orderConfirmationNotifier(), // F055: exactly-once via markPaid.transitioned
  );
  return NextResponse.json(res.body, { status: res.status });
}
