import { kstDayStartIso } from "../../_components/order/format";
import { PAID_FAMILY } from "../../api/payments/_lib/status";
import type { OrderListFilter } from "../../api/payments/_lib/orders";

/**
 * F083 — '오늘 주문' 타일의 확정 의미론을 하나의 이름으로: KST(Asia/Seoul) 오늘 00:00 이후
 * 생성 && status ∈ PAID_FAMILY ∪ WAITING_FOR_DEPOSIT (미결제 이탈 CREATED·취소·환불 제외 —
 * 오늘 유효하게 성립한 주문). 페이지는 이 값을 그대로 count에 넘긴다 — 조각(kstDayStartIso·
 * count 어휘)만이 아니라 이 조합 자체가 유닛으로 고정된다(worker≠checker F083 major 교정).
 */
export function todayOrdersFilter(nowMs: number): OrderListFilter {
  return {
    statusIn: [...PAID_FAMILY, "WAITING_FOR_DEPOSIT"],
    createdFrom: kstDayStartIso(nowMs),
  };
}
