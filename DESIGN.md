---
version: 1.0
name: YEOBAEK BOOKS — Atelier Sans
description: >
  절제된 고급 럭셔리 동화책 셀렉트샵. 산세 그로테스크가 구조를 주도하고
  책·이야기 제목에만 명조를 써 대비를 만든다. 액센트는 잉크 네이비 단 1색.
references: [29CM, Gentle Monster, Margaret Howell, The Row, Aesop]

colors:                       # 의미론적 역할은 ## Colors 참조. 순백/순흑 금지.
  bg:          "#F4F1EA"      # Cloud Ivory · 기본 배경
  surface:     "#F8F5F0"      # Alabaster · 카드/플레이트(배경 +4 명도)
  panel:       "#EDEAE3"      # Bone · 교차 밴드/이미지 매트
  line:        "#E0DBD2"      # Plaster · 1px 헤어라인
  muted:       "#A89F92"      # Stone · 라벨/캡션/메타
  grey:        "#736B5E"      # Warm Grey · 2차 본문
  ink:         "#23211E"      # Deep Charcoal · 본문·제목
  inkStrong:   "#16140F"      # Ink · 다크 밴드/푸터/히어로 배경
  accent:      "#1B2A4A"      # Ink Navy · 유일 액센트
  accentHover: "#122038"
  accentWash:  "rgba(27,42,74,0.16)"   # 포커스 링 전용
  onDark:      "#F8F5F0"      # 다크면 위 본문
  onDarkMuted: "#C9C3B6"

typography:
  families:
    grotesk: "'Archivo','Jost','Pretendard Variable',system-ui,sans-serif"   # 디스플레이·구조 텍스트
    sans:    "'Pretendard Variable','Pretendard','Inter','Apple SD Gothic Neo','Noto Sans KR',system-ui,sans-serif"  # 본문·UI
    serifKo: "'Noto Serif KR',serif"   # 책/이야기 제목 전용(명조) — 유일한 세리프
  hero:         { family: grotesk, size: "clamp(2.7rem,8.4vw,7rem)", weight: 600, line: 0.96, tracking: "-0.025em", transform: uppercase }
  h2:           { family: grotesk, size: "clamp(1.5rem,3vw,2.3rem)", weight: 600, line: 1.04, tracking: "-0.018em", transform: uppercase }
  statement:    { family: grotesk, size: "clamp(1.55rem,3.4vw,2.7rem)", weight: 400, line: 1.28, tracking: "-0.012em" }
  productTitle: { family: serifKo, size: "1.18rem", weight: 400, line: 1.35, tracking: "-0.005em" }   # 책 제목 = 명조
  body:         { family: sans, size: "16px", weight: 400, line: 1.7 }
  bodyKo:       { family: sans, size: "16px", weight: 400, line: 1.75 }   # 한글 본문 행간 ↑, word-break:keep-all
  price:        { family: grotesk, size: "0.92rem", weight: 600, tracking: "0.01em" }
  label:        { family: grotesk, size: "0.70rem", weight: 500, tracking: "0.16em", transform: uppercase }  # eyebrow·nav·메타
  microLabel:   { family: grotesk, size: "0.62rem", weight: 600, tracking: "0.20em", transform: uppercase }  # 태그

rounded:
  base: 0px                   # 전 컴포넌트 0. 샤프가 시그니처.

spacing:                      # 8px 베이스, 큰 배수만 사용
  xs: 8px
  sm: 16px
  md: 24px
  lg: 48px
  xl: 80px
  section: "clamp(48px,11vw,160px)"   # 섹션 수직 패딩 (모바일 하한 48px — WP7)
  gutter:  "clamp(20px,6vw,120px)"    # 외곽 여백(히어로/다크밴드만 풀블리드)
  maxWidth: 1280px
  gridCol: "clamp(20px,2.6vw,40px)"   # 상품 그리드 열간
  gridRow: "clamp(44px,5.5vw,72px)"   # 상품 그리드 행간(열간보다 큼)

motion:
  ease:      "cubic-bezier(0.22,1,0.36,1)"
  reveal:    "opacity 0→1 + translateY(18px) · 500–600ms · 1회"
  durations: "200–700ms · transform+opacity만"

