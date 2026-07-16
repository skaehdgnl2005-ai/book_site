import Link from "next/link";
import { Nav } from "../_components/Nav";
import { FaqItem } from "../_components/content/FaqItem";
import styles from "./page.module.css";

// F027 — FAQ. Answers grounded in the brief (§4/§6). Where the brief is silent
// (배송 carrier/fee, 환불 policy), the answer is honest + flagged TODO — no invented
// facts (날조 금지). Accordion via FaqItem (<details>). Styled via DESIGN tokens.
export default function FaqPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="section" aria-labelledby="faq-title">
          <p className="eyebrow">FAQ</p>
          <h1 id="faq-title">자주 묻는 질문</h1>

          <div className={styles.list}>
            {/* F048 — the two questions a first-time visitor actually has, first.
                Honest without naming the backstage mechanism (AI 언급 최소화):
                what we DO say — 한 권 한 권 새로 제작, 사진은 참고, 번역가가 문장을
                다듬음 — is all true per the brief/brand-story. */}
            <FaqItem q="그림책은 어떻게 만들어지나요?">
              알려 주신 아이의 이름과 순간을 바탕으로, 아이가 주인공인 이야기를 한 권 한 권 새로
              만듭니다. 사진을 올려 주시면 주인공의 모습을 담는 데 참고하고, 수많은 그림책을
              우리말로 옮겨 온 번역가가 문장을 다듬어 완성합니다. 같은 책은 세상에 다시 없습니다.
            </FaqItem>

            <FaqItem q="책과 함께 무엇이 오나요?">
              모든 책은 자석 외함과 축하 카드가 기본으로 함께 갑니다. 기념일·첫 순간들 라인은
              소프트커버(43,000원)와 하드커버(49,000원) 중에 고르실 수 있고, QR 영상 인사
              메시지는 선택 옵션(기본 미포함 · 요금 추후 안내)입니다.
            </FaqItem>

            <FaqItem q="제작 기간은 얼마나 걸리나요?">
              기념일·첫 순간들 라인은 주문 후 일주일 이내에 제작해 보내 드립니다. 맞춤 제작은 양식
              확정 또는 상담 완료 후 일주일 이내입니다.
            </FaqItem>

            <FaqItem q="맞춤 제작은 어디까지 가능한가요?">
              맞춤 제작(119,000원)은 시놉시스·문체·삽화·교훈까지 1:1 상담으로 100% 풀 커스텀합니다.
              전화 상담 예약과 글 작성, 두 경로 중에 고르실 수 있고 두 경로 모두 같은 양식을 사용합니다.
            </FaqItem>

            <FaqItem q="배송은 어떻게 되나요?">
              {/* TODO(F027): shipping carrier/fee once finalized — not specified in brief. */}
              주문하신 책을 제작한 뒤 받는 분 주소로 보내 드립니다. 택배사·배송비 등 자세한 배송 안내는
              준비 중입니다.
            </FaqItem>

            <FaqItem q="사진과 영상은 어떻게 올리나요?">
              아이 사진은 결제 전에 올리거나 ‘나중에 올리기’로 건너뛸 수 있고, 건너뛰면 결제 후
              마이페이지에서 올리시면 됩니다. QR 영상 인사 메시지는 선택 옵션으로, 추가하신 경우
              마이페이지에서 올립니다.
            </FaqItem>

            <FaqItem q="환불이 되나요?">
              {/* TODO(F027): exact refund policy — none specified in the brief; do NOT invent. */}
              주문하신 책은 아이만을 위해 새로 만드는 개인화 상품이라, 제작이 시작된 뒤에는 환불이
              어려울 수 있습니다. 정확한 환불 정책은 안내를 준비하고 있으니, 자세한 내용은 문의 주시면
              도와 드리겠습니다.
            </FaqItem>
          </div>

          <p className={styles.more}>
            더 궁금한 점은 <Link href="/contact">문의 페이지</Link>로 남겨 주세요.
          </p>
        </section>
      </main>
    </>
  );
}
