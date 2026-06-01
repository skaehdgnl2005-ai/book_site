import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Storybook Shop — Premium Illustrated Storybooks",
  description: "Curated, high-illustration premium storybooks for ages 0–10.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
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
