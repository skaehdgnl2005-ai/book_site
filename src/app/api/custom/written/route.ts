import { NextResponse } from "next/server";
import { untrusted } from "@/lib/guardrails";
import {
  validateWrittenInput,
  buildWrittenIntake,
  customRequestStore,
  customTossProvider,
  CUSTOM_PRICE_WON,
  CUSTOM_ORDER_NAME,
} from "@/lib/customRequest";
import { orderRepo } from "../../payments/_lib/orders";

/**
 * F021/F052 — WRITTEN path, step 1: validate the 6-group 의뢰서 and open a (test) checkout.
 * The request is stored PENDING_PAYMENT alongside a CREATED `Order(kind=CUSTOM)` whose
 * `id === tossOrderId === CustomRequest.id` (entry-flow parity: CREATED at intake → PAID at
 * settle; the async webhook can converge on it). It becomes SUBMITTED only after the payment
 * settles (settle.ts, driven by the Toss success redirect). External input is tagged
 * `untrusted()` at the boundary (E4) and never logged.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errors: ["잘못된 요청입니다."] }, { status: 400 });
  }

  const v = validateWrittenInput(untrusted(body).value);
  if (!v.ok) return NextResponse.json({ errors: v.errors }, { status: 400 });

  const rec = await customRequestStore.create(buildWrittenIntake(v.value));
  await orderRepo().create({
    kind: "CUSTOM",
    id: rec.id,
    amountWon: rec.amountWon,
    orderName: CUSTOM_ORDER_NAME,
    qrVideoAddon: false,
    buyerName: rec.contactName,
    buyerEmail: rec.contactEmail,
    // F067 — validateWrittenInput이 동의를 강제하므로 여기 도달 = 동의 완료. 시각을 증거로 남긴다.
    withdrawalConsentAt: new Date().toISOString(),
    items: [],
  });
  const origin = new URL(req.url).origin;
  const checkout = customTossProvider().createCheckout({
    orderId: rec.id,
    amount: CUSTOM_PRICE_WON,
    orderName: CUSTOM_ORDER_NAME,
    successUrl: `${origin}/custom/complete/${rec.id}`,
    failUrl: `${origin}/custom/written`,
  });

  return NextResponse.json({ id: rec.id, checkout });
}
