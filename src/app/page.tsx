import { getImageProps } from "next/image";
import { Nav } from "./_components/Nav";
import { CtaLink } from "./_components/Button";
import { SectionHeader } from "./_components/SectionHeader";
import { CategoryCard } from "./_components/CategoryCard";
import { ProcessSection } from "./_components/home/ProcessSection";
import { KitSection } from "./_components/home/KitSection";

// Home — 그림책 제작소 (F002). Full-bleed photo hero + 3-category preview + primary CTA.
// All styling via DESIGN.md tokens (src/app/globals.css). No DB/payment here.
// Photo art direction: docs/superpowers/specs/2026-07-04-hero-category-photo-brief-design.md.

// One <picture>, two cuts (DESIGN.md Hero is the only full-bleed image): phones get the
// vertical 9:16 crop, ≥720px (the site's grid breakpoint) gets the 16:9 — never both.
function HeroMedia() {
  const shared = { alt: "", sizes: "100vw", priority: true } as const;
  const {
    props: { srcSet: desktopSrcSet },
  } = getImageProps({ ...shared, src: "/images/hero-desktop.png", width: 2752, height: 1536 });
  const { props: mobile } = getImageProps({
    ...shared,
    src: "/images/hero-mobile.png",
    width: 1536,
    height: 2752,
  });
  return (
    <span className="hero__media" aria-hidden="true">
      <picture>
        <source media="(min-width: 720px)" srcSet={desktopSrcSet} sizes="100vw" />
        <img {...mobile} />
      </picture>
    </span>
  );
}

export default function HomePage() {
  return (
    <>
      <Nav overlay />
      {/* Hero lives outside <main> so it full-bleeds without escaping main's max-width. */}
      <section className="hero hero--image" aria-labelledby="hero-title">
        <HeroMedia />
        <div className="hero__content">
          <p className="eyebrow eyebrow--ko">초개인화 그림책</p>
          <h1 className="hero__title" id="hero-title">
            세상에 한 아이만을 위해 만들어지는 책
          </h1>
          <p className="hero__sub">
            한 아이의 이름으로 시작되는, 단 하나의 이야기. 동화책 번역가가 한 권 한 권
            큐레이션합니다.
          </p>
          <CtaLink href="/anniversary" data-analytics="home_hero">내 아이의 책 만들기</CtaLink>
        </div>
      </section>

      <main>
        {/* F048 — first-visitor explainer: how it's made BEFORE the category pick
            (a new-market visitor needs the concept first), what arrives AFTER it. */}
        <ProcessSection />
        <section
          className="section"
          aria-labelledby="categories-heading"
          data-testid="featured"
        >
          <SectionHeader title="무엇을 기념하나요" />
          <div className="category-grid">
            <CategoryCard
              href="/anniversary"
              img="/images/cat-anniversary.png"
              kicker="Anniversary"
              title="기념일"
              desc="탄생·백일·돌·생일·입학 — 누군가 선물로 사는 날."
            />
            <CategoryCard
              href="/first-moments"
              img="/images/cat-first-moments.png"
              kicker="First moments"
              title="첫 순간들"
              desc="첫 걸음마·첫 말·형아 된 날 — 부모가 기록으로 남기는 순간."
            />
            <CategoryCard
              href="/custom"
              img="/images/cat-custom.png"
              kicker="Full custom"
              title="맞춤 제작"
              desc="100% 풀 커스텀으로 만드는 단 하나의 이야기."
            />
          </div>
        </section>
        <KitSection />
      </main>
    </>
  );
}
