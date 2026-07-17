import { NextResponse } from "next/server";
import { untrusted } from "@/lib/guardrails";
import { getTemplateByKey } from "@/app/_components/catalog/templates";
import { getSessionUser } from "@/app/account/_lib/sessionUser";
import { buildOrderDraft, checkoutProvider } from "../_lib/checkout";
import { orderRepo } from "../_lib/orders";

export const dynamic = "force-dynamic";

/**
 * F012/F044/F069 — create a TossPayments payment from the cart. The body is untrusted() at the
 * boundary; the amount is RECOMPUTED server-side from authoritative Template prices (the client
 * totals are display-only). The response carries only the order id + server-authoritative amount +
 * order name + callback URLs. F069: the entry checkout renders the 결제위젯 with the page-supplied
 * publishable widget key (checkoutClientKey), applies this amount via widgets.setAmount(), and the
 * buyer's chosen method drives requestPayment — so the response no longer needs to carry a clientKey.
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

  // F057 — a signed-in buyer's order is theirs from birth (guests link later via claim).
  const sessionUser = await getSessionUser();
  if (sessionUser) built.draft.userId = sessionUser.id;

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
    amount: checkout.amount, // server-authoritative; the client applies it via widgets.setAmount()
    orderName: checkout.orderName,
    successUrl: checkout.successUrl,
    failUrl: checkout.failUrl,
  });
}
