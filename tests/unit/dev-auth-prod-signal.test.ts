import { describe, it, expect } from "vitest";
import { devAuthEnabled, parseEnv } from "../../src/lib/env";

/**
 * F086 (보안 감사 #3) — dev-auth 배포위생 하드닝. devAuthEnabled가 !isProductionRuntime()만 보면,
 * 비-Vercel 박스에서 APP_ENV 누락 + ALLOW_DEV_AUTH=true일 때 dev-auth 지름길이 켜져 관리자+PII 탈취가
 * 가능하다. APP_ENV 독립 tripwire = NODE_ENV==='production'(실 프로덕션 서버 next start만 production;
 * hermetic E2E·로컬 next dev=development, vitest=test)로 봉쇄한다.
 */
describe("F086 devAuthEnabled — NODE_ENV=production tripwire", () => {
  it("NODE_ENV=production이면 ALLOW_DEV_AUTH가 있어도 false (APP_ENV 누락 self-hosted next start 봉쇄)", () => {
    expect(devAuthEnabled({ NODE_ENV: "production", ALLOW_DEV_AUTH: "true" })).toBe(false);
    expect(devAuthEnabled({ NODE_ENV: "production", ALLOW_DEV_AUTH: "1" })).toBe(false);
    // APP_ENV=development로 명시돼 있어도 NODE_ENV=production이면 닫힘
    expect(devAuthEnabled({ NODE_ENV: "production", APP_ENV: "development", ALLOW_DEV_AUTH: "true" })).toBe(false);
  });

  it("비프로덕션 런타임(development/test/미설정) + 옵트인에서는 여전히 true (hermetic E2E·로컬 dev 무영향)", () => {
    expect(devAuthEnabled({ NODE_ENV: "development", ALLOW_DEV_AUTH: "true" })).toBe(true);
    expect(devAuthEnabled({ NODE_ENV: "test", ALLOW_DEV_AUTH: "true" })).toBe(true);
    expect(devAuthEnabled({ ALLOW_DEV_AUTH: "true" })).toBe(true); // NODE_ENV 미설정
  });
});

describe("F086 parseEnv — 프로덕션 런타임 + dev-auth 옵트인 부팅 거부", () => {
  it("NODE_ENV=production + ALLOW_DEV_AUTH → fail-fast (self-hosted next start)", () => {
    expect(() => parseEnv({ NODE_ENV: "production", ALLOW_DEV_AUTH: "true" })).toThrow(/ALLOW_DEV_AUTH/);
  });

  it("isProductionRuntime(APP_ENV=production) + ALLOW_DEV_AUTH → fail-fast (그 외 유효 prod 설정이어도)", () => {
    expect(() =>
      parseEnv({
        APP_ENV: "production",
        TOSS_WEBHOOK_SECRET: "x",
        MYPAGE_ACCESS_SECRET: "y",
        ALLOW_DEV_AUTH: "true",
      }),
    ).toThrow(/ALLOW_DEV_AUTH/);
  });

  it("hermetic dev(NODE_ENV=development + ALLOW_DEV_AUTH)는 통과 (E2E 부팅 무영향)", () => {
    expect(() => parseEnv({ NODE_ENV: "development", ALLOW_DEV_AUTH: "true" })).not.toThrow();
  });

  it("ALLOW_DEV_AUTH 없는 정상 프로덕션은 이 규칙으로 거부되지 않는다", () => {
    expect(() =>
      parseEnv({ APP_ENV: "production", TOSS_WEBHOOK_SECRET: "x", MYPAGE_ACCESS_SECRET: "y" }),
    ).not.toThrow();
  });
});
