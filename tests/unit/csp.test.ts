import { describe, it, expect } from "vitest";
import { buildCsp, CSP_REPORT_PATH } from "../../src/lib/csp";

/** Pull one directive (e.g. "script-src ...") out of a CSP header value. */
function directive(csp: string, name: string): string {
  return csp.split("; ").find((d) => d.startsWith(name + " ")) ?? "";
}

const NONCE = "TESTnonce1234567==";

describe("F087 buildCsp — production (nonce + strict-dynamic, no unsafe-inline for scripts)", () => {
  const csp = buildCsp(NONCE, false);
  const scriptSrc = directive(csp, "script-src");

  it("script-src provides real protection: nonce + strict-dynamic, NO unsafe-inline / unsafe-eval", () => {
    expect(scriptSrc).toContain(`'nonce-${NONCE}'`);
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'"); // the whole point — injected inline scripts blocked
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).toContain("https://js.tosspayments.com"); // CSP2 fallback for the Toss SDK
  });

  it("keeps frame-ancestors none + hardening directives", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("allows the real font + Toss channels, worker self+blob, and a report sink", () => {
    expect(directive(csp, "style-src")).toContain("https://fonts.googleapis.com");
    expect(directive(csp, "style-src")).toContain("https://cdn.jsdelivr.net");
    expect(directive(csp, "font-src")).toContain("https://fonts.gstatic.com");
    expect(directive(csp, "img-src")).toContain("blob:");
    expect(directive(csp, "connect-src")).toContain("https://*.tosspayments.com");
    expect(directive(csp, "frame-src")).toContain("https://*.tosspayments.com");
    expect(directive(csp, "worker-src")).toBe("worker-src 'self' blob:");
    expect(csp).toContain(`report-uri ${CSP_REPORT_PATH}`);
    expect(csp).toContain("report-to csp");
  });

  it("OMITS form-action so the Toss→card-issuer/bank/PG top-level redirect is never blocked", () => {
    expect(csp).not.toContain("form-action");
  });
});

describe("F087 buildCsp — dev (HMR/React Refresh permissive; never shipped to prod)", () => {
  const csp = buildCsp(NONCE, true);
  const scriptSrc = directive(csp, "script-src");

  it("dev script-src allows unsafe-inline + unsafe-eval (React Refresh) and carries NO nonce", () => {
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain("nonce-");
  });

  it("dev allows the ws HMR socket and does NOT upgrade-insecure-requests", () => {
    expect(directive(csp, "connect-src")).toContain("ws://localhost:*");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
