import { describe, it, expect } from "vitest";
import { mockEmailAdapter, failClosedProdAdapter, emailAdapter } from "../../src/lib/email";
import { redact } from "../../src/lib/env";

describe("F046 email adapter", () => {
  it("mock records to its outbox; no external effect", async () => {
    const a = mockEmailAdapter();
    await a.send({ to: "parent@example.com", code: "424242" });
    expect(a.outbox).toEqual([{ to: "parent@example.com", code: "424242" }]);
  });
  it("fail-closed prod stub throws (a security email must never silently no-op)", async () => {
    await expect(failClosedProdAdapter().send({ to: "a@b.com", code: "111111" })).rejects.toThrow(/provider/i);
  });
  it("factory selects the mock in non-prod", () => {
    const a = emailAdapter({ APP_ENV: "development" }) as ReturnType<typeof mockEmailAdapter>;
    expect(Array.isArray(a.outbox)).toBe(true);
  });
  it("factory returns the fail-closed stub in prod (no provider wired yet)", async () => {
    const a = emailAdapter({ APP_ENV: "production" });
    await expect(a.send({ to: "a@b.com", code: "111111" })).rejects.toThrow(/provider/i);
  });
  it("PII: email is redact()-masked; a 6-digit code passes redact() UNCHANGED (so the code must never be traced)", () => {
    expect(redact("to parent@example.com")).toContain("***@***");
    expect(redact("code 424242")).toBe("code 424242"); // redact has no numeric rule — proves omission, not masking
  });
});
