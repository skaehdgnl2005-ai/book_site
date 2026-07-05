import Link from "next/link";

// Top nav (Atelier Sans). Wordmark + category links. Flex-wraps so it never
// overflows at 375px. Reused across all pages (built by F002).
// `overlay` (home only): transparent over the photo hero, on-dark text.
export function Nav({ overlay = false }: { overlay?: boolean }) {
  return (
    <nav
      className={overlay ? "site-nav site-nav--overlay" : "site-nav"}
      aria-label="주요 메뉴"
    >
      <Link href="/" className="site-nav__brand">
        그림책 제작소
      </Link>
      <ul className="site-nav__links">
        <li>
          <Link href="/anniversary" className="nav-link">기념일</Link>
        </li>
        <li>
          <Link href="/first-moments" className="nav-link">첫 순간들</Link>
        </li>
        <li>
          <Link href="/custom" className="nav-link">맞춤 제작</Link>
        </li>
        <li>
          {/* Post-purchase entry: the finishing flow (photo/dedication) lives behind
              the mypage lookup — without this link buyers had no way back in. */}
          <Link href="/mypage" className="nav-link">주문 조회</Link>
        </li>
      </ul>
    </nav>
  );
}
