/**
 * F058 — 카카오 로그인 버튼. 카카오 로그인 디자인 가이드
 * (developers.kakao.com/docs/ko/kakaologin/design-guide)의 '규정'을 그대로 따른다: 고정 컨테이너
 * 색·심볼 색·레이블 색·radius 12px, 그리고 심볼 생략 금지("심볼 없이 카카오 로그인 버튼을 구성할
 * 수 없습니다"). 규정값 표와 우리 토큰과의 충돌 근거는 **DESIGN.md '## Shapes → 예외 — 카카오
 * 로그인 버튼'**이 SoR이고, 실제 값은 globals.css의 `.kakao-btn` 블록에 있다(여기에 다시 적으면
 * 세 곳으로 흩어져 드리프트한다).
 *
 * 레이블은 완성형 '카카오 로그인'만 쓴다. 이전 문구였던 '카카오로 시작하기'는 **카카오 싱크**
 * (별도 제품·별도 가이드)의 레이블이라 로그인 버튼에 쓰면 가이드 위반이다.
 *
 * 심볼: 카카오는 벡터를 배포하지 않는다(공식 자산은 PNG/PSD뿐). 그래서 공식 자산
 * `kakao_login_large_narrow.png`의 심볼(36×34px)에서 행별 x-extent를 실측해 타원 + 삼각 꼬리로
 * 복원했다 — 34행 평균 오차 0.20px, 최대 1.0px. 비율(심볼 높이 = 컨테이너의 0.378, 좌측 인셋 =
 * 0.322)도 같은 자산 실측값이라 `--kakao-h`만 바꿔도 가이드 비율이 유지된다.
 */
export function KakaoLoginButton() {
  return (
    <a className="kakao-btn" href="/api/auth/kakao/start" data-testid="login-kakao">
      <svg
        className="kakao-btn__symbol"
        viewBox="0 0 36 34.25"
        aria-hidden="true"
        focusable="false"
      >
        <ellipse cx="18" cy="13.9" rx="18" ry="13.9" fill="currentColor" />
        <path d="M8.9 21.85 L5.56 34.25 L20.6 24.85 Z" fill="currentColor" />
      </svg>
      카카오 로그인
    </a>
  );
}
