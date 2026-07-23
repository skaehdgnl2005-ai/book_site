import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import {
  requireApproval,
  mintApprovalToken,
  devApprovalToken,
  APPROVAL_TTL_MS,
} from "../../src/lib/approval";
import { IRREVERSIBLE_ACTIONS } from "../../src/lib/guardrails";

// F076 — 승인 토큰은 정적 소스 리터럴('APPROVED:<action>')이 아니라 대상(주문/의뢰 id)+시간(TTL) 바인딩
// HMAC(MYPAGE_ACCESS_SECRET, action.targetId.exp)이다. 프로덕션 경로는 시크릿으로만 위조 불가하게 검증하고,
// 결정론적 dev 토큰은 F074 dev-auth 옵트인 하에서만 수용(프로덕션·플래그 없는 비프로덕션은 fail-closed).

const PROD = { MYPAGE_ACCESS_SECRET: "s3cr3t-abc", APP_ENV: "production" } as Record<string, string | undefined>;
const NOW = 1_800_000_000_000;

describe("F076 HMAC approval token — target + TTL bound", () => {
  it("mint → verify roundtrip succeeds for the same action+target within TTL", () => {
    const t = mintApprovalToken("toss.refund.live", "ord_1", NOW, PROD)!;
    expect(t).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(() => requireApproval("toss.refund.live", "ord_1", t, PROD, NOW + 1000)).not.toThrow();
  });

  it("rejects a token bound to a DIFFERENT target (no cross-order reuse)", () => {
    const t = mintApprovalToken("toss.refund.live", "ord_1", NOW, PROD)!;
    expect(() => requireApproval("toss.refund.live", "ord_2", t, PROD, NOW + 1000)).toThrow(/Blocked/);
  });

  it("rejects a token minted for a DIFFERENT action", () => {
    const t = mintApprovalToken("toss.refund.live", "ord_1", NOW, PROD)!;
    expect(() => requireApproval("consultation.book", "ord_1", t, PROD, NOW + 1000)).toThrow();
  });

  it("rejects an EXPIRED token (past its exp)", () => {
    const t = mintApprovalToken("toss.refund.live", "ord_1", NOW, PROD)!;
    expect(() => requireApproval("toss.refund.live", "ord_1", t, PROD, NOW + APPROVAL_TTL_MS + 1)).toThrow();
  });

  it("rejects a tampered HMAC", () => {
    const t = mintApprovalToken("toss.refund.live", "ord_1", NOW, PROD)!;
    const [exp, hmac] = t.split(".");
    const bad = `${exp}.${hmac.slice(0, -1)}${hmac.endsWith("a") ? "b" : "a"}`;
    expect(() => requireApproval("toss.refund.live", "ord_1", bad, PROD, NOW + 1000)).toThrow();
  });

  it("rejects the OLD static literal (the forgeable-from-source token no longer works)", () => {
    expect(() => requireApproval("toss.refund.live", "ord_1", "APPROVED:toss.refund.live", PROD, NOW)).toThrow();
  });

  it("mint returns null without a secret (fail-closed)", () => {
    expect(mintApprovalToken("toss.refund.live", "ord_1", NOW, { APP_ENV: "production" })).toBeNull();
    // and a would-be prod caller with no secret can never satisfy the gate
    expect(() => requireApproval("toss.refund.live", "ord_1", "anything", { APP_ENV: "production" }, NOW)).toThrow();
  });
});

describe("F076 deterministic dev token — gated by the F074 dev-auth opt-in", () => {
  const DEV_ON = { APP_ENV: "development", ALLOW_DEV_AUTH: "true" } as Record<string, string | undefined>;
  const DEV_OFF = { APP_ENV: "development" } as Record<string, string | undefined>;

  it("accepted ONLY under the opt-in, for the exact action+target", () => {
    const tok = devApprovalToken("consultation.book", "cr_1");
    expect(tok).toBe("DEV:consultation.book:cr_1");
    expect(() => requireApproval("consultation.book", "cr_1", tok, DEV_ON, NOW)).not.toThrow();
    expect(() => requireApproval("consultation.book", "cr_2", tok, DEV_ON, NOW)).toThrow(); // wrong target
  });

  it("fail-closed without the opt-in, and never in production", () => {
    const tok = devApprovalToken("consultation.book", "cr_1");
    expect(() => requireApproval("consultation.book", "cr_1", tok, DEV_OFF, NOW)).toThrow(); // no ALLOW_DEV_AUTH
    expect(() => requireApproval("consultation.book", "cr_1", tok, PROD, NOW)).toThrow(); // prod ignores dev token
  });
});

describe("F076 domain separation — approval message can't collide with mypage/session/OTP", () => {
  it("is domain-tagged + pipe-separated (never a bare `${id}.${exp}` cap/session shape)", () => {
    // The signed message must carry the "approval.v1|" tag; a mypage capability HMAC signs `${orderId}.${exp}`
    // with the SAME secret, so without the tag a self-minted cap could verify as a live refund approval.
    const secret = "shared-secret";
    const env = { MYPAGE_ACCESS_SECRET: secret } as Record<string, string | undefined>;
    const token = mintApprovalToken("toss.refund.live", "ord_1", NOW, env)!;
    const exp = Number(token.split(".")[0]);
    // A mypage-cap-style HMAC (orderId.exp) with the same secret must NOT verify as this approval token.
    const capStyle = createHmac("sha256", secret).update(`ord_1.${exp}`).digest("hex");
    expect(() => requireApproval("toss.refund.live", "ord_1", `${exp}.${capStyle}`, env, NOW + 1)).toThrow();
    // The real token binds the domain-tagged message.
    const tagged = createHmac("sha256", secret).update(`approval.v1|toss.refund.live|ord_1|${exp}`).digest("hex");
    expect(token).toBe(`${exp}.${tagged}`);
  });
});

describe("F076 approve.mjs ↔ approval.ts parity (drift guard)", () => {
  const approveSrc = readFileSync("scripts/approve.mjs", "utf8");

  it("a token minted with approve.mjs's exact algorithm is accepted, and equals mintApprovalToken", () => {
    const secret = "s3cr3t-abc";
    const env = { MYPAGE_ACCESS_SECRET: secret } as Record<string, string | undefined>;
    const exp = NOW + APPROVAL_TTL_MS;
    // reproduce approve.mjs's mint (domain-tagged message + `${exp}.${hmac}` wire):
    const hmac = createHmac("sha256", secret).update(`approval.v1|toss.refund.live|ord_9|${exp}`).digest("hex");
    const token = `${exp}.${hmac}`;
    expect(() => requireApproval("toss.refund.live", "ord_9", token, env, NOW + 1000)).not.toThrow();
    expect(token).toBe(mintApprovalToken("toss.refund.live", "ord_9", NOW, env)); // byte-identical
  });

  it("approve.mjs mirrors the signed-message format + TTL constant (no silent drift)", () => {
    expect(approveSrc).toContain("approval.v1|${arg}|${targetId}|${exp}");
    expect(approveSrc).toContain("10 * 60 * 1000");
    expect(APPROVAL_TTL_MS).toBe(10 * 60 * 1000);
  });

  it("approve.mjs lists every IRREVERSIBLE_ACTION (no CLI list drift)", () => {
    for (const a of IRREVERSIBLE_ACTIONS) expect(approveSrc).toContain(`"${a}"`);
  });
});
