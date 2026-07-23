import { Nav } from "../../_components/Nav";
import { requireAdmin } from "../_lib/adminAuth";
import { auditStore, type AuditAction } from "../_lib/auditLog";
import styles from "../admin.module.css";

/**
 * F073 — 관리자 감사 로그 열람. 레이아웃 게이트에 더해 페이지 자체가 requireAdmin()을 재검증한다
 * (심층 방어; F075가 이를 머신 규칙으로 강제 예정). 표시 항목은 행위자 식별자·액션·대상·전후 상태뿐 —
 * 구매자 이름/이메일/주소 등 PII는 저장도 표시도 하지 않는다(ADR-0024 D2).
 */
const ACTION_LABEL: Record<AuditAction, string> = {
  "order.advance": "주문 전이",
  "order.refund": "주문 환불",
  "custom.move": "맞춤 전이",
  "consultation.confirm": "상담 확정",
  "order.close_unpaid_va": "미입금 종료", // F078 — 기한 만료 가상계좌 종료(승인 토큰 게이트)
  "order.late_deposit": "뒤늦은 입금 감지", // F078 — 종료 후 입금(웹훅 발신) → RUNBOOK_VA 환불 절차
};

export default async function AdminAuditPage() {
  await requireAdmin();
  const entries = await auditStore().listRecent({ take: 100 });

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="admin-audit-title">
          <p className="eyebrow eyebrow--ko">관리자</p>
          <h1 className="hero__title" id="admin-audit-title">감사 로그</h1>
        </section>
        <section className={styles.panel} aria-label="관리자 감사 로그">
          <p className={styles.note}>
            관리자 변이(주문·맞춤 상태 전이, 환불, 상담 확정) 기록입니다. 행위자 식별자와 상태값만 남으며,
            구매자 개인정보는 기록되지 않습니다.
          </p>
          {entries.length === 0 ? (
            <p className={styles.empty} data-testid="admin-audit-empty">감사 기록이 없습니다.</p>
          ) : (
            <ul className={styles.list} role="list" data-testid="admin-audit">
              {entries.map((e) => (
                <li key={e.id} className={styles.rowItem} data-testid="admin-audit-row">
                  <div className={styles.rowLink}>
                    <span className={styles.rowTitle}>
                      {ACTION_LABEL[e.action] ?? e.action} · {e.targetType}/{e.targetId}
                    </span>
                    <span className={styles.rowStatus} data-testid="admin-audit-transition">
                      {e.before ?? "—"} → {e.after ?? "—"}
                    </span>
                    <span className={styles.rowMeta}>
                      {e.createdAt.slice(0, 19).replace("T", " ")} ·{" "}
                      {e.actorUserId === "system" ? "시스템" : `관리자 ${e.actorUserId}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