components:
  ctaPrimary:                 # 화면당 단 하나의 액센트 '필'
    family: grotesk
    weight: 600
    size: "0.72rem"
    transform: uppercase
    tracking: "0.18em"
    padding: "1.05em 2.2em"
    background: "{colors.accent}"
    color: "{colors.bg}"
    border: "1px solid {colors.accent}"
    rounded: "{rounded.base}"
    hover: { background: transparent, color: "{colors.onDark}" }   # 다크 히어로 위 기준
  navLink:
    family: grotesk
    weight: 500
    tracking: "0.16em"
    transform: uppercase
    active: { color: "{colors.accent}", underline: "1px {colors.accent}, 7px 아래" }
  productCard:
    media:   { aspectRatio: "4/5", background: "{colors.panel}", rounded: 0, hover: "scale(1.03) · 1.2s" }
    titleFont: serifKo        # 책 제목만 명조 — 시그니처 대비
    metaFont:  grotesk
    structure: "박스/그림자 금지 · 위아래 1px {colors.line} 헤어라인으로만 구획"
    stockDot:  "{colors.accent} 5px 원"
---

## Overview

YEOBAEK BOOKS의 **Atelier Sans**는 "절제된 고급 럭셔리 — 비싸 보이지만 조용한" 동화책 셀렉트샵의 비주얼 시스템이다. 한 줄 정체성: **산세 그로테스크가 모든 구조를 대문자로 주도하고, 명조(세리프)는 오직 한국어 책·이야기 제목에만 등장해 따뜻한 대비점을 만든다. 색의 강조는 잉크 네이비 한 가지뿐.** 무드 레퍼런스는 29CM·젠틀몬스터·마거릿 호웰의 모던 미니멀.

토큰이나 규칙으로 명시되지 않은 상황에서의 상위 판단 기준: **요소를 더하기 전에 덜어내고, 위계는 크기·여백·대소문자로 만들며(굵기·색 아님), 의심되면 여백을 두 배로 한다.** 이 문서는 다른 프로젝트에서도 #9 디자인을 그대로 재현하기 위한 단일 진실 공급원(source of truth)이다 — 새 UI를 만들 때는 "모든 스타일 결정은 @DESIGN.md를 따르라"처럼 이 파일을 명시적으로 참조시킨다.

## Colors

순백(`#FFF`)·순흑(`#000`) **금지**. 모든 중립은 따뜻하게 보정돼 있다. 위 YAML 값이 정확한 hex이며, 역할은 다음과 같다.

- **중립 단계**가 깊이를 만든다: `bg`(페이지) → `surface`(카드) → `panel`(밴드/매트) → `line`(헤어라인) → `muted`/`grey`(텍스트 단계) → `ink`/`inkStrong`(본문·다크면).
- **`accent`(잉크 네이비 `#1B2A4A`)는 유일한 강조색이며, 화면의 5% 미만으로만** 다음에만 쓴다: ① 단 하나의 primary CTA '필', ② 활성 내비(텍스트+밑줄), ③ 재고 점(dot), ④ 에디션 숫자(`No. 01`), ⑤ eyebrow의 짧은 바, ⑥ 포커스 상태. **넓은 면을 네이비로 칠하지 않는다.**
- 다크 밴드/히어로/푸터 위에서는 `onDark`/`onDarkMuted`로 본문을, 헤어라인은 `rgba(201,195,182,0.16)`로 둔다.
- 대비: 본문 텍스트는 WCAG AA(4.5:1) 이상 유지. `muted`는 12px 이상 라벨에만(본문 금지).

```css
:root{
  --bg:#F4F1EA; --surface:#F8F5F0; --panel:#EDEAE3; --line:#E0DBD2;
  --muted:#A89F92; --grey:#736B5E; --ink:#23211E; --ink-strong:#16140F;
  --accent:#1B2A4A; --accent-hover:#122038; --accent-wash:rgba(27,42,74,.16);
}
```

## Typography

**세 폰트 시스템 + 한 가지 철칙.** 구조·라벨·헤드라인·가격은 전부 그로테스크 산세(`grotesk`, Archivo 우선), 본문·UI는 Pretendard(`sans`), 그리고 **명조(`serifKo`, Noto Serif KR)는 한국어 책 제목·이야기 제목에만** 쓴다 — 이 대비가 시안의 시그니처다. 굵기는 한 화면에서 2개를 넘기지 않는다(보통 grotesk 400/500/600 중 둘).

