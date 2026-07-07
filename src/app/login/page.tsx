import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Nav } from "../_components/Nav";
import { Footer } from "../_components/Footer";
import { LoginForm } from "../_components/account/LoginForm";
import { getSessionUser } from "../account/_lib/sessionUser";

export const dynamic = "force-dynamic"; // session cookie decides the render
export const metadata: Metadata = {
  title: "로그인 · 그림책 제작소",
  robots: { index: false, follow: false },
};

/**
 * F056 (ADR-0023) — passwordless 로그인(=가입). 비밀번호 없음: 이메일 OTP 한 번이면 계정이
 * 만들어지고 로그인됩니다. 게스트 구매는 계속 가능(로그인은 선택) — 회원은 내 주문(F057)과
 * OTP 없는 마이페이지 진입을 얻는다.
 */
export default async function LoginPage() {
  if (await getSessionUser()) redirect("/account"); // already signed in

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="login-title">
          <p className="eyebrow eyebrow--ko">계정</p>
          <h1 className="hero__title" id="login-title">로그인</h1>
          <p className="hero__sub">
            이메일로 받은 인증 코드 한 번이면 됩니다. 처음이라면 자동으로 가입돼요 — 비밀번호는 없습니다.
          </p>
        </section>
        <LoginForm />
      </main>
      <Footer />
    </>
  );
}
