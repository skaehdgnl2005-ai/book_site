import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "../_components/Nav";
import { Footer } from "../_components/Footer";
import { formatWon } from "../_components/order/format";
import { orderRepo } from "../api/payments/_lib/orders";
import { ORDER_STATUS_LABEL } from "../api/payments/_lib/status";
import { getSessionUser } from "./_lib/sessionUser";
import { logout, logoutAllDevices } from "./_lib/actions";
import styles from "./account.module.css";

export const dynamic = "force-dynamic"; // session cookie decides the render
export const metadata: Metadata = {
  title: "내 계정 · 그림책 제작소",
  robots: { index: false, follow: false },
};

/**
 * F056/F057 — 내 계정. Server component: getSessionUser() (HMAC + expiry + live epoch) gates
 * the render; signed-out visitors get a login CTA (no PII, no oracle). 내 주문 = 로그인 결제
 * 즉시 연결 + 게스트 주문의 이메일 소유 증명 시 소급 연결(claim)분.
 */
export default async function AccountPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <>
        <Nav />
        <main>
          <section className="hero" aria-labelledby="account-title">
            <p className="eyebrow eyebrow--ko">계정</p>
            <h1 className="hero__title" id="account-title">로그인이 필요해요</h1>
            <p className="hero__sub">이메일 인증 코드 한 번이면 로그인(첫 방문이면 가입)됩니다.</p>
          </section>
          <section className={styles.panel} aria-label="로그인 안내">
            <Link className="cta" href="/login" data-testid="account-login-cta">
              이메일로 로그인
            </Link>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  const orders = await orderRepo().listByUser(user.id);

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="account-title">
          <p className="eyebrow eyebrow--ko">계정</p>
          <h1 className="hero__title" id="account-title">내 계정</h1>
        </section>
        <section className={styles.panel} aria-label="계정 정보">
          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt className={styles.dt}>이메일</dt>
              <dd className={styles.dd} data-testid="account-email">
                {user.email ?? "이메일 미등록 (카카오 로그인)"}
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>가입일</dt>
              <dd className={styles.dd}>{user.createdAt.slice(0, 10)}</dd>
            </div>
          </dl>
          <div className={styles.actions}>
            <form action={logout}>
              <button type="submit" className="cta" data-testid="account-logout">
                로그아웃
              </button>
            </form>
            <form action={logoutAllDevices}>
              <button type="submit" className={styles.quiet} data-testid="account-logout-all">
                모든 기기에서 로그아웃
              </button>
            </form>
          </div>
        </section>
        <section className={styles.panel} aria-labelledby="account-orders-title">
          <h2 className={styles.sectionTitle} id="account-orders-title">내 주문</h2>
          {orders.length === 0 ? (
            <p className={styles.note} data-testid="account-orders-empty">
              아직 연결된 주문이 없어요. 이 이메일로 결제한 주문은 로그인하면 자동으로 연결됩니다.
            </p>
          ) : (
            <ul className={styles.orderList} role="list" data-testid="account-orders">
              {orders.map((order) => (
                <li key={order.id} className={styles.orderRow} data-testid="account-order-row">
                  <Link
                    href={`/account/orders/${order.id}`}
                    className={styles.orderLink}
                    data-testid="account-order-link"
                  >
                    <span className={styles.orderName}>{order.orderName}</span>
                    <span className={styles.orderMeta}>
                      {order.createdAt.slice(0, 10)} · {order.id}
                    </span>
                    <span className={styles.orderStatus}>{ORDER_STATUS_LABEL[order.status]}</span>
                    <span className={styles.orderAmount}>{formatWon(order.amountWon)}</span>
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