자간 3단 규칙: **대문자 라벨/내비는 넓게(`+0.14~0.20em`), 대형 그로테스크 헤드라인은 좁게(`-0.018~-0.025em`), 한글 본문은 0(양수 자간 절대 금지).** 한글 본문은 행간 1.75 + `word-break:keep-all`. 스케일·역할은 YAML `typography` 참조(hero / h2 / statement / productTitle / body / price / label).

폰트 로딩(드롭인):

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Jost:wght@300;400;500&family=Noto+Serif+KR:wght@300;400;500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
```

## Layout

12컬럼 사고, **콘텐츠 max-width 1280px**, 외곽 여백 `gutter`(80~120px desktop) — 본문은 절대 뷰포트 가장자리에 닿지 않는다. **히어로 이미지와 다크 에디토리얼 밴드만 풀블리드.** 섹션 수직 패딩은 `section`(96~160px desktop / 48px mobile).

비대칭 분할이 이 시안의 리듬이다: 인트로 **4/8**(좌측 sticky 라벨 / 우측 큰 산세 문장), 피처 **7/5**(이미지/텍스트), 컬렉션 헤드 **5/7**. 상품 그리드는 **타이트한 3단**(`gridCol` 열간 / `gridRow` 행간, **행간 > 열간**), 태블릿 2단·모바일 1단. 컬렉션 노트는 세로/가로 1px 헤어라인으로 칸을 나눈 3단 인덱스.

## Elevation & Depth

**그림자(box-shadow) 사용 금지.** 깊이는 세 가지로만 만든다: ① 중립 톤 단차(`surface`/`panel`), ② 1px 헤어라인(`line`), ③ 풀블리드 다크 밴드(`inkStrong`)와의 명암 대비. 카드는 떠 있지 않고 면 위에 '놓여' 있다. 히어로의 좌하단 가독성은 **아주 옅은 하단 그라데이션**(`linear-gradient(to top, rgba(22,20,15,.52), transparent 60%)`)으로 확보하되 — 이는 면 칠이 아니라 가독 보조다.

## Shapes

**모서리 반경 0(`rounded.base`). 전 컴포넌트 각진 형태** — 버튼·이미지·인풋·태그 모두. 샤프함이 곧 프리미엄 신호이며, 한 화면에서 둥근 모서리를 섞지 않는다. 구획은 박스가 아니라 헤어라인과 여백으로 한다.

### 예외 — 카카오 로그인 버튼 (유일)

`.kakao-btn`(`src/app/_components/account/KakaoLoginButton.tsx`)은 이 문서의 **radius 0**과 **잉크
네이비 단색 액센트** 규칙에서 명시적으로 벗어난다. 카카오 로그인 디자인 가이드
(developers.kakao.com/docs/ko/kakaologin/design-guide)가 아래를 *규정*으로 고정하기 때문이다 —
권장이 아니라 준수 사항이라 우리 토큰이 양보한다.

| 항목 | 카카오 규정 | 비고 |
|---|---|---|
| 컨테이너 | `#FEE500` | "규정에 벗어난 색상을 적용해서는 안 됩니다" |
| 심볼 | `#000000`, **생략 불가** | "심볼 없이 카카오 로그인 버튼을 구성할 수 없습니다" |
| 레이블 | `#000000 85%`, **'카카오 로그인'**(완성형) 또는 '로그인'(축약형) | '카카오로 시작하기'는 별도 제품인 **카카오 싱크**의 레이블 — 로그인 버튼에 쓰면 위반 |
| radius | **12px 고정** | 가이드 원문 "Fix 12px" |
| 폰트 | OS 기본 시스템 서체 | `--font-sans`(Pretendard)를 쓰지 않는 유일한 버튼 |

우리가 더한 것은 두 가지뿐이고 둘 다 규정 색을 건드리지 않는다: ① 아이보리 배경 위에서 노랑의
경계 대비가 1.18:1 밖에 안 되므로 `inset` 헤어라인으로 가장자리를 세운다(컴포넌트 식별 자체는
12.5:1 대비의 레이블이 담당 — WCAG 1.4.11), ② 가이드가 정하지 않은 hover/focus는 배경을 그대로
두고 헤어라인·포커스 링으로만 표현한다. 심볼 비율(높이 = 컨테이너 × 0.378, 좌측 인셋 = × 0.322)은
공식 PNG 자산 실측값이라 `--kakao-h`만 바꿔도 유지된다.

