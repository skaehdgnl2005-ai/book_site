import { formatWon, formatKstDateTime } from "./format";
import styles from "./DepositNotice.module.css";

/**
 * F070 — 가상계좌 입금 안내. Shared across every order-detail surface (guest /orders/[id],
 * OTP-gated /mypage, member /account) so the deposit account + due date + cash-receipt copy are
 * defined once (worker≠checker: avoid the per-page duplication). Rendered only while the order is
 * WAITING_FOR_DEPOSIT. The virtual account is a per-order, Toss-issued temporary account (not the
 * buyer's own) — it is order-transactional data, not buyer PII.
 */
export function DepositNotice({
  bank,
  account,
  amountWon,
  dueDate,
}: {
  bank?: string;
  account?: string;
  amountWon: number;
  dueDate?: string;
}) {
  return (
    <div className={styles.deposit} data-testid="order-deposit">
      <p className={styles.title}>아래 계좌로 입금해 주세요</p>
      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt className={styles.dt}>입금 은행</dt>
          <dd className={styles.dd} data-testid="order-deposit-bank">{bank ?? "-"}</dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.dt}>입금 계좌</dt>
          <dd className={styles.dd} data-testid="order-deposit-account">{account ?? "-"}</dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.dt}>입금 금액</dt>
          <dd className={styles.dd}>{formatWon(amountWon)}</dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.dt}>입금 기한</dt>
          <dd className={styles.dd} data-testid="order-deposit-due">
            {dueDate ? formatKstDateTime(dueDate) : "-"}
          </dd>
        </div>
      </dl>
      <p className={styles.note}>
        입금이 확인되면 제작이 시작되고 마이페이지에서 마무리(사진·헌정 문구)를 이어갈 수 있어요. 입금
        기한이 지나면 주문은 자동으로 취소됩니다. 현금영수증은 결제 시 입력하신 정보로 입금 확인 후
        발급됩니다. (테스트 결제 — 실제 청구는 일어나지 않습니다)
      </p>
    </div>
  );
}
