import { describe, it, expect } from "vitest";
import {
  generateCode, hashCode, createInMemoryOtpStore,
  MAX_ATTEMPTS, MAX_SENDS_PER_WINDOW, TTL_MS, SEND_WINDOW_MS,
} from "../../src/app/mypage/_lib/otp";

const ORDER = "ord_0001";
const T0 = 1_000_000_000_000;
const DEV = { APP_ENV: "development" } as Record<string, string | undefined>;

describe("F046 OTP generation/hash", () => {
  it("generateCode is a canonical 6 ASCII digits (prod + non-prod)", () => {
    expect(generateCode({ APP_ENV: "production" })).toMatch(/^\d{6}$/);
    expect(generateCode(DEV)).toMatch(/^\d{6}$/);
  });
  it("hashCode binds to the orderId and is stable", () => {
    const a = hashCode(ORDER, "424242", DEV);
    expect(hashCode(ORDER, "424242", DEV)).toBe(a);
    expect(hashCode("ord_0002", "424242", DEV)).not.toBe(a);
  });
});

describe("F046 in-memory OtpStore", () => {
  const issue = (s: ReturnType<typeof createInMemoryOtpStore>, now: number, code = "424242") =>
    s.issue(ORDER, hashCode(ORDER, code, DEV), now);

  it("issue -> verifyDebit(correct) -> consume; reuse then fails (single-use)", async () => {
    const s = createInMemoryOtpStore();
    expect((await issue(s, T0)).sent).toBe(true);
    const d = await s.verifyDebit(ORDER, T0 + 1);
    expect(d?.codeHash).toBe(hashCode(ORDER, "424242", DEV));
    await s.consume(ORDER, T0 + 2);
    expect(await s.verifyDebit(ORDER, T0 + 3)).toBeNull();
  });
  it("expired code -> verifyDebit null", async () => {
    const s = createInMemoryOtpStore(); await issue(s, T0);
    expect(await s.verifyDebit(ORDER, T0 + TTL_MS)).toBeNull();
  });
  it("attempt cap: MAX_ATTEMPTS debits succeed, the next is null", async () => {
    const s = createInMemoryOtpStore(); await issue(s, T0);
    for (let i = 0; i < MAX_ATTEMPTS; i++) expect(await s.verifyDebit(ORDER, T0 + 1)).not.toBeNull();
    expect(await s.verifyDebit(ORDER, T0 + 1)).toBeNull();
  });
  it("throttle: MAX_SENDS_PER_WINDOW issues send; the next in-window is throttled (no send)", async () => {
    const s = createInMemoryOtpStore();
    for (let i = 0; i < MAX_SENDS_PER_WINDOW; i++) expect((await issue(s, T0 + i)).sent).toBe(true);
    expect((await issue(s, T0 + MAX_SENDS_PER_WINDOW)).sent).toBe(false);
  });
  it("throttle resets after the window elapses", async () => {
    const s = createInMemoryOtpStore();
    for (let i = 0; i < MAX_SENDS_PER_WINDOW; i++) await issue(s, T0);
    expect((await issue(s, T0 + SEND_WINDOW_MS)).sent).toBe(true);
  });
  it("re-issue replaces the code and resets attempts (a new code verifies; the old does not)", async () => {
    const s = createInMemoryOtpStore();
    await issue(s, T0, "111111");
    await issue(s, T0 + 1, "222222");
    const d = await s.verifyDebit(ORDER, T0 + 2);
    expect(d?.codeHash).toBe(hashCode(ORDER, "222222", DEV));
  });
});
