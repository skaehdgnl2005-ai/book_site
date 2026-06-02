import { NextResponse } from "next/server";
import { untrusted } from "@/lib/guardrails";
import { customRequestStore, customTossProvider } from "@/lib/customRequest";

/**
 * F021 — WRITTEN path, step 2: settle the (test) payment, then mark the request SUBMITTED.
 * Outside production `customTossProvider()` uses a sandbox transport so this is hermetic
 * (ADR-0010); a non-PAID result never marks the request submitted (no phantom completion).
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const data = untrusted(body).value as { id?: unknown; paymentKey?: unknown };
  const id = typeof data.id === "string" ? data.id : "";
  const paymentKey = typeof data.paymentKey === "string" ? data.paymentKey : "";

  const rec = await customRequestStore.get(id);
  if (!rec) return NextResponse.json({ error: "접수 내역을 찾을 수 없습니다." }, { status: 404 });
  if (!paymentKey) return NextResponse.json({ error: "결제 정보가 없습니다." }, { status: 400 });

  const confirmation = await customTossProvider().confirm({
    paymentKey,
    orderId: id,
    amount: rec.amountWon,
  });
  if (confirmation.status !== "PAID") {
    return NextResponse.json({ status: confirmation.status }, { status: 402 });
  }
  const updated = await customRequestStore.markSubmitted(id);
  return NextResponse.json({ status: updated?.status ?? "SUBMITTED", id });
}
