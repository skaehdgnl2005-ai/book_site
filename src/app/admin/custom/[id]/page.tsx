import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "../../../_components/Nav";
import { formatWon } from "../../../_components/order/format";
import {
  customRequestStore,
  CUSTOM_FORM_GROUPS,
  CUSTOM_STATUS_LABEL,
  CONSULTATION_STATUS_LABEL,
} from "@/lib/customRequest";
import { CustomAdminPanel } from "./CustomAdminPanel";
import { requireAdmin } from "../../_lib/adminAuth";
import styles from "../../admin.module.css";

/**
 * F061 — 의뢰 상세: 연락처(PII — 렌더만, E3) + 6묶음 의뢰서(CUSTOM_FORM_GROUPS 재사용) +
 * 상태 이동 + 상담 확정(requireApproval 게이트). 게이트는 admin/layout.tsx + 액션 재검증.
 */
export default async function AdminCustomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); // F075 — own gate, not just the layout (defense in depth on a PII-heavy page)
  const { id } = await params;
  const rec = await customRequestStore.get(id);
  if (!rec) notFound();

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="admin-custom-title">
          <p className="eyebrow eyebrow--ko">관리자 · 맞춤 의뢰</p>
          <h1 className="hero__title" id="admin-custom-title">{rec.id}</h1>
        </section>
        <section className={styles.panel} aria-label="의뢰 정보">
          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt className={styles.dt}>상태</dt>
              <dd className={styles.dd} data-testid="admin-custom-status">{CUSTOM_STATUS_LABEL[rec.status]}</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>경로</dt>
              <dd className={styles.dd}>{rec.path === "PHONE" ? "전화 상담" : "직접 작성"}</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>의뢰인</dt>
              <dd className={styles.dd} data-testid="admin-custom-contact">
                {rec.contactName} · {rec.contactPhone}
                {rec.contactEmail ? ` · ${rec.contactEmail}` : ""}
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>금액</dt>
              <dd className={styles.dd}>{formatWon(rec.amountWon)}</dd>
            </div>
            {rec.orderId ? (
              <div className={styles.row}>
                <dt className={styles.dt}>결제 주문</dt>
                <dd className={styles.dd}>
                  <Link href={`/admin/orders/${rec.orderId}`} data-testid="admin-custom-order-link">
                    {rec.orderId}
                  </Link>
                </dd>
              </div>
            ) : null}
            {rec.consultation ? (
              <div className={styles.row}>
                <dt className={styles.dt}>상담</dt>
                <dd className={styles.dd} data-testid="admin-custom-consultation">
                  {rec.consultation.requestedSlot.replace("T", " ")} ·{" "}
                  {CONSULTATION_STATUS_LABEL[rec.consultation.status]}
                  {rec.consultation.note ? ` · ${rec.consultation.note}` : ""}
                </dd>
              </div>
            ) : null}
          </dl>

          <CustomAdminPanel
            id={rec.id}
            status={rec.status}
            consultationStatus={rec.consultation?.status ?? null}
          />

          <dl className={styles.rows} data-testid="admin-custom-form">
            {CUSTOM_FORM_GROUPS.map((g) =>
              g.fields
                .map((f) => ({ field: f, value: rec.form.groups[g.key]?.[f.key] ?? "" }))
                .filter(({ value }) => value !== "")
                .map(({ field, value }) => (
                  <div key={`${g.key}.${field.key}`} className={styles.row}>
                    <dt className={styles.dt}>
                      {g.title} · {field.label}
                    </dt>
                    <dd className={styles.dd}>{value}</dd>
                  </div>
                )),
            )}
          </dl>

          <p className={styles.note}>
            <Link href="/admin/custom">← 의뢰 목록으로</Link>
          </p>
        </section>
      </main>
    </>
  );
}
