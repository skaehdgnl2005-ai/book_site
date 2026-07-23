import type { CatalogTemplate } from "../catalog/templates";

/**
 * F077 — 미리보기 콘텐츠(플레이스홀더). The flip viewer's atomic unit is a 펼침면
 * (spread, 10:7): full-bleed scenes and left-text/right-art openings both live inside
 * this one unit, so mobile never shows half a scene. Until the backstage pipeline
 * delivers real 내지 assets (public/previews/<key>/spread-NN.webp, 10:7), each template
 * previews as typographic story-opening spreads — the same honest-placeholder pattern
 * as the gallery (F025) — closed by a CTA spread that returns the buyer to the wizard.
 */
export type PreviewSpread =
  | {
      kind: "story";
      id: string;
      text: string;
      /** "split" = 좌 글/우 그림 자리, "bleed" = 양면을 가로지르는 장면(10:7 풀블리드). */
      layout: "split" | "bleed";
    }
  | {
      /** F080 — 실제 내지 스프레드(10:7 webp, 워터마크·페이지번호는 파이프라인이 픽셀에 굽기). */
      kind: "image";
      id: string;
      src: string;
      alt: string;
    }
  | { kind: "cta"; id: string; text: string };

/**
 * F080 — 실물 내지 에셋 대장: public/previews/<key>/spread-01..NN.webp (10:7 · 장당
 * ≤300KB). fs는 클라이언트 번들에 유입 금지라 이 빌드타임 상수가 유일한 분기 근거이며,
 * 실제 파일과의 드리프트(개수·크기·비율·고아 디렉토리)는 preview-assets.test.ts가 Node
 * fs로 강제한다. 파이프라인이 새 템플릿 에셋을 드롭하면 여기 개수를 갱신하는 것이 등록
 * 절차의 전부다. 4장 미만 드롭은 데크를 전환하지 않는다(빈 책 금지 — 아래 게이트).
 */
export const PREVIEW_IMAGE_COUNTS: Record<string, number> = {
  birth: 4,
};

/** 데크 전환 최소 장수 — 이미지 데크도 완전한 책이어야 한다(플레이스홀더 계약과 동형). */
const MIN_IMAGE_DECK = 4;

export const PREVIEW_CTA_TEXT = "이야기의 끝은 아이의 이름으로 완성됩니다";
export const PREVIEW_CTA_BUTTON = "이 책 만들기";

