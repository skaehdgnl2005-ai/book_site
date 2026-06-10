import { NextResponse } from "next/server";
import { untrusted } from "@/lib/guardrails";
import { getTemplateByKey } from "@/app/_components/catalog/templates";
import { buildOrderDraft, checkoutProvider } from "../_lib/checkout";
import { orderRepo } from "../_lib/orders";

export const dynamic = "force-dynamic";

/**
 * F012/F044 — create a TossPayments payment from the cart. The body is untrusted() at the boundary;
 * the amount is RECOMPUTED server-side from authoritative Template prices (the client totals are
 * display-only). The response carries ONLY public, non-secret fields the browser SDK needs
 * (clientKey is the publishable test key); the browser opens the real Toss window via requestPayment.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errors: ["잘못된 요청입니다."] }, { status: 400 });
  }

  const built = await buildOrderDraft(untrusted(body).value, getTemplateByKey);
  if (!built.ok) return NextResponse.json({ errors: built.errors }, { status: built.status });

  const order = await orderRepo().create(built.draft);
  const origin = new URL(req.url).origin;

  const checkout = checkoutProvider().createCheckout({
    orderId: order.id,
    amount: order.amountWon,
    orderName: order.orderName, // PII-free product summary
    successUrl: `${origin}/checkout/success`,
    failUrl: `${origin}/checkout/failed`,
  });

  return NextResponse.json({
    orderId: order.id,
    clientKey: checkout.clientKey,
    amount: checkout.amount, // server-issued; the client forwards this to requestPayment as-is
    orderName: checkout.orderName,
    successUrl: checkout.successUrl,
    failUrl: checkout.failUrl,
  });
}