**다른 소셜 로그인이 추가되어도 이 예외를 일반화하지 말 것** — 각 브랜드 가이드가 요구하는
최소한만 예외로 두고, 그 외에는 이 문서의 토큰을 따른다.

## Components

정석 4개(나머지는 이 패턴을 따른다).

**1) Nav** — 좌측 대문자 그로테스크 워드마크(`weight 600 · tracking 0.34em`), 중앙 대문자 링크(`navLink`), 우측 `검색`·`BAG 0`. 활성 링크는 네이비 + 7px 아래 1px 네이비 밑줄. 스크롤 120px 후 아이보리 blur + 헤어라인으로 콘덴싱(84→60px). 모바일은 햄버거 드로어(다크 패널 + 아이보리 링크).

**2) Hero** — `min-height:100vh` 풀블리드 이미지(다크 `inkStrong` 배경, 이미지에 통일 그레이드 + `brightness .92`), 콘텐츠는 **좌하단**: eyebrow(네이비 바 + 대문자) → 거대한 대문자 그로테스크 헤드라인(`hero` 토큰, `.thin`으로 일부 단어 weight 400) → 한 줄: 본문 서브(Pretendard, 다크 위 `onDarkMuted`) + **단일 네이비 CTA 필**(`ctaPrimary`). 우측에 세로쓰기 인덱스 라벨(`writing-mode:vertical-rl`).

**3) Product Card** — 상단 행: `No. 0X`(네이비) + 태그(`microLabel`), 사이 1px 헤어라인. 미디어 4:5(`panel` 배경, 0-radius, hover scale 1.03). 본문: 카테고리(grotesk 대문자) → **제목(명조 `productTitle`)** → 설명(Pretendard) → 하단 헤어라인 위에 가격(grotesk 600) + 재고(네이비 dot + 대문자). 배지·별점·할인 표기 없음 — 태그는 텍스트뿐.

**4) Section Header / CTA** — 큰 대문자 그로테스크 제목(`h2`) + 우측 인라인 카테고리 내비(활성=네이비). primary CTA는 `ctaPrimary` 하나만(필), 그 외 행동은 텍스트 링크(`Read Note →`, hover시 화살표 5px 이동·네이비). 폼은 밑줄 1줄, `:focus-within`에 네이비.

## Do's and Don'ts

- **Do** — 구조·라벨·헤드라인은 전부 대문자 그로테스크. **명조는 한국어 책/이야기 제목에만.**
- **Do** — 액센트(네이비)는 화면당 primary 액션 하나 + 활성/점/숫자/포커스에만. 5% 미만.
- **Do** — 위계는 크기·여백·대소문자로. 박스·그림자 대신 헤어라인 + 톤 단차. 모서리는 전부 0.
- **Do** — 한글 본문 행간 1.75 / 자간 0 / `keep-all`. 한 화면 폰트 굵기 2개 이하.
- **Do** — 모션은 200~700ms ease-out, opacity+translateY(+최대 scale 1.03), `prefers-reduced-motion` 하드 가드.
- **Don't** — 순백 배경·순흑 텍스트, 네이비 외 2번째 강조색, 넓은 면 네이비 칠.
- **Don't** — 명조를 UI·라벨·가격·내비에 사용(제목 외 세리프 금지). 한글에 양수 자간.
- **Don't** — 둥근 모서리, 카드 그림자, 굵기·색으로 위계 만들기.
- **Don't(만들지 말 것)** — SALE 리본·빨간 가격·% 별표·카운트다운·스티키 프로모바·별점·자동재생 캐러셀·팝업. 조용함은 "없음"으로 강제한다.

---

### 참조 방법 (이 문서가 무시되지 않으려면)

파일을 두는 것만으로는 부족하다 — 에이전트가 매번 읽도록 연결한다: `CLAUDE.md`에 "모든 UI/스타일 결정은 @DESIGN.md를 따른다" 한 줄 추가 · `.cursor/rules` 또는 `.kiro/steering`에 배치 · UI 생성 프롬프트에서 `@DESIGN.md`를 명시적으로 참조. 제품이 자라면 이 문서를 거의 매 세션 갱신한다(낡은 문서는 무시되는 문서다). 구현 참고용 완성 페이지: `designs/09-atelier-sans.html`.
