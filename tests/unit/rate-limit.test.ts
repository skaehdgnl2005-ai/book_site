import { describe, it, expect } from "vitest";
import {
  rateLimit,
  enforceRateLimit,
  clientIp,
} from "../../src/lib/rateLimit";
import { storeAsset, receiveUpload, MAX_UPLOAD_BYTES } from "../../src/lib/assets";

/**
 * F085 (보안 감사 #2) — 공개 POST 라우트·인증 발송 남용 완화. 앱 계층 best-effort per-IP 고정창
 * 리미터 + 업로드 사이즈 상한. 집행은 프로덕션 한정(비프로덕션 dev-auth 옵트인에서 바이패스).
 */
describe("F085 rateLimit — 순수 고정창", () => {
  it("창 내 limit까지 허용하고 초과분을 차단한다", () => {
    const opts = { limit: 2, windowMs: 1000 };
    expect(rateLimit("a", opts, 0)).toMatchObject({ ok: true, remaining: 1 });
    expect(rateLimit("a", opts, 100)).toMatchObject({ ok: true, remaining: 0 });
    const blocked = rateLimit("a", opts, 200);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(800); // windowStart(0)+1000-200
  });

  it("창이 경과하면 리셋된다", () => {
    const opts = { limit: 1, windowMs: 1000 };
    expect(rateLimit("b", opts, 0).ok).toBe(true);
    expect(rateLimit("b", opts, 500).ok).toBe(false);
    expect(rateLimit("b", opts, 1000).ok).toBe(true); // now-windowStart >= windowMs → 리셋
  });

  it("키가 다르면 독립적으로 센다", () => {
    const opts = { limit: 1, windowMs: 1000 };
    expect(rateLimit("c1", opts, 0).ok).toBe(true);
    expect(rateLimit("c2", opts, 0).ok).toBe(true);
  });
});

describe("F085 enforceRateLimit — 프로덕션 한정 집행", () => {
  it("비프로덕션 dev-auth 옵트인에서는 바이패스(항상 ok, 카운트하지 않음)", () => {
    const opts = { limit: 1, windowMs: 1000 };
    const env = { APP_ENV: "development", ALLOW_DEV_AUTH: "true" };
    expect(enforceRateLimit("d", opts, env, 0).ok).toBe(true);
    expect(enforceRateLimit("d", opts, env, 1).ok).toBe(true); // 바이패스라 초과해도 ok
  });

  it("dev-auth 미설정(비프로덕션)에서는 집행한다", () => {
    const opts = { limit: 1, windowMs: 1000 };
    const env = {}; // ALLOW_DEV_AUTH 없음 → devAuthEnabled false → 집행
    expect(enforceRateLimit("e", opts, env, 0).ok).toBe(true);
    expect(enforceRateLimit("e", opts, env, 1).ok).toBe(false);
  });

  it("프로덕션에서는 ALLOW_DEV_AUTH가 있어도 집행한다(fail-closed)", () => {
    const opts = { limit: 1, windowMs: 1000 };
    const env = { VERCEL_ENV: "production", ALLOW_DEV_AUTH: "true" }; // isProductionRuntime→devAuth false
    expect(enforceRateLimit("f", opts, env, 0).ok).toBe(true);
    expect(enforceRateLimit("f", opts, env, 1).ok).toBe(false);
  });
});

describe("F085 clientIp — 프록시 헤더 추출", () => {
  it("x-forwarded-for의 첫 홉을 쓴다", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("x-forwarded-for 부재 시 x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("둘 다 없으면 결정적 폴백", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("F085 업로드 사이즈 상한", () => {
  it("상한 초과 바이트는 storeAsset이 백스톱으로 거부한다", () => {
    const oversized = receiveUpload({
      filename: "big.jpg",
      contentType: "image/jpeg",
      bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1),
    });
    expect(() => storeAsset("CHILD_PHOTO", oversized)).toThrow(/oversized|too large|큰|초과/i);
  });

  it("상한 이하 정상 업로드는 통과한다", () => {
    const ok = receiveUpload({
      filename: "ok.jpg",
      contentType: "image/jpeg",
      bytes: new Uint8Array(1024),
    });
    expect(storeAsset("CHILD_PHOTO", ok).byteSize).toBe(1024);
  });
});
