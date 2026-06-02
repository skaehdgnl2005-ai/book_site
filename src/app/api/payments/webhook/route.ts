import { NextResponse } from "next/server";
import { processWebhook, webhookSecret } from "../_lib/checkout";
import { orderRepo, webhookLedger } from "../_lib/orders";

export const dynamic = "force-dynamic";

/**
 * F013 (async) — TossPayments webhook. Signature-verified + idempotent (ProcessedWebhook).
 *
 * CRITICAL: read the RAW body FIRST (`req.text()`). The HMAC must verify the exact wire
 * bytes; calling `req.json()` first would consume the stream and hash the wrong bytes.
 * Only `processWebhook` parses — and only after a valid signature.
 */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-toss-signature");
  const secret = webhookSecret();
  if (!secret) {
    return NextResponse.json({ errors: ["웹훅 비밀키가 설정되지 않았습니다."] }, { status: 401 });
  }
  const res = await processWebhook(rawBody, signature, secret, orderRepo(), webhookLedger());
  return NextResponse.json(res.body, { status: res.status });
}
