import { NextResponse } from "next/server";
import {
  processWebhook,
  webhookSecret,
  checkoutProvider,
  type PaymentLookup,
} from "../_lib/checkout";
import { orderRepo, webhookLedger } from "../_lib/orders";

export const dynamic = "force-dynamic";

/**
 * F045 (async safety-net) — TossPayments PAYMENT_STATUS_CHANGED webhook.
 *
 * Toss does NOT sign payment webhooks, so the body is an untrusted NOTIFICATION. We
 * authenticate with a shared URL token (registered as `?token=…` in the Toss dashboard,
 * value = TOSS_WEBHOOK_SECRET) and then RE-QUERY the authoritative payment from Toss
 * (`lookupPayment`, secret-key Basic auth) — only that status/amount can settle an order.
 * Idempotent via the ProcessedWebhook ledger; converges with the success-callback confirm.
 *
 * RAW body is read FIRST (`req.text()`) and parsed only inside `processWebhook`, never via
 * `req.json()` — the documented raw-body-before-parse discipline (no stream double-read).
 */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const token = new URL(req.url).searchParams.get("token");
  const secret = webhookSecret();
  if (!secret) {
    return NextResponse.json({ errors: ["웹훅 비밀키가 설정되지 않았습니다."] }, { status: 401 });
  }
  const provider = checkoutProvider();
  const lookup: PaymentLookup = (paymentKey) => provider.lookupPayment(paymentKey);
  try {
    const res = await processWebhook(rawBody, token, secret, orderRepo(), webhookLedger(), lookup);
    return NextResponse.json(res.body, { status: res.status });
  } catch {
    // Transient re-query / DB error → 5xx so Toss RETRIES (it retries non-2xx up to 7× over
    // ~3d19h). A definitively-missing payment returns null → a 200 ack (no retry storm).
    return NextResponse.json({ errors: ["일시적인 오류로 웹훅을 처리하지 못했습니다."] }, { status: 503 });
  }
}
