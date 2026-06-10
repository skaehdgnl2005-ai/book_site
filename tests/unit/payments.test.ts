import { describe, it, expect } from "vitest";
import {
  TossPaymentProvider,
  tossFromEnv,
  type PaymentProvider,
  type CreatePaymentInput,
  type TossTransport,
} from "../../src/lib/payments";

// Fake TEST keys (never live — the adapter is test/sandbox only). TossPayments
// keys are `test_sk_…` / `test_ck_…` (secret / client); live keys are `live_sk_…` / `live_ck_…`.
const TEST_SECRET = "test_sk_unitfake000000000000000";
const TEST_CLIENT = "test_ck_unitfake000000000000000";

function newProvider(transport?: TossTransport): TossPaymentProvider {
  return new TossPaymentProvider({
    secretKey: TEST_SECRET,
    clientKey: TEST_CLIENT,
    transport,
    confirmUrl: "https://api.example.test/v1/payments/confirm",
  });
}

const baseInput: CreatePaymentInput = {
  orderId: "ord_001", // 7 chars — satisfies the TossPayments 6–64 [A-Za-z0-9-_] constraint
  amount: 49000,
  orderName: "탄생 그림책 (하드커버)",
  successUrl: "https://shop.test/checkout/success",
  failUrl: "https://shop.test/checkout/fail",
};

describe("PaymentProvider contract (F003)", () => {
  it("identifies itself as the toss provider", () => {
    expect(newProvider().name).toBe("toss");
  });

  it("a Toss adapter satisfies the provider-agnostic PaymentProvider interface", () => {
    const provider: PaymentProvider = newProvider();
    expect(typeof provider.createCheckout).toBe("function");
    expect(typeof provider.confirm).toBe("function");
  });
});

describe("TossPaymentProvider.createCheckout", () => {
  it("returns our orderId + amount + client key the buyer's browser needs", () => {
    const checkout = newProvider().createCheckout(baseInput);
    expect(checkout).toMatchObject({
      provider: "toss",
      orderId: "ord_001",
      amount: 49000,
      orderName: "탄생 그림책 (하드커버)",
      clientKey: TEST_CLIENT,
      successUrl: "https://shop.test/checkout/success",
      failUrl: "https://shop.test/checkout/fail",
    });
  });

  it("never leaks the secret key into the client-bound checkout payload", () => {
    const checkout = newProvider().createCheckout(baseInput);
    expect(JSON.stringify(checkout)).not.toContain(TEST_SECRET);
  });

  it("rejects a non-integer or non-positive KRW amount (won has no minor unit)", () => {
    const p = newProvider();
    expect(() => p.createCheckout({ ...baseInput, amount: 4300.5 })).toThrow(/integer/i);
    expect(() => p.createCheckout({ ...baseInput, amount: 0 })).toThrow(/positive|integer/i);
    expect(() => p.createCheckout({ ...baseInput, amount: -100 })).toThrow();
    expect(() => p.createCheckout({ ...baseInput, amount: 49000 })).not.toThrow();
  });

  it("createCheckout rejects an orderId that violates the Toss constraint (6–64 [A-Za-z0-9-_])", () => {
    const p = new TossPaymentProvider({ secretKey: "test_sk_x", clientKey: "test_ck_x" });
    const base = { amount: 43000, orderName: "탄생", successUrl: "https://e.com/s", failUrl: "https://e.com/f" };
    expect(() => p.createCheckout({ ...base, orderId: "ab" })).toThrow(/orderId/); // too short
    expect(() => p.createCheckout({ ...base, orderId: "bad id!" })).toThrow(/orderId/); // bad chars
    expect(() => p.createCheckout({ ...base, orderId: "ord_0001" })).not.toThrow(); // in-memory shape
    expect(() => p.createCheckout({ ...base, orderId: "550e8400-e29b-41d4-a716-446655440000" })).not.toThrow(); // UUID
  });
});

describe("TossPaymentProvider.confirm", () => {
  it("posts to the Toss confirm API with Basic-auth and maps DONE to PAID", async () => {
    const calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
    const transport: TossTransport = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "DONE", approvedAt: "2026-06-01T09:00:00+09:00" }),
      };
    };
    const result = await newProvider(transport).confirm({
      paymentKey: "pk_test_1",
      orderId: "ord_1",
      amount: 49000,
    });

    expect(result).toMatchObject({
      status: "PAID",
      provider: "toss",
      orderId: "ord_1",
      amount: 49000,
      approvedAt: "2026-06-01T09:00:00+09:00",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/payments/confirm");
    expect(calls[0].init.method).toBe("POST");
    const expectedAuth = "Basic " + Buffer.from(`${TEST_SECRET}:`).toString("base64");
    expect(calls[0].init.headers.Authorization).toBe(expectedAuth);
    expect(JSON.parse(calls[0].init.body)).toEqual({
      paymentKey: "pk_test_1",
      orderId: "ord_1",
      amount: 49000,
    });
  });

  it("maps a Toss error response to FAILED (never a phantom PAID)", async () => {
    const transport: TossTransport = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ code: "REJECT_CARD_COMPANY", message: "카드사 거절" }),
    });
    const result = await newProvider(transport).confirm({
      paymentKey: "pk",
      orderId: "ord_1",
      amount: 49000,
    });
    expect(result.status).toBe("FAILED");
  });

  it("maps a CANCELED Toss payment to CANCELED, not PAID", async () => {
    const transport: TossTransport = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "CANCELED" }),
    });
    const result = await newProvider(transport).confirm({
      paymentKey: "pk",
      orderId: "ord_1",
      amount: 49000,
    });
    expect(result.status).toBe("CANCELED");
  });

  it("rejects an invalid KRW amount before ever calling the gateway", async () => {
    let called = false;
    const failIfCalled: TossTransport = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({ status: "DONE" }) };
    };
    await expect(
      newProvider(failIfCalled).confirm({ paymentKey: "pk", orderId: "ord_1", amount: 4300.5 }),
    ).rejects.toThrow(/integer/i);
    expect(called).toBe(false);
  });
});

describe("test/sandbox-only enforcement (defence in depth beyond env)", () => {
  it("refuses to construct with a LIVE secret key", () => {
    expect(
      () => new TossPaymentProvider({ secretKey: "live_sk_abcdef0123456789", clientKey: TEST_CLIENT }),
    ).toThrow(/LIVE/);
  });

  it("refuses to construct with a LIVE client key", () => {
    expect(
      () => new TossPaymentProvider({ secretKey: TEST_SECRET, clientKey: "live_ck_abcdef0123456789" }),
    ).toThrow(/LIVE/);
  });
});

describe("tossFromEnv", () => {
  it("builds a Toss provider from a test-keyed env", () => {
    const provider = tossFromEnv({
      TOSS_SECRET_KEY: TEST_SECRET,
      NEXT_PUBLIC_TOSS_CLIENT_KEY: TEST_CLIENT,
    });
    expect(provider.name).toBe("toss");
  });

  it("throws a clear error when Toss keys are missing", () => {
    expect(() => tossFromEnv({})).toThrow(/TOSS_SECRET_KEY|TOSS_CLIENT_KEY|key/i);
  });
});
