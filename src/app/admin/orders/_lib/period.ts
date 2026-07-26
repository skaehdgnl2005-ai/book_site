import { kstDayStartIso, kstDateToIso, kstMonthStartIso } from "../../../_components/order/format";

/**
 * F089 — /admin/orders 기간 파라미터 해석. 페이지는 이 반환값을 그대로 repo 필터에 얹는다 —
 * 조각이 아니라 이 조합 자체가 유닛으로 고정된다(F083 todayOrdersFilter 패턴).
 * 의미론: range 프리셋은 KST 열린 구간(상한 없음), from/to는 KST 달력일(종료일 포함 = 익일
 * 00:00 배타 상한). range·from/to 동시 존재 시 range 우선. 불량 입력(형식·역전)은 무시.
 */
export type Period = { createdFrom?: string; createdTo?: string };

export const PERIOD_PRESETS = [
  { key: "today", label: "오늘" },
  { key: "7d", label: "7일" },
  { key: "30d", label: "30일" },
  { key: "month", label: "이번달" },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolvePeriod(
  params: { range?: string; from?: string; to?: string },
  nowMs: number,
): Period {
  switch (params.range) {
    case "today":
      return { createdFrom: kstDayStartIso(nowMs) };
    case "7d":
      return { createdFrom: kstDayStartIso(nowMs - 6 * DAY_MS) };
    case "30d":
      return { createdFrom: kstDayStartIso(nowMs - 29 * DAY_MS) };
    case "month":
      return { createdFrom: kstMonthStartIso(nowMs) };
    default: {
      // 미지의 range는 무시하고 from/to로 폴스루 (파라미터 단위 무시 — 스펙 §URL 계약)
      const createdFrom = params.from ? kstDateToIso(params.from) : undefined;
      const createdTo = params.to ? kstDateToIso(params.to, 1) : undefined;
      if (createdFrom && createdTo && createdFrom >= createdTo) return {}; // 역전 — 무시
      return { ...(createdFrom ? { createdFrom } : {}), ...(createdTo ? { createdTo } : {}) };
    }
  }
}
