import { describe, it, expect } from "vitest";
import { formatWon as orderFormatWon, formatKstDateTime } from "../../src/app/_components/order/format";
import { formatWon as catalogFormatWon } from "../../src/app/_components/catalog/templates";

// formatWon is intentionally duplicated across the catalog (server) and order (client-safe)
// modules because client components can't value-import templates.ts (its dynamic @/lib/db
// import breaks the browser bundle). This test pins the twins together so they can't drift.
describe("formatWon (order ↔ catalog twin parity)", () => {
  const cases = [0, 1, 100, 999, 1000, 43000, 49000, 119000, 1000000];

  it("the order copy formats KRW won correctly", () => {
    expect(orderFormatWon(0)).toBe("0원");
    expect(orderFormatWon(43000)).toBe("43,000원");
    expect(orderFormatWon(49000)).toBe("49,000원");
    expect(orderFormatWon(1000000)).toBe("1,000,000원");
  });

  it("the order and catalog copies produce identical output", () => {
    for (const n of cases) {
      expect(orderFormatWon(n)).toBe(catalogFormatWon(n));
    }
  });
});

// F070 — the deposit deadline is KST; a naive ISO slice would show UTC (9h early) once the value
// round-trips through Prisma's toISOString(). formatKstDateTime must render the KST wall-clock.
describe("formatKstDateTime (F070 — KST deposit deadline)", () => {
  it("renders a UTC instant as the Asia/Seoul wall-clock (+9h) with a KST label", () => {
    // 2026-07-20T14:59:59Z === 2026-07-20 23:59 KST (the real Toss dueDate 23:59:59+09:00).
    expect(formatKstDateTime("2026-07-20T14:59:59.000Z")).toBe("2026-07-20 23:59 (KST)");
  });

  it("an offset-bearing ISO is shown at the same KST wall-clock regardless of how it was stored", () => {
    expect(formatKstDateTime("2026-07-20T23:59:59+09:00")).toBe("2026-07-20 23:59 (KST)");
    // crossing midnight UTC: 2026-07-20T15:30Z === 2026-07-21 00:30 KST.
    expect(formatKstDateTime("2026-07-20T15:30:00.000Z")).toBe("2026-07-21 00:30 (KST)");
  });

  it("returns the input unchanged on an unparseable string (never throws)", () => {
    expect(formatKstDateTime("not-a-date")).toBe("not-a-date");
  });
});
