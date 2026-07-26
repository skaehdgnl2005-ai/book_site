import Link from "next/link";
import { Nav } from "../../_components/Nav";
import { formatWon, formatKstDate } from "../../_components/order/format";
import { orderRepo, type OrderStatus } from "../../api/payments/_lib/orders";
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from "../../api/payments/_lib/status";
import { requireAdmin } from "../_lib/adminAuth";
import { buildQuery, parsePage } from "./_lib/query";
import { resolvePeriod, PERIOD_PRESETS } from "./_lib/period";
import styles from "../admin.module.css";

const PAGE_SIZE = 50;

/**
 * F059 — 관리자 주문 목록. PII(구매자명)는 화면 렌더만 — 어떤 admin 코드 경로도 로그/트레이스에
 * 남기지 않는다(E3). 게이트는 admin/layout.tsx(+자체 requireAdmin, F075/R13).
 * F082 — 취소요청 큐 필터(?queue=cancel-requested). 배지 숫자는 take 컷과 분리된 전량 count.
 * F088 — 테이블 렌더 + 오프셋 페이지네이션(page=N): 최신 50건 컷을 페이지로 교체(F082 컷
 * 안내문 대체 — 전량이 페이지로 도달 가능). totalPages는 take 없는 count 전량 기반.
 * F089 — KST 기간 필터(프리셋 range=/직접 from·to) + 합계줄: 건수·합계는 현재 필터의 전량
 * (count/sumAmount는 no-take) — 50행 슬라이스의 합을 총액처럼 보이지 않게 한다.
 * F090 — 검색(q): 주문번호 정확 일치 OR 구매자명/이메일 부분 일치, 기존 필터와 교집합.
 * q는 URL에 실리지만 앱 로그/트레이스에는 남기지 않는다(E3; 인프라 요청 로그 한계는 스펙 §PII).
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    queue?: string;
    page?: string;
    range?: string;
    from?: string;
    to?: string;
    q?: string;
  }>;
}) {
  await requireAdmin(); // F075 — own gate, not just the layout (defense in depth)
  const params = await searchParams;
  const cancelQueue = params.queue === "cancel-requested";
  const filter =
    !cancelQueue && ORDER_STATUSES.includes(params.status as OrderStatus)
      ? (params.status as OrderStatus)
      : undefined;
  const page = parsePage(params.page);
  const period = resolvePeriod(params, Date.now());
  const q = params.q?.trim() || undefined;
  const listFilter = {
    ...(cancelQueue ? { cancelRequested: true as const } : { status: filter }),
    ...period,
    ...(q ? { search: q } : {}),
  };
  const repo = orderRepo();
  const [orders, total, sum, cancelQueueCount] = await Promise.all([
    repo.listRecent({ ...listFilter, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    repo.count(listFilter),
    repo.sumAmount(listFilter), // 합계줄 — 필터 전량 (take 컷 아님)
    repo.count({ cancelRequested: true }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 페이지 링크가 보존해야 하는 현재 필터 (값 없는 키는 buildQuery가 떨군다)
  const keep: Record<string, string | undefined> = {
    status: filter,
    queue: cancelQueue ? "cancel-requested" : undefined,
    range: params.range,
    from: params.from,
    to: params.to,
    q,
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
          <ul className={styles.filters} data-testid="admin-period-presets">
            <li>
              <Link
                href={`/admin/orders${buildQuery({ status: filter, queue: keep.queue })}`}
                className={`${styles.filterLink} ${!params.range && !params.from && !params.to ? styles.filterActive : ""}`}
              >
                전체 기간
              </Link>
            </li>
            {PERIOD_PRESETS.map((p) => (
              <li key={p.key}>
                <Link
                  href={`/admin/orders${buildQuery({ status: filter, queue: keep.queue, range: p.key })}`}
                  className={`${styles.filterLink} ${params.range === p.key ? styles.filterActive : ""}`}
                  data-testid={`admin-range-${p.key}`}
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
          <form method="get" action="/admin/orders" className={styles.toolbar} data-testid="admin-period-form">
            {filter ? <input type="hidden" name="status" value={filter} /> : null}
            {cancelQueue ? <input type="hidden" name="queue" value="cancel-requested" /> : null}
            {/* F090 — 폼이 기간·검색을 함께 제출하므로, range 활성 중 검색해도 range를 잃지 않는다 */}
            {params.range ? <input type="hidden" name="range" value={params.range} /> : null}
            <label className={styles.toolLabel}>
              시작일
              <input type="date" name="from" defaultValue={params.from ?? ""} className={styles.moveInput} />
            </label>
            <label className={styles.toolLabel}>
              종료일
              <input type="date" name="to" defaultValue={params.to ?? ""} className={styles.moveInput} />
            </label>
            <label className={styles.toolLabel}>
              검색
              <input
                type="search"
                name="q"
                defaultValue={q ?? ""}
                placeholder="주문번호·구매자명·이메일"
                className={styles.moveInput}
                data-testid="admin-search-input"
              />
            </label>
            <button type="submit" className={styles.toolButton} data-testid="admin-search-submit">적용</button>
          </form>
          <p className={styles.summary} data-testid="admin-orders-summary">
            총 {total}건 · {formatWon(sum)}
          </p>
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
