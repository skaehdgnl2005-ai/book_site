import { describe, it, expect } from "vitest";
import { parseEnv, isProductionRuntime } from "../../src/lib/env";

const base = { APP_ENV: "production", MYPAGE_ACCESS_SECRET: "x" } as Record<string, string | undefined>;

describe("F046 env: MYPAGE_ACCESS_SECRET + hardened isProd", () => {
  it("throws when production and MYPAGE_ACCESS_SECRET is unset", () => {
    expect(() => parseEnv({ APP_ENV: "production" })).toThrow(/MYPAGE_ACCESS_SECRET/);
  });
  it("accepts production when MYPAGE_ACCESS_SECRET is set", () => {
    expect(() => parseEnv(base)).not.toThrow();
  });
  it("non-prod without the secret is fine (dev fallback handles it)", () => {
    expect(() => parseEnv({ APP_ENV: "development" })).not.toThrow();
  });
  it("throws when VERCEL_ENV=production but APP_ENV!==production (typo backstop)", () => {
    expect(() => parseEnv({ APP_ENV: "development", VERCEL_ENV: "production", MYPAGE_ACCESS_SECRET: "x" }))
      .toThrow(/VERCEL_ENV=production but APP_ENV/);
  });
  it("isProductionRuntime is true on Vercel prod even if APP_ENV is wrong", () => {
    expect(isProductionRuntime({ APP_ENV: "development", VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionRuntime({ APP_ENV: "production" })).toBe(true);
    expect(isProductionRuntime({ APP_ENV: "development" })).toBe(false);
  });
});
