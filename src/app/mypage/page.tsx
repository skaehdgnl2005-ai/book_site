import type { Metadata } from "next";
import { Nav } from "../_components/Nav";
import { Footer } from "../_components/Footer";
import { MypageLookup } from "../_components/mypage/MypageLookup";

// noindex (R5): mypage is a private finishing surface, never indexed.
export const metadata: Metadata = {
  title: "마이페이지 · 그림책 제작소",
  robots: { index: false, follow: false },
};

/**
 * F017 — 마이페이지 entry. No buyer auth exists, so a guest reaches their order's finishing
 * surface by order# + the email they paid with (verified server-side, then redirected behind a
 * capability cookie). See src/app/mypage/_lib/access.ts.
 */
export default function MypageLookupPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="mypage-lookup-title">
          <p className="eyebrow eyebrow--ko">마이페이지</p>
          <h1 className="hero__title" id="mypage-lookup-title">주문 조회</h1>
          <p className="hero__sub">
            주문번호와 결제 시 사용한 이메일을 입력하면 사진·헌정 문구·QR 영상 등 책 마무리를 이어갈 수 있어요.
          </p>
        </section>
        <MypageLookup />
      </main>
      <Footer />
    </>
  );
}
