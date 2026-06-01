import { describe, it, expect } from "vitest";
import { parseEnv, redact } from "../../src/lib/env";
import { requireApproval, isIrreversible, untrusted } from "../../src/lib/guardrails";
import { emit } from "../../src/lib/observability";

describe("env contract (G-ERR / E3)", () => {
  it("defaults APP_ENV and BASE_URL", () => {
    const env = parseEnv({});
    expect(env.APP_ENV).toBe("development");
    expect(env.BASE_URL).toBe("http://localhost:3000");
  });

  it("refuses a Stripe LIVE key outside production", () => {
    expect(() => parseEnv({ STRIPE_SECRET_KEY: "sk_live_abc123" })).toThrow(/LIVE key/);
  });

  it("allows a Stripe TEST key in development", () => {
    expect(() => parseEnv({ STRIPE_SECRET_KEY: "sk_test_abc123" })).not.toThrow();
  });

  it("redacts secrets and emails", () => {
    expect(redact("token sk_test_abc123 end")).toContain("sk_test_***");
    expect(redact("mail a@b.com")).toContain("***@***");
  });
});

describe("HITL guardrails (G-HITL / E1 / E4)", () => {
  it("recognises irreversible actions", () => {
    expect(isIrreversible("stripe.charge.live")).toBe(true);
    expect(isIrreversible("read.catalog")).toBe(false);
  });

  it("blocks irreversible actions without an approval token (default-deny)", () => {
    expect(() => requireApproval("order.confirm", undefined)).toThrow(/Blocked irreversible/);
    expect(() => requireApproval("order.confirm", "APPROVED:order.confirm")).not.toThrow();
  });

  it("rejects a mismatched approval token", () => {
    expect(() => requireApproval("order.confirm", "APPROVED:deploy.production")).toThrow();
  });

  it("tags untrusted content at the trust boundary", () => {
    expect(untrusted("'; DROP TABLE books;").trust).toBe("untrusted");
  });
});

describe("observability (G-TRACE / H1)", () => {
  it("emits a redacted JSON trace line", () => {
    const lines: string[] = [];
    emit(
      { ts: "t", sessionId: "s", kind: "tool", name: "checkout", attrs: { email: "a@b.com" } },
      (l) => lines.push(l),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("***@***");
    expect(lines[0]).not.toContain("a@b.com");
  });
});
