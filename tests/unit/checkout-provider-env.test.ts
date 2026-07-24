import { describe, it, expect } from "vitest";
import {
  checkoutProvider,
  webhookSecret,
  checkoutClientKey,
} from "../../src/app/api/payments/_lib/checkout";
import { customTossProvider } from "../../src/lib/customRequest";
import { register } from "../../src/instrumentation";
import { parseEnv } from "../../src/lib/env";

/** Run `fn` with `process.env` swapped to `env`, then restore (parseEnv/register read process.env). */
async function withEnv(env: Record<string, string>, fn: () => Promise<unknown>): Promise<void> {
  const OLD = process.env;
  process.env = env as unknown as NodeJS.ProcessEnv;
  try {
    await fn();
  } finally {
    process.env = OLD;
  }
}

/**
 * F084 (보안 감사 #1) — 결제 provider 선택은 권위 술어 isProductionRuntime(APP_ENV 또는
 * VERCEL_ENV)로 게이트해야 한다. 과거엔 env.APP_ENV==="production" 단독이라, Vercel 프로덕션
 * (VERCEL_ENV=production 자동 주입)에서 APP_ENV 누락 시 결제 provider가 샌드박스로 폴백해
 * /confirm이 네트워크 없이 0원 PAID로 정산되는 '공짜 책' 경로가 열렸다. 핵심 관측: 프로덕션
 * 런타임에서는 실 provider 경로(키 부재 시 fail-closed throw)를 타고, 웹훅 시크릿/위젯키는
 * 공개 테스트 상수로 강등되지 않는다.
 */
describe("F084 결제 provider prod-gate = isProductionRuntime (APP_ENV OR VERCEL_ENV)", () => {
  describe("checkoutProvider — VERCEL_ENV=production은 APP_ENV 누락이어도 프로덕션", () => {
    it("VERCEL_ENV=production + 키 부재 → 샌드박스 폴백 없이 fail-closed throw", () => {
      expect(() => checkoutProvider({ VERCEL_ENV: "production" })).toThrow(/not configured/i);
    });

    it("APP_ENV=production + 키 부재 → throw (기존 동작 유지)", () => {
      expect(() => checkoutProvider({ APP_ENV: "production" })).toThrow(/not configured/i);
    });

    it("VERCEL_ENV=production + 테스트 키 → 실 provider 경로(throw 없음)", () => {
      expect(() =>
        checkoutProvider({
          VERCEL_ENV: "production",
          TOSS_SECRET_KEY: "test_sk_x",
          NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_ck_x",
        }),
      ).not.toThrow();
    });

    it("비프로덕션(env 없음) → 샌드박스 provider(throw 없음, hermetic 경로 보존)", () => {
      const provider = checkoutProvider({});
      expect(typeof provider.confirm).toBe("function");
    });
  });

  describe("customTossProvider — 동일 게이트", () => {
    it("VERCEL_ENV=production + 키 부재 → fail-closed throw", () => {
      expect(() => customTossProvider({ VERCEL_ENV: "production" })).toThrow(/not configured/i);
    });

    it("비프로덕션 → 샌드박스 provider(throw 없음)", () => {
      const provider = customTossProvider({});
      expect(typeof provider.confirm).toBe("function");
    });
  });

  describe("webhookSecret — 프로덕션에서 공개 상수 강등 금지", () => {
    it("VERCEL_ENV=production → test_whsec_sandbox로 폴백하지 않음(undefined)", () => {
      expect(webhookSecret({ VERCEL_ENV: "production" })).toBeUndefined();
    });

    it("APP_ENV=production → undefined (기존 동작 유지)", () => {
      expect(webhookSecret({ APP_ENV: "production" })).toBeUndefined();
    });

    it("VERCEL_ENV=production + 실 시크릿 → 그 시크릿 사용", () => {
      expect(webhookSecret({ VERCEL_ENV: "production", TOSS_WEBHOOK_SECRET: "whsec_real" })).toBe(
        "whsec_real",
      );
    });

    it("비프로덕션 → test_whsec_sandbox 폴백(hermetic 웹훅 검증 보존)", () => {
      expect(webhookSecret({})).toBe("test_whsec_sandbox");
    });
  });

  describe("checkoutClientKey — 프로덕션에서 테스트 위젯키 폴백 금지", () => {
    it("VERCEL_ENV=production → 테스트 위젯키로 폴백하지 않음(빈 문자열)", () => {
      expect(checkoutClientKey({ VERCEL_ENV: "production" })).toBe("");
    });

    it("VERCEL_ENV=production + 실 위젯키 → 그 키 사용", () => {
      expect(
        checkoutClientKey({ VERCEL_ENV: "production", NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY: "live_gck_x" }),
      ).toBe("live_gck_x");
    });

    it("비프로덕션 → 공개 테스트 위젯키 폴백(dev/E2E 렌더 보존)", () => {
      expect(checkoutClientKey({}).startsWith("test_gck_")).toBe(true);
    });
  });
});

/**
 * F084 — instrumentation.register()가 부팅 시 parseEnv()를 실제로 호출해 죽어 있던 env 부팅 가드를
 * 살린다. 노드 런타임에서만 검증하고, 잘못 설정된 프로덕션 env는 fail-fast로 거부한다.
 */
describe("F084 instrumentation.register — parseEnv 부팅 배선", () => {
  it("유효한 비프로덕션 env → register 통과(정상 부팅)", async () => {
    await withEnv({ NEXT_RUNTIME: "nodejs", APP_ENV: "development" }, () =>
      expect(register()).resolves.toBeUndefined(),
    );
  });

  it("잘못 설정된 프로덕션 부팅(비밀 누락) → register가 fail-fast 거부", async () => {
    await withEnv({ NEXT_RUNTIME: "nodejs", APP_ENV: "production" }, () =>
      expect(register()).rejects.toThrow(/TOSS_WEBHOOK_SECRET|MYPAGE_ACCESS_SECRET/),
    );
  });

  it("노드 런타임이 아니면 검증을 건너뛴다(에지 — 배선의 게이트 증명)", async () => {
    await withEnv({ NEXT_RUNTIME: "edge", APP_ENV: "production" }, () =>
      expect(register()).resolves.toBeUndefined(),
    );
  });
});

/**
 * F084 — parseEnv를 부팅에서 실제 호출하면서 드러난 잠복 버그 교정: 빈 문자열 URL env는 "미설정"으로
 * 취급해야 한다(orders.ts가 falsy DATABASE_URL을 in-memory 신호로 쓰고, hermetic E2E가 DATABASE_URL/
 * SUPABASE_URL을 ""로 비운다). 단, 비어 있지 않은 잘못된 URL은 여전히 거부한다.
 */
describe("F084 parseEnv 빈 문자열 URL = 미설정(부팅 크래시 방지)", () => {
  it("DATABASE_URL/DIRECT_URL/SUPABASE_URL='' → 미설정으로 통과", () => {
    const env = parseEnv({ DATABASE_URL: "", DIRECT_URL: "", SUPABASE_URL: "" });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.SUPABASE_URL).toBeUndefined();
  });

  it("BASE_URL='' → 기본값으로 폴백", () => {
    expect(parseEnv({ BASE_URL: "" }).BASE_URL).toBe("http://localhost:3000");
  });

  it("비어 있지 않은 잘못된 URL은 여전히 거부(검증이 무력화되지 않음)", () => {
    expect(() => parseEnv({ DATABASE_URL: "not-a-url" })).toThrow(/DATABASE_URL/);
  });
});
