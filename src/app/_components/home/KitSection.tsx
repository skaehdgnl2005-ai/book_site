import { SectionHeader } from "../SectionHeader";
import styles from "./home.module.css";

// F048 — "한 권에 담기는 것": what physically arrives (책·자석 외함·축하 카드 —
// the keepsake framing from brand-story, previously invisible in the funnel).
// The media mat is an HONEST placeholder (same standard as the gallery's 준비중):
// no real product photos exist yet. When the maker delivers `kit-lifestyle.png`
// (brief §6, photo-brief doc), swap the mat for a next/image fill like CategoryCard.
const ITEMS = [
  {
    no: "01",
    name: "그림책 한 권",
    body: "아이의 이름으로 시작하는 이야기를 단 한 권만 인쇄합니다. 같은 책은 세상에 다시 없습니다.",
  },
  {
    no: "02",
    name: "자석 외함",
    body: "책을 감싸는 자석 여닫이 케이스. 아이가 책을 펼치는 순간까지 설계했습니다.",
  },
  {
    no: "03",
    name: "축하 카드",
    body: "마음을 전하는 축하 카드가 함께 담깁니다. 결제 후 마이페이지에서 헌정 문구도 남길 수 있습니다.",
  },
] as const;

export function KitSection() {
  return (
    <section className="section" aria-label="한 권에 담기는 것" data-testid="kit">
      <SectionHeader title="한 권에 담기는 것" aside={<span className={styles.aside}>모든 책 기본 구성</span>} />
      <div className={styles.split}>
        <div className={styles.media}>
          <span className={styles.mediaNote}>실물 사진 준비 중</span>
        </div>
        <div>
          <ul className={styles.kitList}>
            {ITEMS.map((k) => (
              <li key={k.no} className={styles.item}>
                <span className={styles.no}>No. {k.no}</span>
                <h3 className={styles.itemTitle}>{k.name}</h3>
                <p className={styles.itemBody}>{k.body}</p>
              </li>
            ))}
          </ul>
          <p className={styles.note}>QR 영상 인사 메시지는 선택 옵션입니다 · 기본 미포함 · 요금 추후 안내</p>
        </div>
      </div>
    </section>
  );
}
