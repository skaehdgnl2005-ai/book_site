import Link from "next/link";
import type { CatalogTemplate } from "./templates";
import { formatWon } from "./templates";
import { TypographicCover } from "./TypographicCover";
import styles from "./TemplateCard.module.css";

// Atelier Sans Product Card (DESIGN.md ## Components #3), as a template card.
// Whole card = a link into the order flow (/order/<key>, built by TRACK-ORDER).
// Signature contrast: the 책 제목(label) is the ONLY serif; everything else is grotesk.
// Depth = tone steps + 1px hairlines (no box-shadow); radius 0; navy used only on the
// edition number + the made-to-order dot (within the <5% accent budget).
const editionNo = (index: number) => `No. ${index.toString().padStart(2, "0")}`;

// English cover kickers, per template key — an English rendition of the 책 제목 for the
// typographic cover's foot. Deliberately NOT the card's category kicker ("Anniversary" /
// "First moments"), which already sits in the top row — no duplication inside the mat.
// Unknown keys (future DB rows) fall back to a quiet generic.
const COVER_KICKERS: Record<string, string> = {
  birth: "The birth",
  hundred_days: "One hundred days",
  first_birthday: "First birthday",
  birthday: "The birthday",
  admission: "First school day",
  first_steps: "First steps",
  first_word: "First words",
  became_sibling: "A new sibling",
};

export function TemplateCard({
  template,
  index,
  kicker,
}: {
  template: CatalogTemplate;
  index: number;
  kicker: string;
}) {
  const { key, label, blurb, softPriceWon, hardPriceWon, heroImageUrl } = template;
  return (
    <Link
      href={`/order/${encodeURIComponent(key)}`}
      className={styles.card}
      data-testid="template-card"
    >
      <span className={styles.top}>
        <span className={styles.edition}>{editionNo(index)}</span>
        <span className={styles.tag}>{kicker}</span>
      </span>

      <span className={styles.media} data-testid="template-card-media">
        {heroImageUrl ? (
          <img className={styles.mediaImg} src={heroImageUrl} alt={`${label} 그림책 미리보기`} />
        ) : (
          // No real hero asset yet (backstage pipeline) — typographic cover, not an
          // empty mat. Edition omitted: the card's top row already shows No. 0X.
          <TypographicCover
            title={`「${label}」`}
            kicker={COVER_KICKERS[key] ?? "Picture book"}
          />
        )}
      </span>

      <span className={styles.title} data-testid="template-card-title">
        {label}
      </span>
      <span className={styles.blurb}>{blurb}</span>

      <span className={styles.priceRow}>
        <span className={styles.price} data-testid="template-card-price">
          소프트 {formatWon(softPriceWon)} · 하드 {formatWon(hardPriceWon)}
        </span>
        <span className={styles.made}>주문 제작</span>
      </span>
    </Link>
  );
}
