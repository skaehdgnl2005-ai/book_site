import { describe, it, expect } from "vitest";
import {
  previewSpreadsFor,
  PREVIEW_CTA_TEXT,
  PREVIEW_IMAGE_COUNTS,
  type PreviewSpread,
} from "../../src/app/_components/preview/previewSpreads";
import { getTemplatesByCategory } from "../../src/app/_components/catalog/templates";

// F077 — 동화책 미리보기(펼침면 플립 뷰어)의 콘텐츠 계약. + F080 — 실제 내지 이미지 분기.
// The E2E exercises one template's viewer end-to-end; these units cover what it can't:
// EVERY catalog template must yield a complete preview deck — image spreads (assets on
// record in PREVIEW_IMAGE_COUNTS) or bespoke typographic story spreads — always 4+ and
// always closed by exactly one final CTA spread. Unknown keys (future DB rows) must
// fall back safely instead of rendering an empty book.

// Hermetic: no DATABASE_URL in unit env → the seed-mirror path (ADR-0002).
const ALL_TEMPLATES = [
  ...(await getTemplatesByCategory("ANNIVERSARY")),
  ...(await getTemplatesByCategory("FIRST_MOMENT")),
];

const isStory = (s: PreviewSpread): s is Extract<PreviewSpread, { kind: "story" }> =>
  s.kind === "story";
const isImage = (s: PreviewSpread): s is Extract<PreviewSpread, { kind: "image" }> =>
  s.kind === "image";

const FALLBACK = previewSpreadsFor({ key: "__unknown_future_key__", label: "미래책" });

describe("previewSpreadsFor — every catalog template has a full deck", () => {
  it("catalog mirrors the seeded 8 templates (guard for the loop below)", () => {
    expect(ALL_TEMPLATES.length).toBe(8);
  });

  for (const template of ALL_TEMPLATES) {
    const hasAssets = (PREVIEW_IMAGE_COUNTS[template.key] ?? 0) > 0;

    it(`${template.key} (${template.label}): ${hasAssets ? "image deck (F080)" : "≥4 story spreads"} + final CTA`, () => {
      const spreads = previewSpreadsFor(template);
      const last = spreads[spreads.length - 1];

      // Shared deck contract (빈 책 금지): 4+ content spreads, exactly one CTA, last.
      expect(spreads.length).toBeGreaterThanOrEqual(5);
      expect(last.kind).toBe("cta");
      if (last.kind === "cta") expect(last.text).toBe(PREVIEW_CTA_TEXT);
      expect(spreads.filter((s) => s.kind === "cta")).toHaveLength(1);
      // Ids are unique (PageFlip page keys / React keys depend on this).
      expect(new Set(spreads.map((s) => s.id)).size).toBe(spreads.length);

      if (hasAssets) {
        // F080 — asset-backed template: EVERY content spread is an image, in file
        // order, with the public URL naming scheme and the reader-facing alt copy.
        const images = spreads.filter(isImage);
        expect(images.length).toBe(PREVIEW_IMAGE_COUNTS[template.key]);
        expect(images.length).toBeGreaterThanOrEqual(4);
        expect(spreads.filter(isStory)).toHaveLength(0);
        images.forEach((img, i) => {
          const nn = String(i + 1).padStart(2, "0");
          expect(img.src).toBe(`/previews/${template.key}/spread-${nn}.webp`);
          expect(img.alt).toBe(`『${template.label}』 미리보기 ${i + 1}번째 펼침면`);
        });
      } else {
        const stories = spreads.filter(isStory);
        expect(stories.length).toBeGreaterThanOrEqual(4);
        // Every story line is a real sentence.
        for (const s of stories) expect(s.text.trim().length).toBeGreaterThan(5);
        // Bespoke content: a catalog template must NOT silently render the generic
        // fallback deck (that would mean its STORY_LINES entry is missing).
        const fallbackTexts = FALLBACK.filter(isStory).map((s) => s.text);
        expect(stories.map((s) => s.text)).not.toEqual(fallbackTexts);
      }
    });
  }
});

describe("previewSpreadsFor — unknown key fallback", () => {
  it("still yields a complete typographic deck (4+ stories, CTA last, no images)", () => {
    expect(FALLBACK.filter(isStory).length).toBeGreaterThanOrEqual(4);
    expect(FALLBACK.filter(isImage)).toHaveLength(0);
    expect(FALLBACK[FALLBACK.length - 1].kind).toBe("cta");
  });
});
