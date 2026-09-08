import Link from "next/link";
import { Nav } from "../../_components/Nav";
import { analyticsStore, type EventMatch } from "../../api/events/_lib/analytics";
import { CTA_NAMES, SCROLL_DEPTHS } from "../../api/events/_lib/eventVocab";
import { requireAdmin } from "../_lib/adminAuth";
import { buildQuery } from "../orders/_lib/query";
import { resolvePeriod, PERIOD_PRESETS } from "../orders/_lib/period";
import { FUNNEL_STEPS, pctLabel } from "./_lib/funnel";
import styles from "../admin.module.css";

/**
 * F092 — 관리자 전환 지표. 구매 퍼널의 단계별 고유 세션 수(원시 클릭 수 아님)와 전환율,
 * CTA별 클릭, 페이지별 스크롤 도달을 표로 렌더한다. 모든 숫자는 take 컷 없는 전량 집계
 * (F082 정직성). 기간은 F089의 resolvePeriod를 그대로 재사용(KST 프리셋 + from/to).
 * 이벤트에 PII가 없으므로 이 페이지는 PII를 다루지 않는다. 게이트: own requireAdmin(R13).
 */

const CTA_LABEL: Record<string, string> = {
  home_hero: "홈 히어로 '내 아이의 책 만들기'",
  template_card: "템플릿 카드 선택",
  order_next: "주문 위저드 '다음'",
  order_add_to_cart: "'장바구니에 담기'",
  cart_checkout: "장바구니 '결제하기'",
  checkout_pay: "결제 페이지 '결제하기'",
};

