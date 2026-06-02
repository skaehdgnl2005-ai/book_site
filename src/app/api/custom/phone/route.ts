import { NextResponse } from "next/server";
import { untrusted } from "@/lib/guardrails";
import { validatePhoneInput, buildPhoneIntake, customRequestStore } from "@/lib/customRequest";

/**
 * F022 — PHONE path: a free consultation booking. Stores a CustomRequest with a Consultation
 * REQUESTED and takes NO upfront payment (web-brief §4: 예약은 무료 → 상담 후 결제).
 *
 * Deliberately NOT guarded by `requireApproval("consultation.book")`: that irreversible action
 * is the operator-side 예약 *확정* (creating a real customer-facing appointment), not a customer's
 * request for a slot. A REQUESTED booking is a wish pending confirmation (D3 in the design spec).
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errors: ["잘못된 요청입니다."] }, { status: 400 });
  }

  const v = validatePhoneInput(untrusted(body).value);
  if (!v.ok) return NextResponse.json({ errors: v.errors }, { status: 400 });

  const rec = await customRequestStore.create(buildPhoneIntake(v.value));
  return NextResponse.json({ id: rec.id });
}
