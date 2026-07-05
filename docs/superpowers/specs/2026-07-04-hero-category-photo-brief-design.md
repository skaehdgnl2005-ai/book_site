# 사진 아트디렉션 브리프 — 홈 히어로 + 카테고리 카드 (2026-07-04)

> 목적: 홈(`src/app/page.tsx`)의 히어로 섹션과 카테고리 선택 영역에 실사 사진을 추가한다.
> 사진은 사용자가 외부(AI 생성)에서 준비하고, 이 문서는 그 **생성 기준(브리프)** 이다.
> 구현(마크업/CSS/next-image 최적화)은 사진 수령 후 별도 feature로 진행한다.

## 판단 근거 (요약)

- **슬라이드쇼는 하지 않는다.** `DESIGN.md` Don'ts가 자동재생 캐러셀을 명시적으로 금지
  ("조용함은 '없음'으로 강제한다"). 성능(LCP p95 < 2s 예산)과 모바일 데이터 측면에서도
  단일 컷이 유리. → 히어로는 브레이크포인트별 강한 한 컷.
- **실사(포토리얼)로 통일.** 실물 책(자석 케이스·카드 키트)을 파는 브랜드이므로
  일러스트 히어로는 제품 오인을 부른다. 첨부 시안도 실사.
- 히어로는 `DESIGN.md` 정식 스펙(풀블리드, `inkStrong` 배경, 이미지에 `brightness .92`
  + 좌하단 가독용 하단 그라데이션, 콘텐츠 좌하단)을 따르는 전제로 구도를 정한다.
- 카테고리 카드 미디어는 시스템 표준 **4:5** (`productCard.media.aspectRatio`)를 따른다.

## 공통 톤 가이드 (모든 컷 적용)

1. **실사, 자연광.** 창가 사이드광의 부드러운 낮 빛. 스튜디오 플래시 느낌 금지.
2. **웜 뉴트럴 팔레트.** 배경·소품·의상은 크림/아이보리/베이지/웜그레이
   (`#F4F1EA` Cloud Ivory 계열) — 사이트 배경과 톤이 이어져야 한다.
   순백·순흑 면 금지. 강한 원색(빨강·파랑·형광) 소품 금지 — 사이트의 유일한
   강조색은 잉크 네이비이므로 사진이 색으로 소리 지르면 안 된다.
3. **저채도·저대비, 따뜻한 그레이드.** "비싸 보이지만 조용한" (29CM·Margaret Howell·Aesop 무드).
4. **한국인 가족/아기.**
5. **판독 가능한 글자 금지.** 책 페이지·포스터·라벨의 텍스트는 비스듬한 각도나
   아웃포커스로 판독 불가하게 (AI 생성 한글 텍스트는 브랜드를 깨뜨림). 워터마크·로고 금지.
6. **여백 많은 미니멀 구성.** 소품 최소화. "의심되면 여백을 두 배로."
7. **포맷:** 최고 해상도 PNG 또는 최고품질 JPG 원본, sRGB. WebP/AVIF 변환·리사이즈는
   구현 시 next/image가 처리.
8. 사이트가 `brightness .92` + 하단 그라데이션을 덧입히므로 **약간 밝게** 생성.

## 필요한 사진: 총 5컷

### 1. `hero-desktop` — 히어로 데스크톱 (1컷)

- **크기/비율:** 2880×1620 이상 (16:9). 울트라와이드 크롭 여유를 위해 핵심 피사체는
  가로 55~85% 구간(우측)에.
- **장면:** 크림 톤 거실 소파, 창가. 엄마(또는 아빠)와 4~6세 아이가 그림책을 함께
  보며 웃는 장면. 책은 펼쳐져 있되 내용 판독 불가.
- **구도 제약:**
  - 좌측 40%: 저디테일·중간~어두운 밝기 영역(커튼 그늘, 벽) — 헤드라인+서브+CTA 자리.
  - 하단 20%: 그라데이션이 덮이므로 중요 요소 배치 금지.
  - 시선은 책(중앙) 방향 — 화면 밖을 보지 않게.

### 2. `hero-mobile` — 히어로 모바일 (1컷)

- **크기/비율:** 1440×2560 (9:16) 세로.
- **장면:** 1번과 같은 장면·같은 인물·같은 광원의 세로 앵글 (톤 연속성 필수).
- **구도 제약:** 피사체는 상~중단. 하단 1/3은 저디테일 — 텍스트+CTA가 오버레이됨.

