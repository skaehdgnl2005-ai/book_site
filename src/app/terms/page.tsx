import type { Metadata } from "next";
import { Nav } from "../_components/Nav";
import { businessInfo, PENDING_VALUE } from "../../lib/businessInfo";
import styles from "./page.module.css";

// F065 — 이용약관. 공정위 전자상거래(인터넷사이버몰) 표준약관 구조를 이 몰의 실제
// 사실(주문제작 그림책, 카드 결제, 청약철회 제한)에 맞게 축약한 초안. 법정 기준
// (7일 철회·3영업일 환급·지연배상)은 전자상거래법이 정한 값 그대로이며, 시행 전
// 사업자 최종 검토가 필요하다(PROGRESS 핸드오프에 명기). 사업자 실값은 F064
// businessInfo(BIZ_* env)를 재사용 — 미설정은 정직한 플레이스홀더.
export const metadata: Metadata = { title: "이용약관 — 그림책 제작소" };

const show = (v: string | null) => v ?? PENDING_VALUE;

export default function TermsPage() {
  const biz = businessInfo();
  return (
    <>
      <Nav />
      <main>
        <section className="section" aria-labelledby="terms-title">
          <p className="eyebrow">Terms</p>
          <h1 id="terms-title">이용약관</h1>

          <article className={styles.article}>
            <div className={styles.clause}>
              <h2>제1조 (목적)</h2>
              <p>
                이 약관은 {biz.name}(이하 &ldquo;몰&rdquo;)이 운영하는 인터넷 사이트에서 제공하는
                주문제작 그림책 판매 서비스(이하 &ldquo;서비스&rdquo;)를 이용함에 있어 몰과
                이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.
              </p>
            </div>

            <div className={styles.clause}>
              <h2>제2조 (정의)</h2>
              <ol>
                <li>
                  &ldquo;몰&rdquo;이란 {biz.name}이 재화 또는 용역을 이용자에게 제공하기 위하여
                  컴퓨터 등 정보통신설비를 이용하여 거래할 수 있도록 설정한 가상의 영업장을
                  말합니다.
                </li>
                <li>&ldquo;이용자&rdquo;란 몰에 접속하여 이 약관에 따라 서비스를 받는 자를 말합니다.</li>
                <li>
                  &ldquo;주문제작 상품&rdquo;이란 이용자가 제공한 아이의 이름·성별·기념일·사진 등의
                  정보를 바탕으로 개별적으로 새로 제작되는 그림책 및 그 부속물(외함·카드 등)을
                  말합니다. 몰에서 판매하는 모든 상품은 주문제작 상품입니다.
                </li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>제3조 (사업자 정보 및 약관의 명시·개정)</h2>
              <p>몰은 다음 사업자 정보를 이용자가 쉽게 알 수 있도록 초기화면(하단)에 게시합니다.</p>
              <dl className={styles.bizTable}>
                <div className={styles.bizRow}>
                  <dt>상호</dt>
                  <dd>{biz.name}</dd>
                </div>
                <div className={styles.bizRow}>
                  <dt>대표자</dt>
                  <dd>{show(biz.ownerName)}</dd>
                </div>
                <div className={styles.bizRow}>
                  <dt>사업장 주소</dt>
                  <dd>{show(biz.address)}</dd>
                </div>
                <div className={styles.bizRow}>
                  <dt>전화번호</dt>
                  <dd>{show(biz.phone)}</dd>
                </div>
                <div className={styles.bizRow}>
                  <dt>이메일</dt>
                  <dd>{show(biz.email)}</dd>
                </div>
                <div className={styles.bizRow}>
                  <dt>사업자등록번호</dt>
                  <dd>{show(biz.regNo)}</dd>
                </div>
                <div className={styles.bizRow}>
                  <dt>통신판매업 신고</dt>
                  <dd>{show(biz.mailOrderNo)}</dd>
                </div>
              </dl>
              <p>
                몰은 「전자상거래 등에서의 소비자보호에 관한 법률」(이하 &ldquo;전자상거래법&rdquo;),
                「약관의 규제에 관한 법률」 등 관련 법령을 위배하지 않는 범위에서 이 약관을 개정할
                수 있으며, 개정 시 적용일자와 개정사유를 명시하여 적용일 7일 전부터(이용자에게
                불리한 변경은 30일 전부터) 공지합니다.
              </p>
            </div>

            <div className={styles.clause}>
              <h2>제4조 (서비스의 제공)</h2>
              <ol>
                <li>
                  몰은 기념일·첫 순간들 라인(템플릿 기반 개인화)과 맞춤 제작(1:1 상담 기반 풀
                  커스텀) 그림책을 판매합니다.
                </li>
                <li>
                  상품의 가격·구성(커버 종류, 외함·카드, 선택 옵션)은 각 상품 화면에 표시된 내용을
                  따릅니다.
                </li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>제5조 (구매신청 및 계약의 성립)</h2>
              <ol>
                <li>
                  이용자는 상품을 선택하고 아이 이름·성별 등 제작에 필요한 정보를 입력한 뒤 결제
                  수단을 통해 구매를 신청합니다.
                </li>
                <li>
                  계약은 이용자의 구매신청에 대해 결제가 정상 승인되어 몰이 주문 확인을 표시한
                  때에 성립합니다.
                </li>
                <li>
                  이용자가 제공한 제작 정보(이름 표기, 날짜 등)가 명백히 잘못 입력된 경우, 제작
                  착수 전에 한하여 몰에 정정을 요청할 수 있습니다.
                </li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>제6조 (결제방법)</h2>
              <p>
                몰에서 구매한 상품의 대금은 신용카드 등 결제대행사(토스페이먼츠)가 제공하는 결제
                수단으로 지급할 수 있습니다. 대금은 원화(KRW)로 표시·청구됩니다.
              </p>
            </div>

            <div className={styles.clause}>
              <h2>제7조 (배송)</h2>
              <ol>
                <li>몰은 결제 확인 후 상품 제작을 시작하며, 제작 완료 후 이용자가 입력한 배송지로 발송합니다.</li>
                <li>기념일·첫 순간들 라인은 주문 후 1주일 이내 제작·발송을 원칙으로 하며, 맞춤 제작은 양식 확정 또는 상담 완료 후 1주일 이내를 원칙으로 합니다.</li>
                <li>배송 시작 시 몰은 주문 조회 화면에 택배사와 운송장 번호를 표시합니다.</li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>제8조 (청약철회 등)</h2>
              <ol>
                <li>
                  이용자는 전자상거래법 제17조에 따라 상품을 공급받은 날부터 7일 이내에 청약철회를
                  할 수 있습니다.
                </li>
                <li>
                  다만 몰의 상품은 이용자의 주문에 따라 개별적으로 생산되는 주문제작 상품으로,
                  전자상거래법 제17조 제2항 제6호에 따라 <strong>제작이 시작된 뒤에는 청약철회가
                  제한될 수 있습니다.</strong> 몰은 이 사실을 결제 전 화면에 별도로 고지하고
                  이용자의 동의를 받습니다.
                </li>
                <li>
                  제작 착수 전에는 주문 조회 화면의 취소 요청으로 언제든지 청약을 철회할 수
                  있습니다. 상품이 표시·광고 내용과 다르거나 계약 내용과 다르게 이행된 경우에는
                  공급받은 날부터 3개월 이내, 그 사실을 안 날부터 30일 이내에 청약철회를 할 수
                  있으며 이 경우 제2항의 제한을 받지 않습니다.
                </li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>제9조 (청약철회 등의 효과 — 환급)</h2>
              <ol>
                <li>
                  몰은 청약철회 등을 접수하고 상품을 반환받은 날(제작 착수 전 취소 등 반환이 필요
                  없는 경우 철회 의사표시를 받은 날)부터 <strong>3영업일 이내</strong>에 지급받은
                  대금을 환급합니다.
                </li>
                <li>
                  환급이 지연되는 경우 그 지연기간에 대하여 전자상거래법 및 같은 법 시행령이 정하는
                  지연이율을 곱하여 산정한 지연배상금을 지급합니다.
                </li>
                <li>환급은 이용자가 결제한 수단과 동일한 수단으로 하는 것을 원칙으로 합니다.</li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>제10조 (개인정보보호)</h2>
              <ol>
                <li>몰은 서비스 제공에 필요한 최소한의 개인정보만을 수집합니다.</li>
                <li>
                  개인정보의 수집·이용·보관·파기 등에 관한 사항은 몰이 별도로 게시하는
                  개인정보처리방침에 따릅니다.
                </li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>제11조 (몰의 의무)</h2>
              <p>
                몰은 관련 법령과 이 약관이 정하는 바에 따라 지속적이고 안정적으로 서비스를 제공하는
                데 최선을 다하며, 이용자의 개인정보(아이 사진 포함)를 안전하게 관리합니다.
              </p>
            </div>

            <div className={styles.clause}>
              <h2>제12조 (이용자의 의무)</h2>
              <ol>
                <li>이용자는 구매신청 시 사실에 근거한 정보를 제공해야 합니다.</li>
                <li>
                  이용자는 제작에 사용되는 사진·영상 등 자료에 대해 정당한 권리를 보유하거나 이용
                  허락을 받은 자료만 제공해야 하며, 제3자의 권리를 침해하는 자료 제공으로 발생하는
                  책임은 이용자에게 있습니다.
                </li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>제13조 (저작권)</h2>
              <ol>
                <li>몰이 작성한 저작물(사이트 콘텐츠 등)에 대한 저작권은 몰에 귀속됩니다.</li>
                <li>
                  완성된 주문제작 그림책은 구매한 이용자와 그 가족의 개인 소장·비상업적 이용을
                  위해 제공됩니다.
                </li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>제14조 (분쟁해결)</h2>
              <ol>
                <li>
                  몰은 이용자가 제기하는 정당한 의견이나 불만을 반영하고 그 피해를 보상처리하기
                  위해 노력합니다.
                </li>
                <li>
                  몰과 이용자 간에 발생한 전자상거래 분쟁과 관련하여 이용자의 피해구제 신청이 있는
                  경우 공정거래위원회 또는 시·도지사가 의뢰하는 분쟁조정기관의 조정에 따를 수
                  있습니다.
                </li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>제15조 (재판권 및 준거법)</h2>
              <p>
                몰과 이용자 간 발생한 분쟁에 관한 소송은 민사소송법상의 관할법원에 제기하며,
                대한민국 법을 적용합니다.
              </p>
            </div>

            <div className={styles.clause}>
              <h2>부칙</h2>
              <p>이 약관은 게시한 날부터 적용됩니다.</p>
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
