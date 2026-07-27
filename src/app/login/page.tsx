import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Nav } from "../_components/Nav";
import { LoginForm } from "../_components/account/LoginForm";
import { KakaoLoginButton } from "../_components/account/KakaoLoginButton";
import { kakaoLoginAvailable } from "../account/_lib/kakao";
import { getSessionUser } from "../account/_lib/sessionUser";

export const dynamic = "force-dynamic"; // session cookie decides the render
export const metadata: Metadata = {
  title: "로그인 · 그림책 제작소",
  robots: { index: false, follow: false },
};

/**
 * F056/F058 (ADR-0023) — passwordless 로그인(=가입): 이메일 OTP 또는 카카오. 게스트 구매는
 * 계속 가능(로그인은 선택). 이메일 없는 카카오 계정은 로그인 상태로 이 페이지에서 이메일을
 * 연결(OTP 검증 → attach — actions.ts)하므로, 리다이렉트는 이메일 보유 세션에만 적용.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user?.email) redirect("/account"); // signed in with an email — nothing to do here
  const { error } = await searchParams;
  const kakaoOn = kakaoLoginAvailable();

  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="login-title">
          <p className="eyebrow eyebrow--ko">계정</p>
          <h1 className="hero__title" id="login-title">{user ? "이메일 연결" : "로그인"}</h1>
          <p className="hero__sub">
            {user
              ? "이메일 인증 코드를 확인하면 이 계정에 이메일이 연결되고, 그 이메일로 결제한 주문이 나타나요."
              : "이메일로 받은 인증 코드 한 번이면 됩니다. 처음이라면 자동으로 가입돼요 — 비밀번호는 없습니다."}
          </p>
        </section>
        {/* '다시 시도해 주세요'는 다시 시도할 버튼이 있을 때만 말이 된다 — 카카오가 이 서버에서
            불가해 버튼을 숨긴 상태(kakaoOn=false)라면 ?error=kakao로 직접 들어와도 경고를 띄우지
            않는다. 취소(access_denied)는 애초에 error 파라미터 없이 돌아오므로 여기에 닿지 않는다. */}
        {error === "kakao" && kakaoOn ? (
          <section className="section" aria-label="카카오 로그인 오류">
            <p role="alert" data-testid="login-kakao-error">
              카카오 로그인에 실패했습니다. 다시 시도해 주세요.
            </p>
          </section>
        ) : null}
        <LoginForm />
        {!user && kakaoOn ? (
          <section className="section section--social" aria-label="소셜 로그인">
            {/* F058 — 같은 kauth 라운드트립(비프로덕션은 sandbox); 신규면 가입, 기존이면 로그인.
                버튼은 이 서버에서 카카오 로그인이 실제로 완료될 수 있을 때만 렌더한다
                (kakaoLoginAvailable): 키 없이 노출하면 누를 때마다 반드시 실패로 되돌아온다. */}
            <p className="or-divider">또는</p>
            <KakaoLoginButton />
          </section>
        ) : null}
      </main>
    </>
  );
}