const SCROLL_TARGETS: { key: string; label: string; match: EventMatch }[] = [
  { key: "home", label: "홈 /", match: { kind: "scroll", path: "/" } },
  { key: "anniversary", label: "기념일 /anniversary", match: { kind: "scroll", path: "/anniversary" } },
  { key: "first-moments", label: "첫 순간들 /first-moments", match: { kind: "scroll", path: "/first-moments" } },
  { key: "order", label: "주문 위저드 /order/*", match: { kind: "scroll", pathPrefix: "/order/" } },
  { key: "cart", label: "장바구니 /cart", match: { kind: "scroll", path: "/cart" } },
  { key: "checkout", label: "결제 /checkout", match: { kind: "scroll", path: "/checkout" } },
];

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  await requireAdmin(); // F075/R13 — own gate, not just the layout
  const params = await searchParams;
  const period = resolvePeriod(params, Date.now());
  const store = analyticsStore();

  const [funnel, ctas, scroll, totalViews, totalSessions] = await Promise.all([
    Promise.all(
      FUNNEL_STEPS.map(async (s) => ({
        key: s.key,
        label: s.label,
        sessions: await store.countSessions({ ...s.match, ...period }),
      })),
    ),
    Promise.all(
      CTA_NAMES.map(async (name) => ({
        name,
        clicks: await store.countEvents({ kind: "cta_click", name, ...period }),
        sessions: await store.countSessions({ kind: "cta_click", name, ...period }),
      })),
    ),
    Promise.all(
      SCROLL_TARGETS.map(async (t) => ({
        key: t.key,
        label: t.label,
        reached: await Promise.all(
          SCROLL_DEPTHS.map((depth) => store.countSessions({ ...t.match, value: depth, ...period })),
        ),
      })),
    ),
    store.countEvents({ kind: "page_view", ...period }),
    store.countSessions({ kind: "page_view", ...period }),
  ]);
  const first = funnel[0]?.sessions ?? 0;

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="admin-analytics-title">
          <p className="eyebrow eyebrow--ko">관리자</p>
          <h1 className="hero__title" id="admin-analytics-title">전환 지표</h1>
        </section>
        <section className={styles.panel} aria-label="전환 지표">
          <ul className={styles.filters} data-testid="admin-analytics-presets">
            <li>
              <Link
                href="/admin/analytics"
                className={`${styles.filterLink} ${!params.range && !params.from && !params.to ? styles.filterActive : ""}`}
              >
                전체 기간
              </Link>
            </li>
            {PERIOD_PRESETS.map((p) => (
              <li key={p.key}>
                <Link
                  href={`/admin/analytics${buildQuery({ range: p.key })}`}
                  className={`${styles.filterLink} ${params.range === p.key ? styles.filterActive : ""}`}
                  data-testid={`admin-analytics-range-${p.key}`}
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
          <form method="get" action="/admin/analytics" className={styles.toolbar} data-testid="admin-analytics-period-form">
            <label className={styles.toolLabel}>
              시작일
              <input type="date" name="from" defaultValue={params.from ?? ""} className={styles.moveInput} />
            </label>
            <label className={styles.toolLabel}>
              종료일
              <input type="date" name="to" defaultValue={params.to ?? ""} className={styles.moveInput} />
            </label>
            <button type="submit" className={styles.toolButton}>적용</button>
          </form>

          <p className={styles.summary} data-testid="admin-analytics-summary">
            페이지뷰 {totalViews}건 · 방문 세션 {totalSessions}개
          </p>

          <h2 className={styles.sectionTitle}>구매 퍼널 (단계별 고유 세션)</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="admin-analytics-funnel">
              <thead>
                <tr>
                  <th scope="col" className={styles.th}>단계</th>
                  <th scope="col" className={`${styles.th} ${styles.thAmount}`}>세션</th>
                  <th scope="col" className={`${styles.th} ${styles.thAmount}`}>이전 대비</th>
                  <th scope="col" className={`${styles.th} ${styles.thAmount}`}>홈 대비</th>
                </tr>
              </thead>
              <tbody>
                {funnel.map((s, i) => (
                  <tr key={s.key} className={styles.tr} data-testid={`admin-analytics-funnel-${s.key}`}>
                    <td className={styles.tdMain}>{s.label}</td>
                    <td className={styles.tdAmount} data-testid={`admin-analytics-funnel-${s.key}-sessions`}>
                      {s.sessions}
                    </td>
                    <td className={styles.tdAmount}>{i === 0 ? "–" : pctLabel(s.sessions, funnel[i - 1].sessions)}</td>
                    <td className={styles.tdAmount}>{i === 0 ? "–" : pctLabel(s.sessions, first)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className={styles.sectionTitle}>CTA 클릭</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="admin-analytics-ctas">
              <thead>
                <tr>
                  <th scope="col" className={styles.th}>CTA</th>
                  <th scope="col" className={`${styles.th} ${styles.thAmount}`}>클릭</th>
                  <th scope="col" className={`${styles.th} ${styles.thAmount}`}>세션</th>
                </tr>
              </thead>
              <tbody>
                {ctas.map((c) => (
                  <tr key={c.name} className={styles.tr} data-testid={`admin-analytics-cta-${c.name}`}>
                    <td className={styles.tdMain}>{CTA_LABEL[c.name] ?? c.name}</td>
                    <td className={styles.tdAmount} data-testid={`admin-analytics-cta-${c.name}-clicks`}>{c.clicks}</td>
                    <td className={styles.tdAmount}>{c.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className={styles.sectionTitle}>스크롤 도달 (고유 세션)</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="admin-analytics-scroll">
              <thead>
                <tr>
                  <th scope="col" className={styles.th}>페이지</th>
                  {SCROLL_DEPTHS.map((d) => (
                    <th key={d} scope="col" className={`${styles.th} ${styles.thAmount}`}>{d}%</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scroll.map((row) => (
                  <tr key={row.key} className={styles.tr} data-testid={`admin-analytics-scroll-${row.key}`}>
                    <td className={styles.tdMain}>{row.label}</td>
                    {row.reached.map((n, i) => (
                      <td
                        key={SCROLL_DEPTHS[i]}
                        className={styles.tdAmount}
                        data-testid={`admin-analytics-scroll-${row.key}-${SCROLL_DEPTHS[i]}`}
                      >
                        {n}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={styles.note}>
            숫자는 기간 필터의 전량 집계입니다. 퍼널 단계는 독립 계측이라(뒤 단계 직접 진입 포함)
            엄격한 순차 이탈률이 아닌 도달 세션 수입니다. '결제 승인'은 성공 착지 기준이라
            가상계좌 미입금 주문을 포함합니다 — 정산 확정 수는 주문 관리의 상태 필터를 보세요.
            스크롤 100%는 뷰포트보다 짧은 페이지의 즉시 도달을 포함합니다. 이벤트는 익명 세션
            단위로 PII를 담지 않습니다.
          </p>
        </section>
      </main>
    </>
  );
}
