import { NextResponse } from "next/server";
import { untrusted } from "@/lib/guardrails";
import { clientIp, enforceRateLimit, RL_EVENTS } from "@/lib/rateLimit";
import { recordEventSafe, validateEvent } from "./_lib/analytics";

export const dynamic = "force-dynamic";

// sendBeacon 페이로드는 단건·소형 — 초과분은 파싱 전에 드롭한다(바이트 기준).
const MAX_BODY_BYTES = 2048;

/**
 * F092 — 전환 지표 비컨 싱크. csp-report(F087) 선례: 어떤 입력에도 204만 돌려준다 —
 * 비컨은 응답을 읽지 않고, 검증 실패에 오류를 주면 어휘를 외부에 오라클로 노출한다.
 * 레이트리밋은 RL_EVENTS(120/분/IP) — RL_INTAKE(20/분)는 정상 퍼널 완주(~30이벤트/분)의
 * 하단 이벤트를 유실시켜 지표를 계통 왜곡한다(적대적 검수 확정 #2).
 * 닫힌 어휘 검증(validateEvent)을 통과한 이벤트만 best-effort 적재(recordEventSafe).
 */
export async function POST(req: Request): Promise<Response> {
  if (!enforceRateLimit(`events:${clientIp(req.headers)}`, RL_EVENTS).ok) {
    return new NextResponse(null, { status: 204 }); // 초과분은 조용히 드롭
  }
  // 정직한 클라이언트는 Content-Length를 싣는다 — 과대 바디는 버퍼링 전에 거른다(검수 확정 #5).
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 204 });
  }
  try {
    // sendBeacon의 Content-Type은 유동적(text/plain 가능) — json() 대신 text() 후 파싱.
    const raw = await req.text();
    if (raw && Buffer.byteLength(raw, "utf8") <= MAX_BODY_BYTES) {
      const result = validateEvent(untrusted(JSON.parse(raw) as unknown).value);
      if (result.ok) await recordEventSafe(result.value);
    }
  } catch {
    // 비JSON·파손 페이로드 — 조용히 드롭(비컨 싱크에 오류 UX는 없다)
  }
  return new NextResponse(null, { status: 204 });
}
