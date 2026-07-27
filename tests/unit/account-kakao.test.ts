import { describe, it, expect } from "vitest";
import {
  parseKakaoProfile,
  realKakaoProvider,
  sandboxCode,
  sandboxKakaoProvider,
  kakaoProviderFromEnv,
  kakaoLoginAvailable,
  kakaoRedirectUri,
  type KakaoTransport,
} from "../../src/app/account/_lib/kakao";
import { resolveKakaoLogin } from "../../src/app/account/_lib/kakaoLogin";
import { createInMemoryUserRepo } from "../../src/app/account/_lib/users";
import { createOrderRepo, type OrderDraft } from "../../src/app/api/payments/_lib/orders";

// F058 (ADR-0023 D4) — Kakao OAuth: profile trust rule (valid+verified email ONLY), the
// injected-transport exchange, the sandbox codec, and the full account-resolution table.

describe("parseKakaoProfile — the email trust rule", () => {
  it("accepts the email only when Kakao asserts BOTH valid and verified", () => {
    const full = parseKakaoProfile({
      id: 12345,
      kakao_account: { email: "User@Kakao.com", is_email_valid: true, is_email_verified: true },
    });
    expect(full).toEqual({ kakaoId: "12345", email: "user@kakao.com" }); // normalized lowercase
    for (const acc of [
      { email: "u@k.com", is_email_valid: true }, // verified missing
      { email: "u@k.com", is_email_verified: true }, // valid missing
      { email: "u@k.com", is_email_valid: false, is_email_verified: true },
      {}, // 미동의 — no email at all
    ]) {
      expect(parseKakaoProfile({ id: 1, kakao_account: acc })?.email).toBeNull();
    }
  });

  it("no id → null (never a half-profile)", () => {
    expect(parseKakaoProfile({})).toBeNull();
    expect(parseKakaoProfile(undefined)).toBeNull();
  });

  it("an id past 2^53 → null (Kakao's Long would silently ROUND into another user's id)", () => {
    // Kakao types `id` as a Long, and this is exactly how it reaches us: JSON.parse collapses
    // 9007199254740993 to ...992, so accepting it would mint a session for a DIFFERENT Kakao
    // account than the one that just authenticated. Parsed here rather than written as a literal
    // because the precision loss is the point (a bare literal trips no-loss-of-precision).
    const rounded = JSON.parse('{"id":9007199254740993}') as { id: number };
    expect(Number.isSafeInteger(rounded.id)).toBe(false); // the precision loss, demonstrated
    expect(parseKakaoProfile(rounded)).toBeNull();
    expect(parseKakaoProfile({ id: 1.5 })).toBeNull();
    // A string id is exact by construction, so arbitrarily large ones stay accepted.
    expect(parseKakaoProfile({ id: "90071992547409931" })?.kakaoId).toBe("90071992547409931");
  });
});

describe("kakaoRedirectUri — pinned so Kakao's exact-match check can't drift (KOE006)", () => {
  it("prefers BASE_URL over the inbound host, and strips a trailing slash", () => {
    // Vercel serves one deployment under the custom domain, <project>.vercel.app AND a per-deploy
    // alias; only the registered URI is accepted, so the inbound host must not decide.
    const env = { BASE_URL: "https://shop.example/" };
    expect(kakaoRedirectUri("https://storybook-shop-abc123.vercel.app", env)).toBe(
      "https://shop.example/api/auth/kakao/callback",
    );
  });

  it("falls back to the request origin when BASE_URL is unset/blank/garbage", () => {
    for (const env of [{}, { BASE_URL: "" }, { BASE_URL: "   " }, { BASE_URL: "not-a-url" }]) {
      expect(kakaoRedirectUri("http://localhost:3000", env)).toBe(
        "http://localhost:3000/api/auth/kakao/callback",
      );
    }
  });
});

describe("kakaoLoginAvailable — /login hides the button when it cannot possibly work", () => {
  it("true under the dev-auth sandbox or with a real key; false when neither is present", () => {
    expect(kakaoLoginAvailable({ APP_ENV: "development", ALLOW_DEV_AUTH: "true" })).toBe(true);
    expect(kakaoLoginAvailable({ APP_ENV: "production", KAKAO_REST_API_KEY: "rk" })).toBe(true);
    expect(kakaoLoginAvailable({ APP_ENV: "development" })).toBe(false); // no opt-in, no key
    expect(kakaoLoginAvailable({ APP_ENV: "production" })).toBe(false); // prod without the key
    // The dev-auth flag must NOT resurrect the button on a production runtime — same gate as the
    // start route, so the two can never disagree about whether the flow can complete.
    expect(kakaoLoginAvailable({ APP_ENV: "production", ALLOW_DEV_AUTH: "true" })).toBe(false);
  });
});

