import { describe, it, expect } from "vitest";
import {
  formatWon as orderFormatWon,
  formatKstDateTime,
  formatKstDate,
  kstDateToIso,
  kstMonthStartIso,
} from "../../src/app/_components/order/format";
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

describe("formatKstDate (F088 — 주문일 KST 달력일)", () => {
  it("UTC 자정 부근도 KST 달력일 — naive slice(0,10) 회귀 가드", () => {
    expect(formatKstDate("2026-07-22T16:30:00.000Z")).toBe("2026-07-23"); // KST 01:30
    expect(formatKstDate("2026-07-23T14:59:00.000Z")).toBe("2026-07-23"); // KST 23:59
  });
  it("invalid iso는 입력 그대로 (formatKstDateTime 선례)", () => {
    expect(formatKstDate("junk")).toBe("junk");
  });
});

describe("kstDateToIso / kstMonthStartIso (F089 — 기간 경계)", () => {
  it("KST 달력일 → 00:00 instant; dayOffset=1은 익일(포함 종료일의 배타 상한)", () => {
    expect(kstDateToIso("2026-07-23")).toBe("2026-07-22T15:00:00.000Z");
    expect(kstDateToIso("2026-07-23", 1)).toBe("2026-07-23T15:00:00.000Z");
    expect(kstDateToIso("2026-7-3")).toBeUndefined(); // 형식 불일치
    expect(kstDateToIso("junk")).toBeUndefined();
  });
  it("kstMonthStartIso: KST 달 1일 00:00 — UTC 말일 저녁은 KST 새달", () => {
    // 2026-07-31T16:00Z = KST 08-01 01:00 → 8월 시작(= 07-31T15:00Z)
    expect(kstMonthStartIso(Date.parse("2026-07-31T16:00:00.000Z"))).toBe("2026-07-31T15:00:00.000Z");
    // 2026-07-15T00:00Z = KST 07-15 09:00 → 7월 시작(= 06-30T15:00Z)
    expect(kstMonthStartIso(Date.parse("2026-07-15T00:00:00.000Z"))).toBe("2026-06-30T15:00:00.000Z");
  });
});