/** 템플릿별 이야기 도입부 4문장 — 실제 원고가 아니라 톤을 전달하는 샘플 문장. */
const STORY_LINES: Record<string, [string, string, string, string]> = {
  birth: [
    "아주 조용한 밤, 세상은 작은 소식을 기다리고 있었어요.",
    "그리고 그날, 첫 울음소리가 방 안을 가득 채웠지요.",
    "엄마와 아빠는 오래 준비한 인사를 건넸어요. “만나서 반가워.”",
    "세상에 처음 온 아이에게, 모든 것이 첫 페이지였답니다.",
  ],
  hundred_days: [
    "백 번의 아침이 지나는 동안, 집 안의 시계는 조금 느리게 걸었어요.",
    "작은 손이 조금씩 힘을 내어 세상을 쥐어 보았지요.",
    "백 번째 밤, 가족들은 촛불 하나를 가만히 밝혔어요.",
    "기다림이 기적이 되는 날이 있다는 걸, 모두가 알게 되었답니다.",
  ],
  first_birthday: [
    "첫 번째 생일 아침, 햇살이 제일 먼저 방문을 두드렸어요.",
    "돌상 위에는 실과 붓과 쌀이 나란히 아이를 기다렸지요.",
    "작은 손이 천천히, 아주 천천히 하나를 골랐어요.",
    "일 년의 이야기가 한 권의 웃음으로 완성된 날이었답니다.",
  ],
  birthday: [
    "오늘은 일 년 중 가장 특별한 아침이에요.",
    "촛불이 하나씩 늘어날 때마다 이야기도 한 뼘씩 자랐지요.",
    "“후—” 하고 바람을 모으면, 소원이 방 안을 한 바퀴 돌아요.",
    "해마다 자라는 아이에게, 해마다 새로운 첫 장이 열린답니다.",
  ],
  admission: [
    "새 가방은 아직 조금 커서, 등 뒤에서 살짝 출렁였어요.",
    "교문 앞, 아이는 크게 숨을 한 번 들이쉬었지요.",
    "“잘 다녀올게요!” 그 한마디가 오늘의 제일 큰 용기였어요.",
    "새로운 시작 앞에 선 아이의 발걸음을, 오래 기억하고 싶었답니다.",
  ],
  first_steps: [
    "소파 끝을 잡은 작은 손이 오늘따라 근질근질했어요.",
    "한 발, 그리고 또 한 발 — 방바닥이 처음으로 넓어 보였지요.",
    "넘어져도 괜찮아요. 일어나는 법도 함께 배우는 중이니까요.",
    "처음 내디딘 한 걸음의 용기를, 이 책이 오래 간직할 거예요.",
  ],
  first_word: [
    "옹알옹알, 입 안에서 말들이 몸을 풀고 있었어요.",
    "어느 조용한 오후, 드디어 한마디가 또렷하게 태어났지요.",
    "온 가족이 하던 일을 멈추고 아이 곁으로 모여들었어요.",
    "아이가 처음 부른 그 한마디로, 이 이야기는 시작된답니다.",
  ],
  became_sibling: [
    "집에 아주 작은 손님이 온다는 소식이 들려왔어요.",
    "포대기 속 얼굴을 처음 본 날, 마음이 간질간질했지요.",
    "“내가 형아야.” 조그만 목소리가 아주 단단했어요.",
    "동생을 맞이한 날, 아이의 마음은 한 뼘 더 자랐답니다.",
  ],
};

/** Unknown keys (future DB templates) preview safely instead of rendering an empty book. */
const FALLBACK_LINES: [string, string, string, string] = [
  "첫 장을 넘기면, 아이의 이름이 이야기가 되어 기다리고 있어요.",
  "페이지마다 아이만을 위한 장면이 천천히 펼쳐지지요.",
  "세상에 단 한 권뿐인 책은 이렇게 시작된답니다.",
  "이야기의 주인공은, 언제나 우리 아이예요.",
];

export function previewSpreadsFor(
  template: Pick<CatalogTemplate, "key" | "label">,
): PreviewSpread[] {
  const cta = { kind: "cta" as const, id: `${template.key}-cta`, text: PREVIEW_CTA_TEXT };

  // F080 — 에셋 보유 템플릿은 실제 내지 이미지 데크. CTA 장은 이미지 여부와 무관하게
  // 마지막을 지킨다. 대장에 없는(또는 4장 미만인) 템플릿은 아래 타이포 플레이스홀더로.
  const imageCount = PREVIEW_IMAGE_COUNTS[template.key] ?? 0;
  if (imageCount >= MIN_IMAGE_DECK) {
    return [
      ...Array.from({ length: imageCount }, (_, i) => ({
        kind: "image" as const,
        id: `${template.key}-image-${i + 1}`,
        src: `/previews/${encodeURIComponent(template.key)}/spread-${String(i + 1).padStart(2, "0")}.webp`,
        alt: `『${template.label}』 미리보기 ${i + 1}번째 펼침면`,
      })),
      cta,
    ];
  }

  const lines = STORY_LINES[template.key] ?? FALLBACK_LINES;
  return [
    ...lines.map((text, i) => ({
      kind: "story" as const,
      id: `${template.key}-story-${i + 1}`,
      text,
      // 홀수 번째(둘째·넷째)를 풀블리드 장면으로 — split/bleed 두 구성을 모두 시연.
      layout: i % 2 === 1 ? ("bleed" as const) : ("split" as const),
    })),
    cta,
  ];
}
