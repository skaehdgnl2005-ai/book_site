import { NextResponse } from "next/server";
import { untrusted } from "@/lib/guardrails";
import { getTemplateByKey } from "@/app/_components/catalog/templates";
import { buildOrderDraft, checkoutProvider } from "../_lib/checkout";
import { orderRepo } from "../_lib/orders";

export const dynamic = "force-dynamic";

/**
 * F012 — create a TossPayments (test) payment from the cart.
 * The body is `untrusted()` at the boundary; the amount is RECOMPUTED server-side from
 * authoritative Template prices (`getTemplateByKey`) — the client totals/unit prices are
 * display-only. The order carries buyer/child PII (server-side only; never logged). The
 * `payUrl` is computed here: outside production it drives the hermetic sandbox stand-in.
 */
export async function POST(req: Request): Promise<Response> {
  // Production checkout drives the REAL Toss SDK flow — a documented seam, not wired here.
  // Fail fast + honest rather than returning the sandbox payUrl that the prod pay page 404s.
  if (process.env.APP_ENV === "production") {
    return NextResponse.json({ errors: ["결제 기능이 아직 준비되지 않았습니다."] }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errors: ["잘못된 요청입니다."] }, { status: 400 });
  }

  const built = await buildOrderDraft(untrusted(body).value, getTemplateByKey);
  if (!built.ok) return NextResponse.json({ errors: built.errors }, { status: built.status });

  const order = orderRepo().create(built.draft);
  const origin = new URL(req.url).origin;

  // createCheckout returns only public, non-secret fields; orderName is PII-free.
  checkoutProvider().createCheckout({
    orderId: order.id,
    amount: order.amountWon,
    orderName: order.orderName,
    successUrl: `${origin}/orders/${order.id}`,
    failUrl: `${origin}/checkout/failed`,
  });

  // Outside production: the sandbox stand-in page drives success/fail/cancel. In production
  // the create route would return the real Toss-hosted URL instead (documented seam).
  return NextResponse.json({ orderId: order.id, payUrl: `/checkout/pay?order=${order.id}` });
}
