import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// F048 — Korean metadata: the link preview (카카오톡 공유 등) is the product's first
// explanation surface. Copy mirrors the brief's value prop (초개인화 그림책 · 소장형 기념물).
const SITE_TITLE = "그림책 제작소 — 한 아이만을 위한 단 하나의 그림책";
const SITE_DESCRIPTION =
  "아이의 이름으로 시작되는 초개인화 그림책. 탄생·백일·돌 같은 기념일부터 첫 순간들까지, 단 한 권만 만들어 자석 외함과 축하 카드에 담아 보내 드립니다.";

export const metadata: Metadata = {
  metadataBase: new URL("https://storybook-shop.vercel.app"),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "그림책 제작소",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* Fonts per DESIGN.md (Atelier Sans): Archivo (grotesk), Noto Serif KR
            (KO titles), Inter (latin), Pretendard (UI/body). display=swap so the
            page renders immediately on the system-ui fallback if a CDN is slow. */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Jost:wght@300;400;500&family=Noto+Serif+KR:wght@300;400;500&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
