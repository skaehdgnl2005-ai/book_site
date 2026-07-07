import { describe, it, expect } from "vitest";
import { adminEmails, isAdminEmail, DEV_ADMIN_EMAIL } from "../../src/app/admin/_lib/adminAuth";
import { createOrderRepo, type OrderDraft } from "../../src/app/api/payments/_lib/orders";

// F059 (ADR-0024) — the admin allowlist + the admin order listing.

describe("adminEmails / isAdminEmail", () => {
  it("parses a comma-separated list, trimming + lowercasing", () => {
    const env = { ADMIN_EMAILS: " Boss@Shop.kr, ops@shop.kr ,, " };
    expect(adminEmails(env)).toEqual(["boss@shop.kr", "ops@shop.kr"]);
    expect(isAdminEmail("BOSS@shop.kr", env)).toBe(true);
    expect(isAdminEmail("intruder@shop.kr", env)).toBe(false);
    expect(isAdminEmail(null, env)).toBe(false);
  });

  it("production WITHOUT ADMIN_EMAILS denies everyone (fail-closed) — incl. the dev family", () => {
    const prod = { APP_ENV: "production" };
    expect(adminEmails(prod)).toEqual([]);
    expect(isAdminEmail(DEV_ADMIN_EMAIL, prod)).toBe(false);
    expect(isAdminEmail("admin+x@example.com", prod)).toBe(false);
  });

  it("non-prod falls back to the deterministic dev admin family (parallel-E2E identities), overridable", () => {
    const dev = { APP_ENV: "development" } as Record<string, string | undefined>;
    expect(isAdminEmail(DEV_ADMIN_EMAIL, dev)).toBe(true);
    expect(isAdminEmail("admin+f059@example.com", dev)).toBe(true); // plus-address family
    expect(isAdminEmail("administrator@example.com", dev)).toBe(false);
    expect(isAdminEmail("admin@evil.com", dev)).toBe(false);
    // an explicit list REPLACES the fallback (never additive)
    expect(isAdminEmail(DEV_ADMIN_EMAIL, { APP_ENV: "development", ADMIN_EMAILS: "only@shop.kr" })).toBe(false);
  });
});

// ── listRecent (admin listing) ─────────────────────────────────────────────────
function draft(over: Partial<OrderDraft> = {}): OrderDraft {
  return {
    amountWon: 43000,
    orderName: "탄생",
    qrVideoAddon: false,
    buyerName: "김부모",
    buyerEmail: "parent@example.com",
    items: [],
    ...over,
  };
}

describe("orderRepo.listRecent (F059)", () => {
  it("newest first, optional status filter, bounded take", async () => {
    const repo = createOrderRepo();
    const a = await repo.create(draft());
    const b = await repo.create(draft());
    await repo.markPaid(b.id, "pk_b");

    const all = await repo.listRecent();
    expect(all.map((o) => o.id)).toContain(a.id);
    expect(all.map((o) => o.id)).toContain(b.id);

    const paidOnly = await repo.listRecent({ status: "PAID" });
    expect(paidOnly.map((o) => o.id)).toEqual([b.id]);
    const createdOnly = await repo.listRecent({ status: "CREATED" });
    expect(createdOnly.map((o) => o.id)).toEqual([a.id]);

    expect((await repo.listRecent({ take: 1 })).length).toBe(1);
  });
});

describe("orderRepo.setTracking (F060)", () => {
  it("records carrier + number; unknown id → undefined", async () => {
    const repo = createOrderRepo();
    const order = await repo.create(draft());
    const updated = await repo.setTracking(order.id, "CJ대한통운", "1234-5678-9012");
    expect(updated?.trackingCarrier).toBe("CJ대한통운");
    expect(updated?.trackingNumber).toBe("1234-5678-9012");
    expect((await repo.get(order.id))?.trackingNumber).toBe("1234-5678-9012");
    expect(await repo.setTracking("ord_nope", "c", "n")).toBeUndefined();
  });
});
