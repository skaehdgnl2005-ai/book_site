import { NextResponse } from "next/server";
import { redact } from "@/lib/env";
import { clientIp, enforceRateLimit, RL_INTAKE } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * F087 — CSP violation report sink (the report-uri / report-to target). During the Report-Only rollout
 * browsers POST violation reports here; we log a REDACTED summary (report bodies carry document/blocked
 * URLs that could embed PII in query strings) and 204. No storage — the operator reads logs to complete
 * the allowlist before flipping to enforce. Rate-limited (F085): one page load can emit many reports.
 */
export async function POST(req: Request): Promise<Response> {
  if (!enforceRateLimit(`csp-report:${clientIp(req.headers)}`, RL_INTAKE).ok) {
    return new NextResponse(null, { status: 204 }); // drop excess reports quietly
  }
  try {
    const body = await req.text();
    if (body) console.warn("csp-report:", redact(body).slice(0, 1000));
  } catch {
    // malformed / empty report — ignore
  }
  return new NextResponse(null, { status: 204 });
}
