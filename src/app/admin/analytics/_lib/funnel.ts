/**
 * F092 — 구매 퍼널 정의(순수 설정 + 표시 헬퍼). 각 단계는 닫힌 EventMatch 어휘만 쓰므로
 * in-memory/Prisma 어느 백엔드로도 동형 집계된다. 단계 값은 고유 세션 수(원시 클릭 수 아님).
 * period.ts/query.ts처럼 렌더 모듈이 아닌 순수 _lib — requireAdmin은 page.tsx 소관(R13).
 */
import type { EventMatch } from "../../../api/events/_lib/analytics";

export type FunnelStep = { key: string; label: string; match: EventMatch };

/** 엔트리 구매 여정(기념일·첫 순간들) 순서 그대로 — 맞춤 제작(/custom)은 별도 플로우라 제외. */
export const FUNNEL_STEPS: readonly FunnelStep[] = [
  { key: "home", label: "홈 방문", match: { kind: "page_view", path: "/" } },
  { key: "category", label: "카테고리 방문", match: { kind: "page_view", paths: ["/anniversary", "/first-moments"] } },
  { key: "order_start", label: "주문 시작(템플릿)", match: { kind: "page_view", pathPrefix: "/order/" } },
  { key: "add_to_cart", label: "장바구니 담기 클릭", match: { kind: "cta_click", name: "order_add_to_cart" } },
  { key: "cart", label: "장바구니 방문", match: { kind: "page_view", path: "/cart" } },
  { key: "checkout", label: "결제 페이지 방문", match: { kind: "page_view", path: "/checkout" } },
  { key: "pay_click", label: "결제하기 클릭", match: { kind: "cta_click", name: "checkout_pay" } },
  // 가상계좌는 입금 전에도 successUrl로 착지한다 — '결제 완료'로 쓰면 미입금을 결제로 오독
  // (적대적 검수 확정 #7). 이벤트 스트림은 경로만 알므로 라벨을 정직하게 쓴다(F082 원칙).
  { key: "paid", label: "결제 승인(입금대기 포함)", match: { kind: "page_view", path: "/checkout/success" } },
];

/** 정수 % 라벨 — 분모 0이면 '–'(0%로 오독 방지). */
export function pctLabel(numerator: number, denominator: number): string {
  if (denominator === 0) return "–";
  return `${Math.round((numerator / denominator) * 100)}%`;
}
