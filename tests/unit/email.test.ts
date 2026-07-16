import { describe, it, expect, vi } from "vitest";
import { mockEmailAdapter, failClosedProdAdapter, emailAdapter, resendEmailAdapter, type EmailTransport } from "../../src/lib/email";
import { redact } from "../../src/lib/env";

describe("F046 email adapter", () => {
  it("mock records to its outbox; no external effect", async () => {
    const a = mockEmailAdapter();
    await a.send({ kind: "mypage_otp", to: "parent@example.com", code: "424242" });
    expect(a.outbox).toEqual([{ kind: "mypage_otp", to: "parent@example.com", code: "424242" }]);
  });
  it("fail-closed prod stub throws (a security email must never silently no-op)", async () => {
    await expect(failClosedProdAdapter().send({ kind: "mypage_otp", to: "a@b.com", code: "111111" })).rejects.toThrow(/provider/i);
  });
  it("factory selects the mock in non-prod", () => {
    const a = emailAdapter({ APP_ENV: "development" }) as ReturnType<typeof mockEmailAdapter>;
    expect(Array.isArray(a.outbox)).toBe(true);
  });
  it("factory returns the fail-closed stub in prod (no provider wired yet)", async () => {
    const a = emailAdapter({ APP_ENV: "production" });
    await expect(a.send({ kind: "mypage_otp", to: "a@b.com", code: "111111" })).rejects.toThrow(/provider/i);
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
      await mockEmailAdapter().send({ kind: "mypage_otp", to: "parent@example.com", code: "424242" });
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
      kind: "mypage_otp",
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
      resendEmailAdapter({ apiKey: "re_x", from: "no-reply@gpcs.kr", transport }).send({ kind: "mypage_otp", to: "a@b.com", code: "111111" }),
    ).rejects.toThrow(/422|resend|email/i);
  });

  it("resend: the thrown error carries the HTTP status ONLY — never the code or recipient (PII omission)", async () => {
    const transport: EmailTransport = async () => ({ ok: false, status: 500 });
    const err = await resendEmailAdapter({ apiKey: "re_x", from: "no-reply@gpcs.kr", transport })
      .send({ kind: "mypage_otp", to: "parent@example.com", code: "424242" })
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
        .send({ kind: "mypage_otp", to: "parent@example.com", code: "424242" })
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
      }).send({ kind: "mypage_otp", to: "parent@example.com", code: "424242" });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith("https://api.resend.com/emails", expect.anything());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("factory: a half-configured provider does NOT half-send — only RESEND_API_KEY (no EMAIL_FROM) stays fail-closed in prod", async () => {
    const a = emailAdapter({ APP_ENV: "production", RESEND_API_KEY: "re_live_key" });
    await expect(a.send({ kind: "mypage_otp", to: "a@b.com", code: "111111" })).rejects.toThrow(/provider/i);
  });

  it("factory: only EMAIL_FROM (no RESEND_API_KEY) also stays fail-closed in prod", async () => {
    const a = emailAdapter({ APP_ENV: "production", EMAIL_FROM: "no-reply@gpcs.kr" });
    await expect(a.send({ kind: "mypage_otp", to: "a@b.com", code: "111111" })).rejects.toThrow(/provider/i);
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

describe("F055 order-confirmation email", () => {
  const CONF = {
    kind: "order_confirmation",
    to: "parent@example.com",
    orderId: "ord_0001",
    orderName: "탄생",
    amountWon: 43000,
  } as const;

  it("mock outbox records the confirmation message", async () => {
    const a = mockEmailAdapter();
    await a.send(CONF);
    expect(a.outbox).toEqual([CONF]);
  });

  it("resend composes an order-confirmation subject/body: 주문번호·상품·금액만 (PII-minimal by construction)", async () => {
    const calls: { init: { body: string } }[] = [];
    const transport: EmailTransport = async (_url, init) => {
      calls.push({ init });
      return { ok: true, status: 200 };
    };
    await resendEmailAdapter({ apiKey: "re_x", from: "no-reply@gpcs.kr", transport }).send(CONF);
    const body = JSON.parse(calls[0].init.body) as { to: string; subject: string; text: string };
    expect(body.to).toBe("parent@example.com");
    expect(body.subject).toContain("주문");
    expect(body.text).toContain("ord_0001");
    expect(body.text).toContain("탄생");
    expect(body.text).toContain("43,000원");
    expect(body.text).toContain("마이페이지"); // finishing guidance
  });

  it("resend still throws on non-2xx for a confirmation (no silent drop; caller catch keeps payment green)", async () => {
    const transport: EmailTransport = async () => ({ ok: false, status: 500 });
    await expect(resendEmailAdapter({ apiKey: "re_x", from: "f@x.com", transport }).send(CONF)).rejects.toThrow(/500/);
  });

  it("F063: composes the refund confirmation (환불 금액 + 주문번호; same PII-minimal payload shape)", async () => {
    const calls: { init: { body: string } }[] = [];
    const transport: EmailTransport = async (_url, init) => {
      calls.push({ init });
      return { ok: true, status: 200 };
    };
    await resendEmailAdapter({ apiKey: "re_x", from: "no-reply@gpcs.kr", transport }).send({
      ...CONF,
      kind: "refund_confirmation",
    });
    const body = JSON.parse(calls[0].init.body) as { subject: string; text: string };
    expect(body.subject).toContain("환불");
    expect(body.text).toContain("ord_0001");
    expect(body.text).toContain("43,000원");
  });
});

describe("F068 shipping notification email", () => {
  const SHIPPED = {
    kind: "order_shipped",
    to: "parent@example.com",
    orderId: "ord_0001",
    orderName: "탄생",
    carrier: "CJ대한통운",
    trackingNumber: "6012345678901",
    trackingUrl: "https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbInvcNo=6012345678901",
  } as const;

  it("mock outbox records the shipped message", async () => {
    const a = mockEmailAdapter();
    await a.send(SHIPPED);
    expect(a.outbox).toEqual([SHIPPED]);
  });

  it("composes a 발송 subject/body: 주문번호·상품·택배사·운송장·조회 링크만 (아동 이름/주소 없음)", async () => {
    const calls: { init: { body: string } }[] = [];
    const transport: EmailTransport = async (_url, init) => {
      calls.push({ init });
      return { ok: true, status: 200 };
    };
    await resendEmailAdapter({ apiKey: "re_x", from: "no-reply@gpcs.kr", transport }).send(SHIPPED);
    const body = JSON.parse(calls[0].init.body) as { to: string; subject: string; text: string };
    expect(body.to).toBe("parent@example.com");
    expect(body.subject).toContain("발송");
    expect(body.text).toContain("ord_0001");
    expect(body.text).toContain("탄생");
    expect(body.text).toContain("CJ대한통운");
    expect(body.text).toContain("6012345678901");
    expect(body.text).toContain("cjlogistics.com"); // 조회 딥링크
  });

  it("trackingUrl이 null이면 조회 링크 줄은 생략(운송장 정보는 유지)", async () => {
    const calls: { init: { body: string } }[] = [];
    const transport: EmailTransport = async (_url, init) => {
      calls.push({ init });
      return { ok: true, status: 200 };
    };
    await resendEmailAdapter({ apiKey: "re_x", from: "no-reply@gpcs.kr", transport }).send({
      ...SHIPPED,
      carrier: "동네퀵",
      trackingUrl: null,
    });
    const body = JSON.parse(calls[0].init.body) as { text: string };
    expect(body.text).toContain("동네퀵");
    expect(body.text).toContain("6012345678901"); // 운송장 정보는 유지
    expect(body.text).not.toContain("http"); // 링크 없음
  });
});
