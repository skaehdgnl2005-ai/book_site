import Link from "next/link";
import { businessInfo, ftcLookupUrl, PENDING_VALUE } from "../../lib/businessInfo";

// Site footer (Atelier Sans). Quiet: wordmark + tagline + text links to the content
// pages (F048 — brand-story/gallery/reviews/faq/contact were unreachable orphans
// before; the footer is the site-wide discovery surface). Text links only, no promo.
// F064 — 법정 표시사항(전자상거래법 제10조) 블록: 값은 BIZ_* env(businessInfo.ts),
// 미설정은 '준비 중' 플레이스홀더(가짜 값 발명 금지). 서버 컴포넌트 유지가 전제라
// 렌더는 루트 layout.tsx 한 곳뿐이다 — 클라이언트 컴포넌트에서 import하면 env가
// 번들에서 사라진다. 페이지별 <Footer />를 되살리지 말 것.
const LINKS = [
  { href: "/brand-story", label: "브랜드 스토리" },
  { href: "/gallery", label: "갤러리" },
  { href: "/reviews", label: "후기" },
  { href: "/faq", label: "자주 묻는 질문" },
  { href: "/contact", label: "문의" },
] as const;

const row = (label: string, value: string | null) => ({ label, value: value ?? PENDING_VALUE });

export function Footer() {
  const biz = businessInfo();
  const ftcUrl = ftcLookupUrl(biz.regNo);
  const rows = [
    row("상호", biz.name),
    row("대표", biz.ownerName),
    row("사업자등록번호", biz.regNo),
    row("통신판매업 신고", biz.mailOrderNo),
    row("주소", biz.address),
    row("전화", biz.phone),
    row("이메일", biz.email),
    row("개인정보관리책임자", biz.privacyOfficer),
    row("호스팅", biz.hostingProvider),
  ];
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
      <section className="site-footer__legal" aria-label="사업자 정보">
        {/* 정책 연결화면(전자상거래법 10조) — F065 이용약관; F066 개인정보처리방침·
            F067 청약철회·환불 정책이 각자 자기 링크를 여기 덧붙인다. */}
        <ul className="site-footer__policy-links">
          <li>
            <Link className="site-footer__link" href="/terms">
              이용약관
            </Link>
          </li>
          <li>
            <Link className="site-footer__link" href="/privacy">
              개인정보처리방침
            </Link>
          </li>
        </ul>
        <ul className="site-footer__legal-rows">
          {rows.map((r) => (
            <li key={r.label} className="site-footer__legal-row">
              <span className="site-footer__legal-label">{r.label}</span> {r.value}
            </li>
          ))}
          {ftcUrl ? (
            <li className="site-footer__legal-row">
              <a
                className="site-footer__link"
                href={ftcUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                사업자정보확인
              </a>
            </li>
          ) : null}
        </ul>
      </section>
    </footer>
  );
}
