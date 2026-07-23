import Link from "next/link";
import { Nav } from "../../_components/Nav";
import { formatWon } from "../../_components/order/format";
import { orderRepo, type OrderStatus } from "../../api/payments/_lib/orders";
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from "../../api/payments/_lib/status";
import { requireAdmin } from "../_lib/adminAuth";
import styles from "../admin.module.css";

/**
 * F059 — 관리자 주문 목록: 최신순 50건, 상태 필터. PII(구매자명)는 화면 렌더만 — 어떤 admin
 * 코드 경로도 로그/트레이스에 남기지 않는다(E3). 게이트는 admin/layout.tsx(+상세/액션 재검증).
 * F082 — 취소요청 큐 필터(?queue=cancel-requested): 처리 대기(요청 접수 + 아직 환불 가능) 건만.
 * 배지 숫자는 take 50 컷과 분리된 repo.count 전량 — 오래된 요청이 목록에서 밀려나도 정직하다.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; queue?: string }>;
}) {
  await requireAdmin(); // F075 — own gate, not just the layout (defense in depth)
  const { status, queue } = await searchParams;
  const cancelQueue = queue === "cancel-requested";
  const filter =
    !cancelQueue && ORDER_STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : undefined;
  const repo = orderRepo();
  const [orders, cancelQueueCount] = await Promise.all([
    repo.listRecent(cancelQueue ? { cancelRequested: true, take: 50 } : { status: filter, take: 50 }),
    repo.count({ cancelRequested: true }),
  ]);

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
                className={`${styles.filterLink} ${!filter && !cancelQueue ? styles.filterActive : ""}`}
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
            <li>
              <Link
                href="/admin/orders?queue=cancel-requested"
                className={`${styles.filterLink} ${cancelQueue ? styles.filterActive : ""}`}
                data-testid="admin-filter-cancel-requested"
              >
                취소요청 (<span data-testid="admin-cancel-queue-count">{cancelQueueCount}</span>)
              </Link>
            </li>
          </ul>
          {cancelQueue && cancelQueueCount > orders.length ? (
            // 50건 초과 시 목록도 최신순 컷을 받는다 — 배지(전량)와의 괴리를 숨기지 않는다.
            <p className={styles.note} data-testid="admin-queue-cut-note">
              처리 대기 {cancelQueueCount}건 중 최신 {orders.length}건을 표시합니다.
            </p>
          ) : null}
          {orders.length === 0 ? (
            <p className={styles.empty} data-testid="admin-orders-empty">
              {cancelQueue ? "처리 대기 중인 취소요청이 없습니다." : "해당 상태의 주문이 없습니다."}
            </p>
          ) : (
            <ul className={styles.list} role="list" data-testid="admin-orders">
              {orders.map((order) => (
                <li key={order.id} className={styles.rowItem} data-testid="admin-order-row">
                  <Link href={`/admin/orders/${order.id}`} className={styles.rowLink} data-testid="admin-order-link">
                    <span className={styles.rowTitle}>
                      {order.kind === "CUSTOM" ? "[맞춤] " : ""}
                      {order.orderName} · {order.buyerName}
                    </span>
                    <span className={styles.rowStatus}>
                      {order.cancelRequestedAt ? (
                        <span data-testid="admin-cancel-badge">취소요청 · </span>
                      ) : null}
                      {ORDER_STATUS_LABEL[order.status]}
                    </span>
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
    </>
  );
}