describe("realKakaoProvider.exchange (injected transport — hermetic)", () => {
  it("POSTs the token form (client_id/redirect_uri/code/secret) then GETs user/me with the Bearer", async () => {
    const calls: { url: string; init: { method: string; headers: Record<string, string>; body?: string } }[] = [];
    const transport: KakaoTransport = async (url, init) => {
      calls.push({ url, init });
      if (url.includes("kauth")) return { ok: true, status: 200, json: async () => ({ access_token: "at_1" }) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 9, kakao_account: { email: "a@b.com", is_email_valid: true, is_email_verified: true } }),
      };
    };
    const profile = await realKakaoProvider({ restApiKey: "rk_1", clientSecret: "cs_1", transport }).exchange(
      "auth_code",
      "https://shop.example/api/auth/kakao/callback",
    );
    expect(profile).toEqual({ kakaoId: "9", email: "a@b.com" });
    const tokenBody = new URLSearchParams(calls[0].init.body ?? "");
    expect(calls[0].url).toContain("kauth.kakao.com/oauth/token");
    expect(tokenBody.get("grant_type")).toBe("authorization_code");
    expect(tokenBody.get("client_id")).toBe("rk_1");
    expect(tokenBody.get("client_secret")).toBe("cs_1");
    expect(tokenBody.get("code")).toBe("auth_code");
    expect(tokenBody.get("redirect_uri")).toBe("https://shop.example/api/auth/kakao/callback");
    expect(calls[1].url).toContain("kapi.kakao.com/v2/user/me");
    expect(calls[1].init.headers.Authorization).toBe("Bearer at_1");
  });

  it("a non-2xx token or user/me response → null (fail-closed, no throw)", async () => {
    const bad: KakaoTransport = async () => ({ ok: false, status: 401, json: async () => ({}) });
    expect(await realKakaoProvider({ restApiKey: "rk", transport: bad }).exchange("c", "r")).toBeNull();
  });

  // The contract is "null on ANY failure". Before F091 only the !ok branch honored it: a rejecting
  // fetch (DNS/TLS/timeout) or a non-JSON body (kauth serves HTML on 5xx) propagated out of the
  // callback as a 500 — which is itself an oracle (it says the CSRF state check passed) and skips
  // the state-cookie cleanup. These are the paths that had never once executed in production.
  it("a REJECTING transport → null, not a throw", async () => {
    const dead: KakaoTransport = async () => {
      throw new Error("ECONNRESET");
    };
    await expect(realKakaoProvider({ restApiKey: "rk", transport: dead }).exchange("c", "r")).resolves.toBeNull();
  });

  it("a non-JSON body on either leg → null, not a throw", async () => {
    const html = async () => {
      throw new SyntaxError("Unexpected token '<'");
    };
    const tokenHtml: KakaoTransport = async () => ({ ok: true, status: 200, json: html });
    await expect(realKakaoProvider({ restApiKey: "rk", transport: tokenHtml }).exchange("c", "r")).resolves.toBeNull();

    const meHtml: KakaoTransport = async (url) =>
      url.includes("kauth")
        ? { ok: true, status: 200, json: async () => ({ access_token: "at" }) }
        : { ok: true, status: 200, json: html };
    await expect(realKakaoProvider({ restApiKey: "rk", transport: meHtml }).exchange("c", "r")).resolves.toBeNull();
  });

  it("authorizeUrl carries client_id / redirect_uri / state", () => {
    const url = realKakaoProvider({ restApiKey: "rk_1" }).authorizeUrl("st_1", "https://x/cb");
    expect(url).toContain("kauth.kakao.com/oauth/authorize");
    expect(url).toContain("client_id=rk_1");
    expect(url).toContain("state=st_1");
    expect(url).toContain(encodeURIComponent("https://x/cb"));
  });
});

