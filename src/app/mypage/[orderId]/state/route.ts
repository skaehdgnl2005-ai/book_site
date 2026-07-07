import { NextResponse, type NextRequest } from "next/server";
import { orderRepo } from "@/app/api/payments/_lib/orders";
import { hasOrderAccess } from "../../_lib/orderAccess";
import { finishingStore } from "../../_lib/finishing";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * F017/F018 — the finishing snapshot the client (`FinishingClient`) fetches on mount and on a
 * bfcache restore. This is the ONLY place PII (the dedication) crosses the wire, so the response
 * is always `no-store` and cookie-gated. `params` is a Promise in Next 15 (await it).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<Response> {
  const { orderId } = await params;
  // Capability cookie OR session ownership (F057) — the shared mypage predicate.
  if (!(await hasOrderAccess(orderId))) {
    return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 401, headers: NO_STORE });
  }
  const order = await orderRepo().get(orderId);
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404, headers: NO_STORE });
  }
  const store = finishingStore();
  const items = await Promise.all(
    order.items.map(async (it, index) => {
      const fin = await store.getItem(orderId, index);
      return {
        index,
        dedication: fin.dedication ?? "",
        // "on file" = attached at checkout OR uploaded here in mypage.
        photoOnFile: it.photo != null || fin.photo != null,
      };
    }),
  );
  return NextResponse.json({ status: order.status, items }, { headers: NO_STORE });
}
