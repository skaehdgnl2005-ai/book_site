import { describe, it, expect } from "vitest";
import { devAuthEnabled } from "../../src/lib/env";
import { generateCode, OTP_TEST_CODE } from "../../src/app/mypage/_lib/otp";
import { isAdminEmail, DEV_ADMIN_EMAIL } from "../../src/app/admin/_lib/adminAuth";
import { kakaoProviderFromEnv } from "../../src/app/account/_lib/kakao";
import { accessSecret, mintAccess } from "../../src/app/mypage/_lib/access";

// F074 — 비프로덕션 인증 우회 fail-closed 옵트인. 세 지름길(결정론적 OTP 424242 · 관리자 DEV_ADMIN_RE
// 폴백 · 카카오 샌드박스 신원 발급)이 모두 devAuthEnabled(비프로덕션 + ALLOW_DEV_AUTH) 단일 게이트 뒤에
// 있어야 하고, 프로덕션에서는 플래그가 있어도 언제나 닫힘. (레드팀: 세 경로 공통 옵트인 필수.)

const DEV_ON = { APP_ENV: "development", ALLOW_DEV_AUTH: "true" } as Record<string, string | undefined>;
const DEV_OFF = { APP_ENV: "development" } as Record<string, string | undefined>;
const PROD_ON = { APP_ENV: "production", ALLOW_DEV_AUTH: "true" } as Record<string, string | undefined>;

describe("devAuthEnabled (F074)", () => {
  it("true ONLY in non-prod with the opt-in ('true' or '1')", () => {
    expect(devAuthEnabled(DEV_ON)).toBe(true);
    expect(devAuthEnabled({ APP_ENV: "development", ALLOW_DEV_AUTH: "1" })).toBe(true);
    expect(devAuthEnabled(DEV_OFF)).toBe(false);
    expect(devAuthEnabled({ APP_ENV: "development", ALLOW_DEV_AUTH: "false" })).toBe(false);
    expect(devAuthEnabled({ APP_ENV: "development", ALLOW_DEV_AUTH: "" })).toBe(false);
  });

  it("ALWAYS false in production — even with the flag, and via VERCEL_ENV", () => {
    expect(devAuthEnabled(PROD_ON)).toBe(false);
    expect(devAuthEnabled({ VERCEL_ENV: "production", ALLOW_DEV_AUTH: "true" })).toBe(false);
  });
});

describe("all three dev-auth shortcuts are gated (F074)", () => {
  it("deterministic OTP 424242 only under the opt-in", () => {
    expect(generateCode(DEV_ON)).toBe(OTP_TEST_CODE);
    // fail-closed: without the opt-in the code is CSPRNG (format only — not the fixed test code path)
    expect(generateCode(DEV_OFF)).toMatch(/^\d{6}$/);
    expect(generateCode(PROD_ON)).toMatch(/^\d{6}$/);
  });

  it("DEV_ADMIN_RE admin fallback only under the opt-in", () => {
    expect(isAdminEmail(DEV_ADMIN_EMAIL, DEV_ON)).toBe(true);
    expect(isAdminEmail("admin+f074@example.com", DEV_ON)).toBe(true);
    expect(isAdminEmail(DEV_ADMIN_EMAIL, DEV_OFF)).toBe(false); // fail-closed
    expect(isAdminEmail(DEV_ADMIN_EMAIL, PROD_ON)).toBe(false); // never in prod
  });

  it("kakao sandbox provider (arbitrary sbx_email identity) only under the opt-in", () => {
    expect(kakaoProviderFromEnv(DEV_ON).name).toBe("kakao-sandbox");
    expect(kakaoProviderFromEnv(DEV_OFF).name).toBe("kakao"); // real provider → fail-closed w/o key
    expect(kakaoProviderFromEnv(PROD_ON).name).toBe("kakao");
  });

  it("mypage/session dev signing key (4th shortcut) only under the opt-in — else no cookie can be minted", () => {
    // This secret signs the account session + mypage capability cookie + OTP hashes. Without the
    // opt-in it must be absent so a flagless staging box cannot forge those from a source constant.
    expect(accessSecret(DEV_ON)).toBe("test_mypage_access_dev");
    expect(mintAccess("ord_1", 0, DEV_ON)).not.toBeNull();
    expect(accessSecret(DEV_OFF)).toBeUndefined(); // fail-closed
    expect(mintAccess("ord_1", 0, DEV_OFF)).toBeNull(); // no secret → no capability cookie
    expect(accessSecret(PROD_ON)).toBeUndefined(); // prod never uses the dev fallback (needs real secret)
    // an explicit MYPAGE_ACCESS_SECRET is honored regardless of the flag
    expect(accessSecret({ MYPAGE_ACCESS_SECRET: "real" })).toBe("real");
  });
});
