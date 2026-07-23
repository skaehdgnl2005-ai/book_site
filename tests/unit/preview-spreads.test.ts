import { describe, it, expect } from "vitest";
import {
  previewSpreadsFor,
  PREVIEW_CTA_TEXT,
  type PreviewSpread,
} from "../../src/app/_components/preview/previewSpreads";
import { getTemplatesByCategory } from "../../src/app/_components/catalog/templates";

// F077 — 동화책 미리보기(펼침면 플립 뷰어)의 플레이스홀더 콘텐츠 계약.
// The E2E exercises one template's viewer end-to-end; these units cover what it can't:
// EVERY catalog template must yield a complete preview deck (4+ story spreads + a final
// CTA spread), and unknown keys (future DB rows) must fall back safely instead of
// rendering an empty book.

// Hermetic: no DATABASE_URL in unit env → the seed-mirror path (ADR-0002).
const ALL_TEMPLATES = [
  ...(await getTemplatesByCategory("ANNIVERSARY")),
  ...(await getTemplatesByCategory("FIRST_MOMENT")),
];

const FALLBACK = previewSpreadsFor({ key: "__unknown_future_key__", label: "미래책" });

describe("previewSpreadsFor — every catalog template has a full deck", () => {
  it("catalog mirrors the seeded 8 templates (guard for the loop below)", () => {
    expect(ALL_TEMPLATES.length).toBe(8);
  });

  for (const template of ALL_TEMPLATES) {
    it(`${template.key} (${template.label}): ≥4 story spreads + final CTA, bespoke lines`, () => {
      const spreads = previewSpreadsFor(template);
      const stories = spreads.filter((s) => s.kind === "story");
      const last = spreads[spreads.length - 1];

      expect(stories.length).toBeGreaterThanOrEqual(4);
      expect(last.kind).toBe("cta");
      expect(last.text).toBe(PREVIEW_CTA_TEXT);
      // Exactly one CTA spread, and it is last.
      expect(spreads.filter((s) => s.kind === "cta")).toHaveLength(1);
      // Every story line is a real sentence.
      for (const s of stories) expect(s.text.trim().length).toBeGreaterThan(5);
      // Ids are unique (PageFlip page keys / React keys depend on this).
      expect(new Set(spreads.map((s) => s.id)).size).toBe(spreads.length);
      // Bespoke content: a catalog template must NOT silently render the generic
      // fallback deck (that would mean its STORY_LINES entry is missing).
      const fallbackTexts = FALLBACK.filter((s: PreviewSpread) => s.kind === "story").map(
        (s) => s.text,
      );
      expect(stories.map((s) => s.text)).not.toEqual(fallbackTexts);
    });
  }
});

describe("previewSpreadsFor — unknown key fallback", () => {
  it("still yields a complete deck (4+ stories, CTA last)", () => {
    expect(FALLBACK.filter((s) => s.kind === "story").length).toBeGreaterThanOrEqual(4);
    expect(FALLBACK[FALLBACK.length - 1].kind).toBe("cta");
  });
});
