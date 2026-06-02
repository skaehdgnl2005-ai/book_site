import { NextResponse } from "next/server";
import { untrusted } from "@/lib/guardrails";
import {
  validateWrittenInput,
  buildWrittenIntake,
  customRequestStore,
  customTossProvider,
  CUSTOM_PRICE_WON,
} from "@/lib/customRequest";

/**
 * F021 — WRITTEN path, step 1: validate the 6-group 의뢰서 and open a (test) checkout.
 * The request is stored PENDING_PAYMENT; it becomes SUBMITTED only after the payment
 * settles (see ./confirm). External input is tagged `untrusted()` at the boundary (E4)
 * and never logged.
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
  const origin = new URL(req.url).origin;
  const checkout = customTossProvider().createCheckout({
    orderId: rec.id,
    amount: CUSTOM_PRICE_WON,
    orderName: "맞춤 제작 그림책",
    successUrl: `${origin}/custom/complete/${rec.id}`,
    failUrl: `${origin}/custom/written`,
  });

  return NextResponse.json({ id: rec.id, checkout });
}
