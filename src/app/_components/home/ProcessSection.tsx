import { SectionHeader } from "../SectionHeader";
import styles from "./home.module.css";

// F048 — "이렇게 만들어집니다": the first-visitor explainer for a product category
// (초개인화 그림책) the market doesn't know yet. Customer surfaces keep the AI
// mechanism backstage — copy leans on 맞춤/초개인화 and stays honest (no invented
// specs; lead time is quoted for the entry line only, matching FAQ/브리프).
const STEPS = [
  {
    no: "01",
    title: "순간을 고릅니다",
    body: "탄생부터 입학까지, 기념하고 싶은 순간의 이야기를 고르세요. 꼭 맞는 이야기가 없다면 맞춤 제작으로 처음부터 함께 만듭니다.",
  },
  {
    no: "02",
    title: "아이를 알려 주세요",
    body: "이름과 성별, 그리고 순간에 따라 한 가지만 더 여쭙니다. 사진은 지금 올려도, 결제 후 마이페이지에서 올려도 됩니다.",
  },
  {
    no: "03",
    title: "단 한 권을 만들어 보냅니다",
    body: "알려 주신 이야기로 아이가 주인공인 그림책을 단 한 권만 만듭니다. 기념일·첫 순간들은 주문 후 일주일 이내에 제작해 보내 드립니다.",
  },
] as const;

export function ProcessSection() {
  return (
    <section className="section" aria-label="이렇게 만들어집니다" data-testid="how-it-works">
      <SectionHeader title="이렇게 만들어집니다" />
      <ol className={styles.steps}>
        {STEPS.map((s) => (
          <li key={s.no} className={styles.item}>
            <span className={styles.no}>No. {s.no}</span>
            <h3 className={styles.itemTitle}>{s.title}</h3>
            <p className={styles.itemBody}>{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
