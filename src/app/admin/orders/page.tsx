import Link from "next/link";
import { Nav } from "../../_components/Nav";
import { Footer } from "../../_components/Footer";
import { formatWon } from "../../_components/order/format";
import { orderRepo, type OrderStatus } from "../../api/payments/_lib/orders";
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from "../../api/payments/_lib/status";
import styles from "../admin.module.css";

/**
 * F059 — 관리자 주문 목록: 최신순 50건, 상태 필터. PII(구매자명)는 화면 렌더만 — 어떤 admin
 * 코드 경로도 로그/트레이스에 남기지 않는다(E3). 게이트는 admin/layout.tsx(+상세/액션 재검증).
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = ORDER_STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : undefined;
  const orders = await orderRepo().listRecent({ status: filter, take: 50 });

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="admin-orders-title">
          <p className="eyebrow eyebrow--ko">관리자</p>
          <h1 className="hero__title" id="admin-orders-title">주문 관리</h1>
        </section>
        <section className={styles.panel} aria-label="주문 목록">
          <ul className={styles.filters} data-testid="admin-status-filters">
            <li>
              <Link
                href="/admin/orders"
                className={`${styles.filterLink} ${!filter ? styles.filterActive : ""}`}
              >
                전체
              </Link>
            </li>
            {ORDER_STATUSES.map((s) => (
              <li key={s}>
                <Link
                  href={`/admin/orders?status=${s}`}
                  className={`${styles.filterLink} ${filter === s ? styles.filterActive : ""}`}
                  data-testid={`admin-filter-${s}`}
                >
                  {ORDER_STATUS_LABEL[s]}
                </Link>
              </li>
            ))}
          </ul>
          {orders.length === 0 ? (
            <p className={styles.empty} data-testid="admin-orders-empty">해당 상태의 주문이 없습니다.</p>
          ) : (
            <ul className={styles.list} role="list" data-testid="admin-orders">
              {orders.map((order) => (
                <li key={order.id} className={styles.rowItem} data-testid="admin-order-row">
                  <Link href={`/admin/orders/${order.id}`} className={styles.rowLink} data-testid="admin-order-link">
                    <span className={styles.rowTitle}>
                      {order.kind === "CUSTOM" ? "[맞춤] " : ""}
                      {order.orderName} · {order.buyerName}
                    </span>
                    <span className={styles.rowStatus}>{ORDER_STATUS_LABEL[order.status]}</span>
                    <span className={styles.rowMeta}>
                      {order.createdAt.slice(0, 10)} · {order.id}
                    </span>
                    <span className={styles.rowAmount}>{formatWon(order.amountWon)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
