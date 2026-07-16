import type { Metadata } from "next";
import { Nav } from "../_components/Nav";
import { businessInfo, PENDING_VALUE } from "../../lib/businessInfo";
import styles from "./page.module.css";

// F066 — 개인정보처리방침. 이 몰이 실제로 수집·처리하는 항목만 기술한다(발명 금지):
// 주문 폼(아이 이름·성별·템플릿 변수), 배송지(F053), 주문 확인 이메일(contactEmail),
// 선택 사진/영상(F009/F018 — 접근통제 스토리지), 회원 이메일/카카오 식별자(F056/F058),
// 결제는 토스페이먼츠 처리(몰은 카드정보 미보유). 로그/트레이스 PII 배제는 기존
// redact 레일(E3)의 문서화다. 책임자 실값은 BIZ_PRIVACY_OFFICER env — 미설정은
// 정직한 플레이스홀더. 시행 전 사업자 최종 검토 필요(핸드오프 명기).
export const metadata: Metadata = { title: "개인정보처리방침 — 그림책 제작소" };

const show = (v: string | null) => v ?? PENDING_VALUE;

export default function PrivacyPage() {
  const biz = businessInfo();
  return (
    <>
      <Nav />
      <main>
        <section className="section" aria-labelledby="privacy-title">
          <p className="eyebrow">Privacy</p>
          <h1 id="privacy-title">개인정보처리방침</h1>

          <article className={styles.article}>
            <div className={styles.clause}>
              <p>
                {biz.name}(이하 &ldquo;몰&rdquo;)은 「개인정보 보호법」 등 관련 법령을 준수하며,
                주문제작 그림책 서비스 제공에 필요한 최소한의 개인정보만을 수집·이용합니다. 이
                방침은 몰이 어떤 정보를 왜 모으고, 얼마나 보관하며, 어떻게 보호하는지를
                설명합니다.
              </p>
            </div>

            <div className={styles.clause}>
              <h2>1. 수집하는 개인정보 항목</h2>
              <dl className={styles.table}>
                <div className={styles.row}>
                  <dt>주문·제작</dt>
                  <dd>아이 이름·성별, 템플릿별 추가 정보(기념일 날짜 등), (선택) 아이 사진·영상</dd>
                </div>
                <div className={styles.row}>
                  <dt>배송</dt>
                  <dd>받는 분 이름, 연락처, 우편번호·주소</dd>
                </div>
                <div className={styles.row}>
                  <dt>연락·알림</dt>
                  <dd>주문 확인 및 안내용 이메일 주소</dd>
                </div>
                <div className={styles.row}>
                  <dt>회원(선택)</dt>
                  <dd>이메일 주소(로그인 인증), 카카오 계정 식별자(카카오 로그인 이용 시)</dd>
                </div>
                <div className={styles.row}>
                  <dt>맞춤 제작 상담</dt>
                  <dd>신청자 이름, 연락처, 이메일, 의뢰 내용</dd>
                </div>
              </dl>
              <p>
                결제 카드 정보는 결제대행사(토스페이먼츠)가 직접 처리하며, 몰은 카드번호 등 결제
                수단 정보를 저장하지 않습니다(결제 식별 키만 보관).
              </p>
            </div>

            <div className={styles.clause}>
              <h2>2. 수집·이용 목적</h2>
              <ol>
                <li>주문제작 그림책의 제작(아이 이름·성별·사진의 책 반영)</li>
                <li>주문 처리·결제 확인·배송</li>
                <li>주문 조회 본인 확인(이메일 인증), 회원 로그인</li>
                <li>주문·환불 등 거래 관련 안내</li>
                <li>문의·상담 응대</li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>3. 보유·이용 기간</h2>
              <p>
                수집한 개인정보는 목적 달성 후 지체 없이 파기합니다. 다만 전자상거래법 등 관련
                법령에 따라 다음 기록은 정해진 기간 동안 보존합니다.
              </p>
              <ul>
                <li>계약 또는 청약철회 등에 관한 기록: 5년</li>
                <li>대금결제 및 재화 등의 공급에 관한 기록: 5년</li>
                <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년</li>
              </ul>
            </div>

            <div className={styles.clause}>
              <h2>4. 처리 위탁</h2>
              <p>몰은 서비스 제공을 위해 다음 업무를 외부에 위탁합니다.</p>
              <dl className={styles.table}>
                <div className={styles.row}>
                  <dt>토스페이먼츠</dt>
                  <dd>결제 처리 및 결제 대금 정산</dd>
                </div>
                <div className={styles.row}>
                  <dt>Vercel Inc.</dt>
                  <dd>사이트 호스팅 및 운영 인프라</dd>
                </div>
                <div className={styles.row}>
                  <dt>Supabase</dt>
                  <dd>주문 데이터베이스 및 업로드 파일(사진·영상) 보관</dd>
                </div>
                <div className={styles.row}>
                  <dt>Resend</dt>
                  <dd>거래 안내·인증 이메일 발송</dd>
                </div>
              </dl>
            </div>

            <div className={styles.clause}>
              <h2>5. 제3자 제공</h2>
              <p>
                몰은 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 근거한 적법한
                요청이 있는 경우는 예외로 합니다.
              </p>
            </div>

            <div className={styles.clause}>
              <h2>6. 아동의 개인정보 (사진·이름 특칙)</h2>
              <ol>
                <li>
                  아이의 이름·성별·사진은 오직 그 아이의 그림책 제작 목적으로만 사용하며, 마케팅
                  등 다른 목적에 사용하지 않습니다.
                </li>
                <li>
                  아동의 정보는 법정대리인(보호자)이 직접 입력·제공하는 것을 전제로 하며, 사진
                  업로드는 선택 사항입니다.
                </li>
                <li>
                  업로드된 사진·영상은 외부에서 접근할 수 없는 비공개 저장소에 접근통제 상태로
                  보관하며, 파일명 등 식별 정보를 화면 주소(URL)나 서버 기록(로그)에 남기지
                  않습니다.
                </li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>7. 쿠키 등 자동 수집 장치</h2>
              <p>
                몰은 로그인 상태 유지와 주문 조회 본인 확인을 위한 최소한의 쿠키를 사용합니다.
                장바구니는 이용자의 브라우저(로컬 저장소)에만 저장되며 서버로 전송되지 않습니다.
                광고·행태 추적 쿠키는 사용하지 않습니다.
              </p>
            </div>

            <div className={styles.clause}>
              <h2>8. 정보주체의 권리와 행사 방법</h2>
              <p>
                이용자는 언제든지 자신의(또는 법정대리인으로서 아동의) 개인정보에 대해 열람·정정·
                삭제·처리정지를 요구할 수 있습니다. 요청은 아래 개인정보보호책임자 연락처 또는
                문의 페이지로 접수하실 수 있으며, 몰은 지체 없이 조치합니다.
              </p>
            </div>

            <div className={styles.clause}>
              <h2>9. 안전성 확보 조치</h2>
              <ol>
                <li>필요 최소한의 정보만 수집 (결제 전 필수 입력은 아이 이름·성별 수준으로 최소화)</li>
                <li>업로드 파일의 비공개 저장 및 서버 측 접근통제</li>
                <li>서버 기록(로그·트레이스)에서 개인정보 자동 마스킹</li>
                <li>전송 구간 암호화(HTTPS)</li>
              </ol>
            </div>

            <div className={styles.clause}>
              <h2>10. 개인정보보호책임자</h2>
              <dl className={styles.table}>
                <div className={styles.row}>
                  <dt>책임자</dt>
                  <dd>{show(biz.privacyOfficer)}</dd>
                </div>
                <div className={styles.row}>
                  <dt>이메일</dt>
                  <dd>{show(biz.email)}</dd>
                </div>
                <div className={styles.row}>
                  <dt>전화</dt>
                  <dd>{show(biz.phone)}</dd>
                </div>
              </dl>
            </div>

            <div className={styles.clause}>
              <h2>11. 방침의 변경</h2>
              <p>
                이 방침의 내용이 추가·삭제·수정되는 경우 시행 7일 전부터 사이트 공지사항(또는 이
                화면)을 통해 알립니다.
              </p>
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
