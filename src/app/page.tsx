import { Nav } from "./_components/Nav";
import { Footer } from "./_components/Footer";
import { CtaLink } from "./_components/Button";
import { SectionHeader } from "./_components/SectionHeader";
import { CategoryCard } from "./_components/CategoryCard";

// Home — 그림책 제작소 (F002). Hero + 3-category preview + primary CTA.
// All styling via DESIGN.md tokens (src/app/globals.css). No DB/payment here.
export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">AI 초개인화 그림책</p>
          <h1 className="hero__title" id="hero-title">
            세상에 한 아이만을 위해 만들어지는 책
          </h1>
          <p className="hero__sub">
            한 아이의 이름으로 시작되는, 단 하나의 이야기. 동화책 번역가가 한 권 한 권
            큐레이션합니다.
          </p>
          <CtaLink href="/anniversary">내 아이의 책 만들기</CtaLink>
        </section>

        <section
          className="section"
          aria-labelledby="categories-heading"
          data-testid="featured"
        >
          <SectionHeader title="무엇을 기념하나요" />
          <div className="category-grid">
            <CategoryCard
              href="/anniversary"
              kicker="Anniversary"
              title="기념일"
              desc="탄생·백일·돌·생일·입학 — 누군가 선물로 사는 날."
            />
            <CategoryCard
              href="/first-moments"
              kicker="First moments"
              title="첫 순간들"
              desc="첫 걸음마·첫 말·형아 된 날 — 부모가 기록으로 남기는 순간."
            />
            <CategoryCard
              href="/custom"
              kicker="Full custom"
              title="맞춤 제작"
              desc="100% 풀 커스텀으로 만드는 단 하나의 이야기."
            />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