describe("sandbox provider (non-production only)", () => {
  it("code → profile roundtrip; garbage → null; factory picks it outside production", async () => {
    const sbx = sandboxKakaoProvider();
    const code = sandboxCode({ kakaoId: "k1", email: "e@x.com" });
    expect(await sbx.exchange(code, "r")).toEqual({ kakaoId: "k1", email: "e@x.com" });
    expect(await sbx.exchange(sandboxCode({ kakaoId: "k2", email: null }), "r")).toEqual({ kakaoId: "k2", email: null });
    expect(await sbx.exchange("not_a_sandbox_code", "r")).toBeNull();
    // F074 — the sandbox provider is picked only under the dev-auth opt-in (ALLOW_DEV_AUTH); a
    // flagless non-prod box gets the REAL provider (fail-closed without a key/network).
    expect(kakaoProviderFromEnv({ APP_ENV: "development", ALLOW_DEV_AUTH: "true" }).name).toBe("kakao-sandbox");
    expect(kakaoProviderFromEnv({ APP_ENV: "development" }).name).toBe("kakao"); // no opt-in → real
    expect(kakaoProviderFromEnv({ APP_ENV: "production", KAKAO_REST_API_KEY: "rk" }).name).toBe("kakao");
  });
});

// ── account resolution table ─────────────────────────────────────────────────────
function guestOrderDraft(email: string): OrderDraft {
  return {
    amountWon: 43000,
    orderName: "탄생",
    qrVideoAddon: false,
    buyerName: "김부모",
    buyerEmail: email,
    items: [],
  };
}

describe("resolveKakaoLogin — decision table", () => {
  it("① a known kakaoId logs into its account", async () => {
    const users = createInMemoryUserRepo();
    const orders = createOrderRepo();
    const first = await resolveKakaoLogin(users, orders, { kakaoId: "k1", email: null });
    const again = await resolveKakaoLogin(users, orders, { kakaoId: "k1", email: null });
    expect(again.id).toBe(first.id);
  });

  it("② a Kakao-VERIFIED email logs into the existing email account, attaches kakaoId, claims guest orders", async () => {
    const users = createInMemoryUserRepo();
    const orders = createOrderRepo();
    const existing = await users.upsertByEmail("owner@example.com");
    const guest = await orders.create(guestOrderDraft("owner@example.com"));

    const user = await resolveKakaoLogin(users, orders, { kakaoId: "k9", email: "owner@example.com" });
    expect(user.id).toBe(existing.id);
    expect(user.kakaoId).toBe("k9");
    expect((await orders.get(guest.id))?.userId).toBe(existing.id); // claimed
  });

  it("②b an account already holding a DIFFERENT kakaoId keeps it (first-wins) but still logs in", async () => {
    const users = createInMemoryUserRepo();
    const orders = createOrderRepo();
    const existing = await users.upsertByEmail("dup@example.com");
    await users.attachKakao(existing.id, "k_original");

    const user = await resolveKakaoLogin(users, orders, { kakaoId: "k_new", email: "dup@example.com" });
    expect(user.id).toBe(existing.id);
    expect(user.kakaoId).toBe("k_original"); // never overwritten
  });

  it("③ verified email with no account → new user (email + kakaoId) + guest-order claim", async () => {
    const users = createInMemoryUserRepo();
    const orders = createOrderRepo();
    const guest = await orders.create(guestOrderDraft("new@example.com"));

    const user = await resolveKakaoLogin(users, orders, { kakaoId: "k3", email: "new@example.com" });
    expect(user.email).toBe("new@example.com");
    expect(user.emailVerifiedAt).toBeTruthy();
    expect((await orders.get(guest.id))?.userId).toBe(user.id);
  });

  it("④ 미동의(no verified email) → an email-less account; nothing is claimed", async () => {
    const users = createInMemoryUserRepo();
    const orders = createOrderRepo();
    const guest = await orders.create(guestOrderDraft("hidden@example.com"));

    const user = await resolveKakaoLogin(users, orders, { kakaoId: "k4", email: null });
    expect(user.email).toBeNull();
    expect((await orders.get(guest.id))?.userId).toBeUndefined();
  });
});

describe("attachEmail (kakao-only account, post-signup)", () => {
  it("attaches once; refuses when the user already has an email or another account owns it", async () => {
    const users = createInMemoryUserRepo();
    const kakaoOnly = await users.createKakaoUser({ kakaoId: "k5", email: null });
    const other = await users.upsertByEmail("taken@example.com");

    expect(await users.attachEmail(kakaoOnly.id, "taken@example.com")).toBeUndefined(); // owned elsewhere
    const attached = await users.attachEmail(kakaoOnly.id, "Fresh@Example.com");
    expect(attached?.email).toBe("fresh@example.com");
    expect(attached?.emailVerifiedAt).toBeTruthy();
    expect(await users.attachEmail(kakaoOnly.id, "another@example.com")).toBeUndefined(); // already has one
    expect(await users.attachEmail(other.id, "x@example.com")).toBeUndefined(); // email accounts unchanged
  });
});
