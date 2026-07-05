import Link from "next/link";

// Site footer (Atelier Sans). Quiet: wordmark + tagline + text links to the content
// pages (F048 — brand-story/gallery/reviews/faq/contact were unreachable orphans
// before; the footer is the site-wide discovery surface). Text links only, no promo.
const LINKS = [
  { href: "/brand-story", label: "브랜드 스토리" },
  { href: "/gallery", label: "갤러리" },
  { href: "/reviews", label: "후기" },
  { href: "/faq", label: "자주 묻는 질문" },
  { href: "/contact", label: "문의" },
] as const;

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__brand">
        <span>그림책 제작소</span>
        <span>한 아이의 이름으로 시작되는 이야기</span>
      </div>
      <nav aria-label="사이트 안내">
        <ul className="site-footer__links">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link className="site-footer__link" href={l.href}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
