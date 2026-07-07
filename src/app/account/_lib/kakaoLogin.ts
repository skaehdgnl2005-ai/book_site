/**
 * F058 (ADR-0023 D4) — Kakao → account resolution. Injectable (users/orders repos) so the
 * whole decision table is hermetically unit-tested:
 *
 *   ① kakaoId already linked            → that account (re-login).
 *   ② Kakao-VERIFIED email exists here  → log into that account, attach kakaoId (first-wins —
 *      an account already holding a different kakaoId keeps it; ownership of the email was
 *      proven by Kakao either way), claim this email's guest orders.
 *   ③ verified email, no account        → create (email + kakaoId), claim guest orders.
 *   ④ no verified email (미동의/미검증)   → create an email-less account; /account then offers
 *      the OTP email-attach flow (actions.ts) — an UNVERIFIED email never auto-links (takeover).
 */
import type { KakaoProfile } from "./kakao";
import type { StoredUser, UserRepo } from "./users";

export interface OrderClaimer {
  claimByEmail(email: string, userId: string): Promise<{ count: number }>;
}

export async function resolveKakaoLogin(
  users: UserRepo,
  orders: OrderClaimer,
  profile: KakaoProfile,
  now: number = Date.now(),
): Promise<StoredUser> {
  const byKakao = await users.findByKakaoId(profile.kakaoId);
  if (byKakao) return byKakao;

  if (profile.email) {
    const existing = await users.findByEmail(profile.email);
    if (existing) {
      const attached = await users.attachKakao(existing.id, profile.kakaoId);
      await orders.claimByEmail(profile.email, existing.id);
      return attached ?? existing;
    }
    const created = await users.createKakaoUser({ kakaoId: profile.kakaoId, email: profile.email }, now);
    await orders.claimByEmail(profile.email, created.id);
    return created;
  }

  return users.createKakaoUser({ kakaoId: profile.kakaoId, email: null }, now);
}
