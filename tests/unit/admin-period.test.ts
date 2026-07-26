import { describe, it, expect } from "vitest";
import { resolvePeriod, PERIOD_PRESETS } from "../../src/app/admin/orders/_lib/period";

// F089 — 기간 해석은 이 순수 함수 하나가 유닛으로 고정 (F083 todayOrdersFilter 패턴:
// 조각이 아니라 페이지가 소비하는 조합 자체를 고정).

const NOW = Date.parse("2026-07-23T02:00:00.000Z"); // KST 2026-07-23 11:00

describe("resolvePeriod (F089)", () => {
  it("프리셋 4종 — KST 경계, 상한 없는 열린 구간", () => {
    expect(resolvePeriod({ range: "today" }, NOW)).toEqual({ createdFrom: "2026-07-22T15:00:00.000Z" });
    expect(resolvePeriod({ range: "7d" }, NOW)).toEqual({ createdFrom: "2026-07-16T15:00:00.000Z" }); // 오늘 포함 7일
    expect(resolvePeriod({ range: "30d" }, NOW)).toEqual({ createdFrom: "2026-06-23T15:00:00.000Z" });
    expect(resolvePeriod({ range: "month" }, NOW)).toEqual({ createdFrom: "2026-06-30T15:00:00.000Z" });
  });
  it("from/to — 종료일 포함(익일 00:00 배타 상한); range 동시 존재 시 range 우선", () => {
    expect(resolvePeriod({ from: "2026-07-01", to: "2026-07-23" }, NOW)).toEqual({
      createdFrom: "2026-06-30T15:00:00.000Z",
      createdTo: "2026-07-23T15:00:00.000Z",
    });
    expect(resolvePeriod({ from: "2026-07-01" }, NOW)).toEqual({ createdFrom: "2026-06-30T15:00:00.000Z" });
    expect(resolvePeriod({ range: "today", from: "2026-07-01", to: "2026-07-23" }, NOW)).toEqual({
      createdFrom: "2026-07-22T15:00:00.000Z",
    });
  });
  it("불량 입력 무시 — 형식 불일치·역전은 빈 기간, 미지의 range는 from/to로 폴스루", () => {
    expect(resolvePeriod({ from: "07/01/2026" }, NOW)).toEqual({});
    expect(resolvePeriod({ from: "2026-07-23", to: "2026-07-01" }, NOW)).toEqual({}); // 역전
    expect(resolvePeriod({ range: "junk", from: "2026-07-01" }, NOW)).toEqual({
      createdFrom: "2026-06-30T15:00:00.000Z",
    });
    expect(resolvePeriod({}, NOW)).toEqual({});
  });
  it("PERIOD_PRESETS — UI가 도는 어휘 그대로", () => {
    expect(PERIOD_PRESETS.map((p) => p.key)).toEqual(["today", "7d", "30d", "month"]);
  });
});
