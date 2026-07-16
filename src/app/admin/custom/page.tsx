import Link from "next/link";
import { Nav } from "../../_components/Nav";
import {
  customRequestStore,
  CUSTOM_STATUS_LABEL,
  type CustomPath,
  type CustomStatus,
} from "@/lib/customRequest";
import styles from "../admin.module.css";

const PATHS: readonly CustomPath[] = ["PHONE", "WRITTEN"];
const PATH_LABEL: Record<CustomPath, string> = { PHONE: "전화 상담", WRITTEN: "직접 작성" };
const STATUSES = Object.keys(CUSTOM_STATUS_LABEL) as CustomStatus[];

/**
 * F061 — 관리자 맞춤 의뢰 목록: 최신순 50, 경로/상태 필터. 연락처 PII는 렌더만(E3).
 * 게이트는 admin/layout.tsx (+ 액션 재검증).
 */
export default async function AdminCustomPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const path = PATHS.includes(sp.path as CustomPath) ? (sp.path as CustomPath) : undefined;
  const status = STATUSES.includes(sp.status as CustomStatus) ? (sp.status as CustomStatus) : undefined;
  const requests = await customRequestStore.list({ path, status, take: 50 });

  const filterHref = (p?: CustomPath, s?: CustomStatus) => {
    const q = new URLSearchParams();
    if (p) q.set("path", p);
    if (s) q.set("status", s);
    const qs = q.toString();
    return `/admin/custom${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="admin-custom-title">
          <p className="eyebrow eyebrow--ko">관리자</p>
          <h1 className="hero__title" id="admin-custom-title">맞춤 제작 의뢰</h1>
        </section>
        <section className={styles.panel} aria-label="의뢰 목록">
          <ul className={styles.filters} aria-label="경로 필터">
            <li>
              <Link href={filterHref(undefined, status)} className={`${styles.filterLink} ${!path ? styles.filterActive : ""}`}>
                전체 경로
              </Link>
            </li>
            {PATHS.map((p) => (
              <li key={p}>
                <Link
                  href={filterHref(p, status)}
                  className={`${styles.filterLink} ${path === p ? styles.filterActive : ""}`}
                  data-testid={`custom-filter-${p}`}
                >
                  {PATH_LABEL[p]}
                </Link>
              </li>
            ))}
          </ul>
          <ul className={styles.filters} aria-label="상태 필터">
            <li>
              <Link href={filterHref(path, undefined)} className={`${styles.filterLink} ${!status ? styles.filterActive : ""}`}>
                전체 상태
              </Link>
            </li>
            {STATUSES.map((s) => (
              <li key={s}>
                <Link
                  href={filterHref(path, s)}
                  className={`${styles.filterLink} ${status === s ? styles.filterActive : ""}`}
                  data-testid={`custom-filter-${s}`}
                >
                  {CUSTOM_STATUS_LABEL[s]}
                </Link>
              </li>
            ))}
          </ul>
          {requests.length === 0 ? (
            <p className={styles.empty} data-testid="admin-custom-empty">해당 조건의 의뢰가 없습니다.</p>
          ) : (
            <ul className={styles.list} role="list" data-testid="admin-custom-list">
              {requests.map((rec) => (
                <li key={rec.id} className={styles.rowItem} data-testid="admin-custom-row">
                  <Link href={`/admin/custom/${rec.id}`} className={styles.rowLink} data-testid="admin-custom-link">
                    <span className={styles.rowTitle}>
                      [{PATH_LABEL[rec.path]}] {rec.contactName}
                    </span>
                    <span className={styles.rowStatus}>{CUSTOM_STATUS_LABEL[rec.status]}</span>
                    <span className={styles.rowMeta}>
                      {rec.createdAt.slice(0, 10)} · {rec.id}
                    </span>
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
