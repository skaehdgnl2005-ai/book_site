import { describe, it, expect } from "vitest";
import {
  createPrismaOtpStore, hashCode, MAX_ATTEMPTS, MAX_SENDS_PER_WINDOW,
} from "../../src/app/mypage/_lib/otp";
import { getDb } from "../../src/lib/db";

// GATED (skipIf no DATABASE_URL): the ONLY test that exercises the Prisma ATOMIC writes — hermetic
// `pnpm check` runs the in-memory backend and skips this. Its green run against a real docker Postgres is
// MANDATORY dated evidence for F046 passes:true (spec §10 #1; ADR-0016 S10/S11 precedent). Run:
//   pnpm db:up (or an isolated pg) → DATABASE_URL=postgres://… pnpm exec vitest run otp-persistence-integration
describe.skipIf(!process.env.DATABASE_URL)("F046 OtpStore Prisma backend (gated; docker Postgres)", () => {
  const store = createPrismaOtpStore(() => getDb());
  const env = process.env;
  const uid = (s: string) => `ord_int_${s}_${Date.now()}`;

  it("round-trip + restart-survival: issue -> a fresh store handle verifies the same code", async () => {
    const orderId = uid("rt");
    await store.issue(orderId, hashCode(orderId, "424242", env));
    const s2 = createPrismaOtpStore(() => getDb()); // fresh handle reads the committed row
    const d = await s2.verifyDebit(orderId);
    expect(d?.codeHash).toBe(hashCode(orderId, "424242", env));
  });

  it("CONCURRENCY: N parallel verifies never exceed MAX_ATTEMPTS debits (atomic cap)", async () => {
    const orderId = uid("a");
    await store.issue(orderId, hashCode(orderId, "424242", env));
    const N = 25;
    const results = await Promise.all(Array.from({ length: N }, () => store.verifyDebit(orderId)));
    expect(results.filter(Boolean).length).toBe(MAX_ATTEMPTS); // exactly the cap, not N
  });

  it("CONCURRENCY: N parallel issues never exceed MAX_SENDS_PER_WINDOW sends (atomic throttle)", async () => {
    const orderId = uid("b");
    const N = 25;
    const sent = await Promise.all(
      Array.from({ length: N }, () => store.issue(orderId, hashCode(orderId, "424242", env))),
    );
    expect(sent.filter((r) => r.sent).length).toBe(MAX_SENDS_PER_WINDOW);
  });

  it("CONCURRENCY: two parallel consumes -> a later verify is null (single-use holds)", async () => {
    const orderId = uid("c");
    await store.issue(orderId, hashCode(orderId, "424242", env));
    await Promise.all([store.consume(orderId), store.consume(orderId)]);
    expect(await store.verifyDebit(orderId)).toBeNull();
  });
});