### 3~5. 카테고리 카드 (각 1컷, 공통: 4:5 세로, 1600×2000 이상)

공통 구도 제약: 핵심 피사체를 **중앙 60% 안에** (모바일 1단/데스크톱 3단 크롭 차이를
흡수). 하단 25%는 단순하게 (텍스트 플레이트/크롭 가능성).

- **3. `cat-anniversary` (기념일):** 촛불 켠 생일 케이크 + 크라프트/아이보리 포장 선물,
  따뜻한 저녁 빛. 케이크에 숫자 토퍼·레터링 금지. 사람 없거나 손만.
- **4. `cat-first-moments` (첫 순간들):** 부모 손을 잡고 첫 걸음마 하는 아기,
  밝은 낮의 아이보리 톤 거실. 아기 표정이 주인공.
- **5. `cat-custom` (맞춤 제작):** 아틀리에 작업 테이블 — 연필 스케치, 색연필,
  가제본 그림책 교정지. 사람 없음 또는 손만. 글자 판독 불가. 종이·나무 질감 강조.

## 생성 프롬프트 (영문, 그대로 사용 가능)

공통 서픽스: `..., warm cream and ivory tones, soft natural window light, muted
low-saturation color grade, minimal quiet composition, editorial lifestyle photography,
no legible text, no logos --style photorealistic`

1. **hero-desktop:** "Korean mother and young child sitting on a cream linen sofa by a
   bright window, reading a picture book together and smiling, subjects on the right
   two-thirds of frame, calm shaded low-detail wall area on the left third, 16:9 wide"
2. **hero-mobile:** "Same scene, vertical 9:16 crop: Korean mother and child on cream
   sofa reading a picture book, subjects in upper-middle of frame, soft low-detail
   foreground in lower third"
3. **cat-anniversary:** "Birthday cake with lit candles and ivory kraft-wrapped gifts on
   a wooden table, warm evening candlelight, no cake topper text, 4:5 vertical"
4. **cat-first-moments:** "Korean baby taking first steps holding parent's hands,
   bright ivory-toned living room, daylight, joyful expression, 4:5 vertical"
5. **cat-custom:** "Artist's worktable with pencil sketches, colored pencils and an
   unbound picture-book proof, hands only, paper and wood textures, illegible pages,
   4:5 vertical"

## 수령 후 구현 메모 (다음 세션용)

- 파일은 위 이름으로 `public/images/`에 배치 예정. 히어로는 `<Image>` art direction
  (desktop/mobile `<picture>` 소스 분기), `priority` + `sizes` 지정으로 LCP 예산 준수.
- 히어로 텍스트 색은 다크 이미지 위 `onDark`/`onDarkMuted`로 전환 필요
  (현재는 라이트 배경용 `ink`/`grey`).
- 카테고리 카드에 4:5 미디어 블록 추가 (`panel` 배경, radius 0, hover scale 1.03 · 1.2s).
- 후보를 슬롯당 2~3안 생성해 오면 톤 일관성 기준으로 최종 1안씩 선정 권장.

---

## 부록 (2026-07-05, F048) — 추가 1컷: `kit-lifestyle`

홈 "한 권에 담기는 것"(구성품) 섹션의 미디어 슬롯용. 현재는 정직한 `--panel` 매트
("실물 사진 준비 중" — 갤러리와 같은 기준)로 출고되었고, 이 컷이 도착하면
`src/app/_components/home/KitSection.tsx`의 매트를 CategoryCard 패턴의
`next/image fill`로 교체하면 된다.

- **파일명/위치:** `public/images/kit-lifestyle.png`
- **크기/비율:** 4:5 세로, 1600×2000 이상 (카테고리 카드와 동일 규격)
- **장면:** 크림 톤 테이블 위, 아이보리 포장(또는 무지 크라프트) 선물 꾸러미를 여는
  부모·아이의 손. **실제 제품(자석 외함·카드)의 근접 재현은 금지** — 실물이 아직
  없으므로 제품 오인을 부르지 않는 "선물을 여는 순간"의 분위기 컷으로 한정한다.
- **공통 톤 가이드 전부 적용** (자연광·웜 뉴트럴·저채도·판독 가능한 글자 금지·여백).
- **생성 프롬프트:** "Parent and child hands opening an ivory kraft-wrapped gift
  bundle on a cream table, soft natural window light, warm neutral tones, minimal
  quiet composition, editorial lifestyle photography, no legible text, no logos,
  4:5 vertical --style photorealistic"
