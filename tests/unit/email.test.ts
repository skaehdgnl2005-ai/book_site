import { describe, it, expect, vi } from "vitest";
import { mockEmailAdapter, failClosedProdAdapter, emailAdapter, resendEmailAdapter, type EmailTransport } from "../../src/lib/email";
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

  it("PII: no console/log sink ever receives the raw code (by-construction omission, not masking)", async () => {
    const seen: string[] = [];
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        seen.push(args.map(String).join(" "));
      }),
    );
    try {
      await mockEmailAdapter().send({ to: "parent@example.com", code: "424242" });
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    expect(seen.join("\n")).not.toContain("424242"); // the code reaches the outbox, never a log sink
  });
});

describe("F047 Resend email adapter", () => {
  it("resend: POSTs to the Resend API (Bearer auth, from, to, code in the body) and resolves on 2xx", async () => {
    const calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
    const transport: EmailTransport = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200 };
    };
    await resendEmailAdapter({ apiKey: "re_secret_123", from: "no-reply@gpcs.kr", transport }).send({
      to: "parent@example.com",
      code: "424242",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers.Authorization).toBe("Bearer re_secret_123");
    const body = JSON.parse(calls[0].init.body) as { from: string; to: string; subject: string; text?: string; html?: string };
    expect(body.from).toBe("no-reply@gpcs.kr");
    expect(body.to).toBe("parent@example.com");
    expect(String(body.text ?? body.html ?? "")).toContain("424242"); // the code IS the email content (over HTTPS)
  });

  it("resend: a non-2xx response THROWS (a security email must never silently no-op)", async () => {
    const transport: EmailTransport = async () => ({ ok: false, status: 422 });
    await expect(
      resendEmailAdapter({ apiKey: "re_x", from: "no-reply@gpcs.kr", transport }).send({ to: "a@b.com", code: "111111" }),
    ).rejects.toThrow(/422|resend|email/i);
  });

  it("resend: the thrown error carries the HTTP status ONLY — never the code or recipient (PII omission)", async () => {
    const transport: EmailTransport = async () => ({ ok: false, status: 500 });
    const err = await resendEmailAdapter({ apiKey: "re_x", from: "no-reply@gpcs.kr", transport })
      .send({ to: "parent@example.com", code: "424242" })
      .catch((e: unknown) => e);
    expect(String(err)).not.toContain("424242");
    expect(String(err)).not.toContain("parent@example.com");
    expect(String(err)).toContain("500");
  });

  it("resend: never writes the code to a console/log sink (by-construction omission), even on a failed send", async () => {
    const seen: string[] = [];
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        seen.push(args.map(String).join(" "));
      }),
    );
    const transport: EmailTransport = async () => ({ ok: false, status: 502 });
    try {
      await resendEmailAdapter({ apiKey: "re_x", from: "f@x.com", transport })
        .send({ to: "parent@example.com", code: "424242" })
        .catch(() => undefined);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    expect(seen.join("\n")).not.toContain("424242");
  });

  it("factory: selects the Resend adapter in prod when RESEND_API_KEY + EMAIL_FROM are both set", async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: unknown) => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await emailAdapter({
        APP_ENV: "production",
        RESEND_API_KEY: "re_live_key",
        EMAIL_FROM: "no-reply@gpcs.kr",
      }).send({ to: "parent@example.com", code: "424242" });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith("https://api.resend.com/emails", expect.anything());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("factory: a half-configured provider does NOT half-send — only RESEND_API_KEY (no EMAIL_FROM) stays fail-closed in prod", async () => {
    const a = emailAdapter({ APP_ENV: "production", RESEND_API_KEY: "re_live_key" });
    await expect(a.send({ to: "a@b.com", code: "111111" })).rejects.toThrow(/provider/i);
  });

  it("factory: only EMAIL_FROM (no RESEND_API_KEY) also stays fail-closed in prod", async () => {
    const a = emailAdapter({ APP_ENV: "production", EMAIL_FROM: "no-reply@gpcs.kr" });
    await expect(a.send({ to: "a@b.com", code: "111111" })).rejects.toThrow(/provider/i);
  });

  it("redact(): masks a Resend API key (re_… prefix), leaving no secret tail", () => {
    expect(redact("key re_abc123DEF456 end")).toContain("re_***");
    expect(redact("key re_abc123DEF456 end")).not.toContain("abc123DEF456");
  });

  it("redact(): a Resend-key-prefixed email is still FULLY masked — the re_ rule must not strand the domain (PII regression guard)", () => {
    expect(redact("re_user@example.com")).toBe("***@***");
    expect(redact("buyer re_orders@parent.co.kr now")).not.toContain("parent.co.kr");
  });

  it("redact(): masks a Resend key even when it directly follows an underscore (left-anchored, not \\b)", () => {
    expect(redact("token=_re_abcDEF123456")).toContain("re_***");
    expect(redact("token=_re_abcDEF123456")).not.toContain("abcDEF123456");
  });

  it("redact(): the re_ rule does NOT mask intra-word matches (more_/secret_/pre_ stay intact)", () => {
    expect(redact("more_data secret_value pre_render")).toBe("more_data secret_value pre_render");
  });
});
