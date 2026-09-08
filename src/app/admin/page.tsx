import Link from "next/link";
import { Nav } from "../_components/Nav";
import { orderRepo } from "../api/payments/_lib/orders";
import { customRequestStore } from "@/lib/customRequest";
import { requireAdmin } from "./_lib/adminAuth";
import { todayOrdersFilter } from "./_lib/dashboard";
import styles from "./admin.module.css";

/**
 * F083 — 관리자 대시보드: /admin의 홈이 주문 목록 리다이렉트(F059)에서 카운트 오버뷰로.
 * 모든 숫자는 take 컷 없는 전량 count(F082 경로) — 타일이 곧 해당 필터 목록으로의 링크다.
 * '오늘 주문' = KST(Asia/Seoul) 오늘 00:00 이후 생성 && status ∈ PAID_FAMILY ∪ 입금대기
 * (미결제 이탈 CREATED·취소·환불 제외 — 오늘 유효하게 성립한 주문). F075 — own requireAdmin
 * so /admin itself stays existence-hidden (404) to non-admins.
 */
export default async function AdminIndexPage() {
  await requireAdmin();
  const repo = orderRepo();
  const [today, waitingDeposit, cancelQueue, inProduction, shipped, newCustom] = await Promise.all([
    repo.count(todayOrdersFilter(Date.now())),
    repo.count({ status: "WAITING_FOR_DEPOSIT" }),
    repo.count({ cancelRequested: true }),
    repo.count({ status: "IN_PRODUCTION" }),
    repo.count({ status: "SHIPPED" }),
    customRequestStore.count({ status: "SUBMITTED" }),
  ]);

  const tiles: { key: string; label: string; count: number; href: string }[] = [
    { key: "today", label: "오늘 주문", count: today, href: "/admin/orders" },
    { key: "waiting-deposit", label: "입금 대기", count: waitingDeposit, href: "/admin/orders?status=WAITING_FOR_DEPOSIT" },
    { key: "cancel-queue", label: "취소요청 처리 대기", count: cancelQueue, href: "/admin/orders?queue=cancel-requested" },
    { key: "in-production", label: "제작중", count: inProduction, href: "/admin/orders?status=IN_PRODUCTION" },
    { key: "shipped", label: "배송중", count: shipped, href: "/admin/orders?status=SHIPPED" },
    { key: "new-custom", label: "신규 맞춤 의뢰", count: newCustom, href: "/admin/custom?status=SUBMITTED" },
  ];

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="admin-dash-title">
          <p className="eyebrow eyebrow--ko">관리자</p>
          <h1 className="hero__title" id="admin-dash-title">운영 현황</h1>
        </section>
        <section className={styles.panel} aria-label="운영 카운트">
          <ul className={styles.list} role="list" data-testid="admin-dashboard">
            {tiles.map((t) => (
              <li key={t.key} className={styles.rowItem} data-testid={`admin-dash-${t.key}`}>
                <Link href={t.href} className={styles.rowLink}>
                  <span className={styles.rowTitle}>{t.label}</span>
                  <span className={styles.rowAmount}>
                    <span data-testid={`admin-dash-${t.key}-count`}>{t.count}</span>건
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className={styles.note}>
            숫자는 전량 집계입니다. 상태·큐 타일은 해당 필터가 적용된 목록으로, 오늘 주문(집계 전용)은
            전체 주문 목록으로 이동합니다. · <Link href="/admin/audit">감사 로그</Link> ·{" "}
            <Link href="/admin/analytics" data-testid="admin-link-analytics">전환 지표</Link>
          </p>
        </section>
      </main>
    </>
  );
}
