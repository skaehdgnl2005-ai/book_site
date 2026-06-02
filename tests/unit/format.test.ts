import { describe, it, expect } from "vitest";
import { formatWon as orderFormatWon } from "../../src/app/_components/order/format";
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
