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

  it("refuses a TossPayments LIVE secret key outside production", () => {
    expect(() => parseEnv({ TOSS_SECRET_KEY: "live_sk_abc123" })).toThrow(/LIVE key/);
  });

  it("refuses a TossPayments LIVE client key outside production", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_TOSS_CLIENT_KEY: "live_ck_abc123" })).toThrow(/LIVE key/);
  });

  it("allows a TossPayments TEST key in development", () => {
    expect(() => parseEnv({ TOSS_SECRET_KEY: "test_sk_abc123" })).not.toThrow();
  });

  it("redacts payment secrets and emails", () => {
    expect(redact("key test_sk_abc123 end")).toContain("test_sk_***");
    expect(redact("key test_ck_abc123 end")).toContain("test_ck_***");
    // Legacy Stripe key shapes stay redacted too (defence-in-depth branch in env.ts).
    expect(redact("key sk_live_DEADBEEF end")).toContain("sk_live_***");
    // Supabase service_role secrets (new sb_secret_ + legacy JWT) — added with the storage feature.
    expect(redact("key sb_secret_ABC123xyz end")).toContain("sb_secret_***");
    expect(redact("key sb_secret_ABC123xyz end")).not.toContain("ABC123xyz");
    expect(redact("tok eyJhbGci.eyJzdWIi.SflKxsignature end")).toContain("eyJ***.***.***");
    expect(redact("mail a@b.com")).toContain("***@***");
  });
});

describe("HITL guardrails (G-HITL / E1 / E4)", () => {
  it("recognises irreversible actions", () => {
    expect(isIrreversible("toss.charge.live")).toBe(true);
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
