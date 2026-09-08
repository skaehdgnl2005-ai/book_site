/**
 * F092 — 전환 지표 이벤트 어휘(닫힌 집합). 클라이언트 트래커와 서버 검증이 같은 상수를
 * 공유한다 — import 0의 순수 모듈이라 클라이언트 번들에 안전(서버 전용 코드 유입 금지).
 */
export const EVENT_KINDS = ["page_view", "scroll", "cta_click"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const SCROLL_DEPTHS = [25, 50, 75, 100] as const;
export type ScrollDepth = (typeof SCROLL_DEPTHS)[number];

/** 추적하는 CTA의 닫힌 이름 집합 — 마크업의 data-analytics 값과 1:1. */
export const CTA_NAMES = [
  "home_hero",
  "template_card",
  "order_next",
  "order_add_to_cart",
  "cart_checkout",
  "checkout_pay",
] as const;
export type CtaName = (typeof CTA_NAMES)[number];

/**
 * 스크롤 도달 비율(0~1)이 넘어선 임계 중 아직 안 보낸 것만 돌려준다(경로당 1회 전송).
 * 비정상 비율(NaN·음수)은 빈 배열 — 트래커는 어떤 입력에도 던지지 않는다.
 */
export function crossedThresholds(ratio: number, sent: ReadonlySet<number>): number[] {
  if (!Number.isFinite(ratio) || ratio <= 0) return [];
  return SCROLL_DEPTHS.filter((d) => ratio * 100 >= d && !sent.has(d));
}
