import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "../_components/Nav";
import { businessInfo, PENDING_VALUE } from "../../lib/businessInfo";
import styles from "./page.module.css";

// F067 — 청약철회(취소)·환불 정책. 기준값은 전자상거래법이 정한 법정 최소치
// (17조 7일 철회, 18조 3영업일 환급·지연배상, 17조 2항 6호 주문제작 제한)이며
// 몰의 실제 레일(주문 조회 취소 요청 F062, 관리자 환불 집행 F063)과 일치하게
// 기술한다. 시행 전 사업자 최종 검토 필요(핸드오프 명기).
export const metadata: Metadata = { title: "청약철회·환불 정책 — 그림책 제작소" };

export default function RefundPolicyPage() {
  const biz = businessInfo();
  return (
    <>
      <Nav />
      <main>
        <section className="section" aria-labelledby="refund-title">
          <p className="eyebrow">Returns &amp; Refunds</p>
          <h1 id="refund-title">청약철회·환불 정책</h1>

          <article className={styles.article}>
            <div className={styles.clause}>
              <p className={styles.highlight}>
                모든 그림책은 아이의 이름과 이야기로 <strong>한 권만 새로 만드는 주문 제작
                상품</strong>입니다. 그래서 제작이 시작되기 전에는 자유롭게 취소하실 수 있지만,
                제작이 시작된 뒤에는 청약철회(취소·환불)가 제한됩니다. 이 사실은 결제 전 화면에서
                별도로 안내하고 동의를 받습니다. (전자상거래법 제17조 제2항 제6호)
              </p>
            </div>

            <div className={styles.clause}>
              <h2>1. 청약철회 기간</h2>
              <ol>
                <li>
                  상품을 받으신 날부터 <strong>7일 이내</strong>에 청약철회를 신청하실 수 있습니다
                  (전자상거래법 제17조).
                </li>
                <li>
                  다만 주문 제작 상품의 특성상, <strong>제작이 시작된 뒤에는</strong> 단순 변심에
                  의한 청약철회가 제한됩니다.
                </li>
                <li>
                  받으신 상품이 표시·광고 내용과 다르거나 계약과 다르게 이행된 경우(파본·오제작
                  등)에는 받은 날부터 3개월 이내, 그 사실을 안 날부터 30일 이내에 청약철회를 하실
                  수 있으며, 이 경우 제작 여부와 관계없이 가능합니다.
                </li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>2. 취소 방법</h2>
              <ol>
                <li>
                  주문 조회(마이페이지 또는 주문 확인 화면)에서 <strong>취소 요청</strong>을
                  접수하실 수 있습니다 — 결제 완료·제작 준비 단계에서 가능합니다.
                </li>
                <li>배송이 시작된 뒤에는 온라인 취소가 어려워 고객센터로 연락 부탁드립니다.</li>
                <li>접수된 취소 요청은 제작 착수 여부를 확인한 뒤 처리 결과를 안내해 드립니다.</li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>3. 환급</h2>
              <ol>
                <li>
                  청약철회가 확정되면 <strong>3영업일 이내</strong>에 결제하신 수단으로 대금을
                  환급합니다 (전자상거래법 제18조).
                </li>
                <li>
                  환급이 지연되는 경우 지연기간에 대해 전자상거래법 및 같은 법 시행령이 정하는
                  지연이율에 따라 산정한 <strong>지연배상금</strong>을 함께 지급합니다.
                </li>
                <li>신용카드 결제는 카드사 승인 취소로 진행되며, 카드사 사정에 따라 며칠이 더 걸릴 수 있습니다.</li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>4. 문의</h2>
              <p>
                환불·취소에 관해 궁금한 점은 <Link href="/contact">문의 페이지</Link>로 남겨
                주시거나 아래로 연락해 주세요.
              </p>
              <ul>
                <li>이메일: {biz.email ?? PENDING_VALUE}</li>
                <li>전화: {biz.phone ?? PENDING_VALUE}</li>
              </ul>
              <p>
                자세한 거래 조건은 <Link href="/terms">이용약관</Link>(제8조·제9조)을 함께 확인해
                주세요.
              </p>
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
