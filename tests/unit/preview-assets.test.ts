import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { PREVIEW_IMAGE_COUNTS } from "../../src/app/_components/preview/previewSpreads";

// F080 — 에셋 대장 ↔ 실파일 드리프트 가드. The client bundle must never touch fs, so
// the asset ledger is a build-time constant (PREVIEW_IMAGE_COUNTS); THIS test is where
// the filesystem truth is enforced instead (vitest runs in Node): every ledger entry
// must match real files under public/previews/<key>/ — contiguous spread-01..NN names,
// the ≤300KB per-spread budget, and the 10:7 spread contract (design §에셋 계약) — and
// every directory that exists must be on the ledger (an orphan drop means someone
// forgot to update the constant, i.e. the assets would silently never render).

const PREVIEWS_DIR = resolve(process.cwd(), "public", "previews");
const MAX_BYTES = 300 * 1024;

/** Minimal WebP header parser (RIFF → VP8X canvas / VP8 lossy frame / VP8L stream). */
function webpDimensions(buf: Buffer): { w: number; h: number } {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("not a RIFF/WEBP file");
  }
  const fourCC = buf.toString("ascii", 12, 16);
  if (fourCC === "VP8X") {
    // payload@20: flags(1) reserved(3) then 24-bit LE canvasW-1 / canvasH-1.
    return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  }
  if (fourCC === "VP8 ") {
    // lossy payload@20: frame tag(3) sync 9D 01 2A(3) then 14-bit LE width/height.
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) {
      throw new Error("bad VP8 sync code");
    }
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  if (fourCC === "VP8L") {
    // lossless payload@20: 0x2F signature then 28 bits: (w-1):14 (h-1):14.
    if (buf[20] !== 0x2f) throw new Error("bad VP8L signature");
    const bits = buf.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`unknown webp chunk ${fourCC}`);
}

describe("preview assets — ledger matches the real files (F080)", () => {
  it("ledger has at least one asset-backed template", () => {
    expect(Object.keys(PREVIEW_IMAGE_COUNTS).length).toBeGreaterThanOrEqual(1);
  });

  for (const [key, count] of Object.entries(PREVIEW_IMAGE_COUNTS)) {
    it(`${key}: ${count} spreads on disk — contiguous names, ≤300KB each, 10:7`, () => {
      // A deck only switches to images when it is still a FULL book (빈 책 금지).
      expect(count).toBeGreaterThanOrEqual(4);

      const dir = resolve(PREVIEWS_DIR, key);
      const files = readdirSync(dir)
        .filter((f) => /^spread-\d{2}\.webp$/.test(f))
        .sort();
      expect(files).toEqual(
        Array.from({ length: count }, (_, i) => `spread-${String(i + 1).padStart(2, "0")}.webp`),
      );

      for (const f of files) {
        const path = resolve(dir, f);
        expect(statSync(path).size, `${key}/${f} exceeds the 300KB budget`).toBeLessThanOrEqual(
          MAX_BYTES,
        );
        const { w, h } = webpDimensions(readFileSync(path));
        expect(w * 7, `${key}/${f} is ${w}×${h}, not 10:7`).toBe(h * 10);
      }
    });
  }

  it("no orphan asset directories (drops must be registered on the ledger)", () => {
    let dirs: string[] = [];
    try {
      dirs = readdirSync(PREVIEWS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      // public/previews absent entirely — fine only when the ledger is empty too
      // (asserted above to be non-empty, so reaching here should fail the run).
    }
    for (const dir of dirs) {
      expect(
        PREVIEW_IMAGE_COUNTS[dir],
        `public/previews/${dir}/ exists but is not on PREVIEW_IMAGE_COUNTS — it would never render`,
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
