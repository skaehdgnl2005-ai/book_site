import Link from "next/link";
import { Nav } from "../../_components/Nav";
import { formatWon, formatKstDate } from "../../_components/order/format";
import { orderRepo, type OrderStatus } from "../../api/payments/_lib/orders";
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from "../../api/payments/_lib/status";
import { requireAdmin } from "../_lib/adminAuth";
import { buildQuery, parsePage } from "./_lib/query";
import styles from "../admin.module.css";

const PAGE_SIZE = 50;

/**
 * F059 — 관리자 주문 목록. PII(구매자명)는 화면 렌더만 — 어떤 admin 코드 경로도 로그/트레이스에
 * 남기지 않는다(E3). 게이트는 admin/layout.tsx(+자체 requireAdmin, F075/R13).
 * F082 — 취소요청 큐 필터(?queue=cancel-requested). 배지 숫자는 take 컷과 분리된 전량 count.
 * F088 — 테이블 렌더 + 오프셋 페이지네이션(page=N): 최신 50건 컷을 페이지로 교체(F082 컷
 * 안내문 대체 — 전량이 페이지로 도달 가능). totalPages는 take 없는 count 전량 기반.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; queue?: string; page?: string }>;
}) {
  await requireAdmin(); // F075 — own gate, not just the layout (defense in depth)
  const params = await searchParams;
  const cancelQueue = params.queue === "cancel-requested";
  const filter =
    !cancelQueue && ORDER_STATUSES.includes(params.status as OrderStatus)
      ? (params.status as OrderStatus)
      : undefined;
  const page = parsePage(params.page);
  const listFilter = cancelQueue ? { cancelRequested: true as const } : { status: filter };
  const repo = orderRepo();
  const [orders, total, cancelQueueCount] = await Promise.all([
    repo.listRecent({ ...listFilter, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    repo.count(listFilter),
    repo.count({ cancelRequested: true }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 페이지 링크가 보존해야 하는 현재 필터 (값 없는 키는 buildQuery가 떨군다)
  const keep: Record<string, string | undefined> = {
    status: filter,
    queue: cancelQueue ? "cancel-requested" : undefined,
  };

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
          {orders.length === 0 ? (
            <p className={styles.empty} data-testid="admin-orders-empty">
              {cancelQueue ? "처리 대기 중인 취소요청이 없습니다." : "해당 상태의 주문이 없습니다."}
            </p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table} data-testid="admin-orders">
                <thead>
                  <tr>
                    <th scope="col" className={styles.th}>주문일</th>
                    <th scope="col" className={styles.th}>주문</th>
                    <th scope="col" className={styles.th}>상태</th>
                    <th scope="col" className={`${styles.th} ${styles.thAmount}`}>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className={styles.tr} data-testid="admin-order-row">
                      <td className={styles.tdDate}>{formatKstDate(order.createdAt)}</td>
                      <td className={styles.tdMain}>
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className={styles.tableLink}
                          data-testid="admin-order-link"
                        >
                          {order.kind === "CUSTOM" ? "[맞춤] " : ""}
                          {order.orderName} · {order.buyerName}
                        </Link>
                        <span className={styles.tdId}>{order.id}</span>
                      </td>
                      <td className={styles.tdStatus}>
                        {order.cancelRequestedAt ? (
                          <span data-testid="admin-cancel-badge">취소요청 · </span>
                        ) : null}
                        {ORDER_STATUS_LABEL[order.status]}
                      </td>
                      <td className={styles.tdAmount}>{formatWon(order.amountWon)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 ? (
            <nav className={styles.pager} aria-label="페이지" data-testid="admin-orders-pager">
              {page > 1 ? (
                <Link
                  href={`/admin/orders${buildQuery({ ...keep, page: String(page - 1) })}`}
                  data-testid="admin-page-prev"
                >
                  ← 이전
                </Link>
              ) : (
                <span className={styles.pagerMuted}>← 이전</span>
              )}
              <span data-testid="admin-page-indicator">{page} / {totalPages}</span>
              {page < totalPages ? (
                <Link
                  href={`/admin/orders${buildQuery({ ...keep, page: String(page + 1) })}`}
                  data-testid="admin-page-next"
                >
                  다음 →
                </Link>
              ) : (
                <span className={styles.pagerMuted}>다음 →</span>
              )}
            </nav>
          ) : null}
        </section>
      </main>
    </>
  );
}
