import { NextResponse } from "next/server";
import { untrusted } from "@/lib/guardrails";
import { customRequestStore, customTossProvider } from "@/lib/customRequest";
import { orderRepo } from "../../../payments/_lib/orders";
import { settleWrittenPayment } from "../../_lib/settle";

/**
 * F021/F052 — WRITTEN path, step 2 (HTTP surface): settle the (test) payment — persist the
 * Order(kind=CUSTOM) payment record, link the request, mark it SUBMITTED. The browser flow
 * settles via the Toss success redirect (/custom/complete/[id] → settle.ts); this route keeps
 * the confirm step callable/retryable as an API (idempotent — settle short-circuits replays).
 * Outside production `customTossProvider()` uses a sandbox transport so this is hermetic
 * (ADR-0010); a non-PAID result never marks the request submitted (no phantom completion).
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errors: ["잘못된 요청입니다."] }, { status: 400 });
  }

  const data = untrusted(body).value as { id?: unknown; paymentKey?: unknown };
  const res = await settleWrittenPayment(customRequestStore, orderRepo(), customTossProvider(), {
    id: data.id,
    paymentKey: data.paymentKey,
  });
  return NextResponse.json(res.body, { status: res.status });
}
