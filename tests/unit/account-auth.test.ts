import { describe, it, expect } from "vitest";
import { mintSession, verifySessionToken, SESSION_TTL_MS } from "../../src/app/account/_lib/session";
import { createInMemoryUserRepo, normalizeEmail } from "../../src/app/account/_lib/users";
import { loginSubject } from "../../src/app/account/_lib/loginOtp";
import {
  createInMemoryOtpStore,
  generateCode,
  hashCode,
  verifyAndConsume,
  OTP_TEST_CODE,
} from "../../src/app/mypage/_lib/otp";
import { accessSecret } from "../../src/app/mypage/_lib/access";

// F056 (ADR-0023) — the account session token + user repo + login-OTP glue. The OTP core
// (atomic debit / constant-time compare / mint-before-consume) is already exhaustively tested
// in otp.test.ts; here we cover the NEW surfaces: session token lifecycle, epoch semantics,
// login==signup upsert, and the end-to-end login verification path over a user-scoped subject.

const NOW = 1_750_000_000_000;

describe("account session token (stateless HMAC — access.ts generalized)", () => {
  it("mints `${userId}.${epoch}.${exp}.${hmac}` and verifies it back", () => {
    const token = mintSession("usr_0001", 0, NOW);
    expect(token).toBeTruthy();
    expect(verifySessionToken(token, NOW + 1000)).toEqual({ userId: "usr_0001", epoch: 0 });
  });

  it("expires: a token past its exp verifies to null", () => {
    const token = mintSession("usr_0001", 0, NOW);
    expect(verifySessionToken(token, NOW + SESSION_TTL_MS + 1)).toBeNull();
  });

  it("rejects tampering: flipped hmac, foreign userId, altered epoch", () => {
    const token = mintSession("usr_0001", 0, NOW)!;
    const [uid, epoch, exp, hmac] = token.split(".");
    const flipped = `${uid}.${epoch}.${exp}.${hmac.slice(0, -1)}${hmac.endsWith("a") ? "b" : "a"}`;
    expect(verifySessionToken(flipped, NOW)).toBeNull();
    expect(verifySessionToken(`usr_evil.${epoch}.${exp}.${hmac}`, NOW)).toBeNull();
    expect(verifySessionToken(`${uid}.7.${exp}.${hmac}`, NOW)).toBeNull(); // epoch is HMAC-bound
    expect(verifySessionToken("garbage", NOW)).toBeNull();
    expect(verifySessionToken(null, NOW)).toBeNull();
  });

  it("fail-closed: production without MYPAGE_ACCESS_SECRET can neither mint nor verify", () => {
    const prod = { APP_ENV: "production" } as Record<string, string | undefined>;
    expect(mintSession("usr_0001", 0, NOW, prod)).toBeNull();
    const token = mintSession("usr_0001", 0, NOW); // minted with the dev fallback secret
    expect(verifySessionToken(token, NOW, prod)).toBeNull();
  });

  it("refuses to mint for a dotted userId (would corrupt the token frame)", () => {
    expect(mintSession("usr.evil", 0, NOW)).toBeNull();
  });
});

describe("user repo (login == signup)", () => {
  it("upsertByEmail creates once (case-insensitive) and returns the same user thereafter", async () => {
    const repo = createInMemoryUserRepo();
    const a = await repo.upsertByEmail("Parent@Example.com", NOW);
    const b = await repo.upsertByEmail("parent@example.com", NOW + 5000);
    expect(a.id).toBe(b.id);
    expect(a.email).toBe("parent@example.com"); // normalized at the boundary
    expect(a.emailVerifiedAt).toBeTruthy(); // OTP-proven ownership
    expect(await repo.findByEmail("PARENT@example.com")).toMatchObject({ id: a.id });
  });

  it("bumpSessionEpoch invalidates outstanding tokens (epoch mismatch at the gate)", async () => {
    const repo = createInMemoryUserRepo();
    const user = await repo.upsertByEmail("parent@example.com", NOW);
    const token = mintSession(user.id, user.sessionEpoch, NOW)!;
    const bumped = await repo.bumpSessionEpoch(user.id);
    expect(bumped?.sessionEpoch).toBe(1);
    // the gate (getSessionUser) compares the LIVE epoch against the token's — mismatched now:
    expect(verifySessionToken(token, NOW + 1)!.epoch).not.toBe(bumped?.sessionEpoch);
    expect(await repo.bumpSessionEpoch("usr_nope")).toBeUndefined();
  });

  it("normalizeEmail trims + lowercases; junk becomes ''", () => {
    expect(normalizeEmail("  A@B.Com ")).toBe("a@b.com");
    expect(normalizeEmail(42)).toBe("");
  });
});

describe("login OTP glue (user-scoped subject over the audited otp.ts core)", () => {
  it("issue → verifyAndConsume succeeds once for the right code, then the code is consumed", async () => {
    const store = createInMemoryOtpStore();
    const subject = loginSubject("parent@example.com");
    const code = generateCode(); // non-prod deterministic 424242
    expect(code).toBe(OTP_TEST_CODE);
    await store.issue(subject, hashCode(subject, code));

    const mint = () => (accessSecret() ? "session" : null);
    const ok = await verifyAndConsume(store, subject, code, mint);
    expect(ok).toEqual({ token: "session" });
    const replay = await verifyAndConsume(store, subject, code, mint);
    expect(replay).toEqual({ error: "bad" }); // consumed — single use
  });

  it("a wrong code fails without burning the real one; subjects are email-bound", async () => {
    const store = createInMemoryOtpStore();
    const subject = loginSubject("parent@example.com");
    const code = generateCode();
    await store.issue(subject, hashCode(subject, code));

    const mint = () => "session";
    expect(await verifyAndConsume(store, subject, "111111", mint)).toEqual({ error: "bad" });
    // the same code hashed under ANOTHER email's subject never verifies (subject-bound HMAC):
    expect(await verifyAndConsume(store, loginSubject("other@example.com"), code, mint)).toEqual({ error: "bad" });
    // the rightful owner still gets in:
    expect(await verifyAndConsume(store, subject, code, mint)).toEqual({ token: "session" });
  });
});
