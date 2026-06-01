import { describe, it, expect } from "vitest";
import {
  storeAsset,
  assetLogAttrs,
  receiveUpload,
  type StoredAsset,
} from "../../src/lib/assets";
import { emit } from "../../src/lib/observability";

// F029 — child photo / QR video stored as an access-controlled Asset (storageKey,
// contentType, byteSize), never inline/public; upload input is untrusted(); and no
// PII (filename / child name / raw bytes) may reach logs / traces / fixtures (E3/E4).

// A realistic upload whose *filename* embeds the child's name — the exact PII we must
// never persist, log, or echo. The bytes stand in for binary content.
const CHILD_NAME = "김도윤"; // 아동 이름 — PII (sensitive)
const PHOTO_FILENAME = `${CHILD_NAME}_백일사진.jpg`;
const PHOTO_BYTES = new TextEncoder().encode("JPEGDATA-binary-content-not-for-logs");

// Opaque random object keys (UUID v4 shape): prefix/<uuid><ext>, never PII-derived.
const KEY = (prefix: string, ext: string) =>
  new RegExp(`^${prefix}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\${ext}$`);

function photoUpload(): ReturnType<typeof receiveUpload> {
  return receiveUpload({
    filename: PHOTO_FILENAME,
    contentType: "image/jpeg",
    bytes: PHOTO_BYTES,
  });
}

describe("F029 storeAsset — opaque, access-controlled key (no PII)", () => {
  it("derives an opaque storageKey, not the filename or child name", () => {
    const asset = storeAsset("CHILD_PHOTO", photoUpload());
    expect(asset.storageKey).toMatch(KEY("child-photo", ".jpg"));
    expect(asset.storageKey).not.toContain(CHILD_NAME);
    expect(asset.storageKey).not.toContain("백일사진");
    expect(asset.storageKey).not.toContain(PHOTO_FILENAME);
  });

  it("produces an object-storage key, never a public/inline URL", () => {
    const { storageKey } = storeAsset("CHILD_PHOTO", photoUpload());
    expect(storageKey).not.toMatch(/^https?:/i);
    expect(storageKey).not.toContain("://");
    expect(storageKey.startsWith("data:")).toBe(false);
  });

  it("records contentType + byteSize and never the raw bytes", () => {
    const asset = storeAsset("CHILD_PHOTO", photoUpload());
    expect(asset.contentType).toBe("image/jpeg");
    expect(asset.byteSize).toBe(PHOTO_BYTES.length);
    // The persistable record carries ONLY safe descriptors — no bytes, no filename.
    expect(Object.keys(asset).sort()).toEqual([
      "byteSize",
      "contentType",
      "kind",
      "storageKey",
    ]);
    expect(JSON.stringify(asset)).not.toContain("JPEGDATA");
  });

  it("uses random keys: identical bytes yield DIFFERENT keys (no cross-record correlation)", () => {
    // For sensitive PII, the key must not be a function of the contents — otherwise
    // two children sharing a photo would be linkable by an identical storageKey.
    const a = storeAsset("CHILD_PHOTO", photoUpload());
    const b = storeAsset("CHILD_PHOTO", photoUpload());
    expect(a.storageKey).not.toBe(b.storageKey);
    expect(b.storageKey).toMatch(KEY("child-photo", ".jpg"));
  });
});

describe("F029 trust boundary (E4) — uploads must be untrusted()", () => {
  it("rejects an upload not tagged untrusted() at the boundary", () => {
    // A trusted-tagged upload must be refused: provenance can't be silently assumed.
    expect(() =>
      storeAsset("CHILD_PHOTO", { trust: "trusted", value: photoUpload().value }),
    ).toThrow(/untrusted/);
  });

  it("receiveUpload tags as untrusted and preserves the payload unchanged", () => {
    const input = {
      filename: PHOTO_FILENAME,
      contentType: "image/jpeg",
      bytes: PHOTO_BYTES,
    };
    const tagged = receiveUpload(input);
    expect(tagged.trust).toBe("untrusted");
    expect(tagged.value).toBe(input); // wraps, does not copy/mutate
    expect(() => storeAsset("CHILD_PHOTO", tagged)).not.toThrow();
  });
});

describe("F029 validation — kind↔contentType, never echoing PII", () => {
  it("enforces kind↔contentType (a video is not a child photo)", () => {
    const video = receiveUpload({
      filename: `${CHILD_NAME}_영상.mp4`,
      contentType: "video/mp4",
      bytes: new TextEncoder().encode("MOOV-video-bytes"),
    });
    expect(() => storeAsset("CHILD_PHOTO", video)).toThrow();
    expect(storeAsset("QR_VIDEO", video).storageKey).toMatch(KEY("qr-video", ".mp4"));
  });

  it("stores an OTHER-kind asset (application/pdf) under the asset/ prefix", () => {
    const doc = receiveUpload({
      filename: "의뢰서.pdf",
      contentType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7 document bytes"),
    });
    expect(storeAsset("OTHER", doc).storageKey).toMatch(KEY("asset", ".pdf"));
  });

  it("rejects contentTypes that collide with Object.prototype members (allowlist bypass)", () => {
    // An untrusted contentType must never resolve an inherited prototype member and
    // sneak past the allowlist (would forge a malformed key / defeat kind enforcement).
    for (const ct of ["toString", "valueOf", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(() =>
        storeAsset(
          "CHILD_PHOTO",
          receiveUpload({ filename: "x.jpg", contentType: ct, bytes: PHOTO_BYTES }),
        ),
      ).toThrow(/Unsupported contentType/);
    }
  });

  it("matches the allowlist strictly (case-sensitive, no MIME parameters)", () => {
    for (const ct of ["IMAGE/JPEG", "image/jpeg; charset=utf-8", "image/jpg"]) {
      expect(() =>
        storeAsset(
          "CHILD_PHOTO",
          receiveUpload({ filename: "x.jpg", contentType: ct, bytes: PHOTO_BYTES }),
        ),
      ).toThrow(/Unsupported contentType/);
    }
  });

  it("rejects an unsupported contentType without leaking filename or bytes", () => {
    const bad = receiveUpload({
      filename: `${CHILD_NAME}_malware.exe`,
      contentType: "application/x-msdownload",
      bytes: new TextEncoder().encode("MZ-executable-bytes"),
    });
    let message = "";
    try {
      storeAsset("CHILD_PHOTO", bad);
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain(CHILD_NAME);
    expect(message).not.toContain("malware");
    expect(message).not.toContain("MZ-executable-bytes");
    // The non-PII contentType may appear (it is low-cardinality, not sensitive).
    expect(message).toContain("application/x-msdownload");
  });

  it("refuses an empty upload", () => {
    const empty = receiveUpload({
      filename: "blank.jpg",
      contentType: "image/jpeg",
      bytes: new Uint8Array(0),
    });
    expect(() => storeAsset("CHILD_PHOTO", empty)).toThrow(/empty/i);
  });
});

describe("F029 trace projection — PII-free through the real log sink (E3)", () => {
  it("assetLogAttrs exposes only safe descriptors; no filename, child name, or bytes", () => {
    const attrs = assetLogAttrs(storeAsset("CHILD_PHOTO", photoUpload()));
    expect(Object.keys(attrs).sort()).toEqual([
      "byteSize",
      "contentType",
      "kind",
      "storageKey",
    ]);
    const line = JSON.stringify(attrs);
    expect(line).not.toContain(CHILD_NAME);
    expect(line).not.toContain("백일사진");
    expect(line).not.toContain(PHOTO_FILENAME);
    expect(line).not.toContain("JPEGDATA");
  });

  it("emits a PII-free line through the real observability sink", () => {
    // The spec names "logs/traces": prove no PII survives the actual emit() serializer,
    // not just assetLogAttrs in isolation. (Importing emit is allowed; not editing it.)
    const asset = storeAsset("CHILD_PHOTO", photoUpload());
    let line = "";
    emit(
      { ts: "t", sessionId: "s", kind: "tool", name: "asset.store", attrs: assetLogAttrs(asset) },
      (l) => {
        line = l;
      },
    );
    expect(line).not.toContain(CHILD_NAME);
    expect(line).not.toContain("백일사진");
    expect(line).not.toContain(PHOTO_FILENAME);
    expect(line).not.toContain("JPEGDATA");
    expect(line).toContain("CHILD_PHOTO"); // the safe descriptor did make it onto the line
  });

  it("redacts secrets/emails defensively even if a key were crafted to carry one", () => {
    const sneaky: StoredAsset = {
      kind: "OTHER",
      storageKey: "asset/leak-buyer@example.com",
      contentType: "image/png",
      byteSize: 1,
    };
    const attrs = assetLogAttrs(sneaky);
    expect(String(attrs.storageKey)).toContain("***@***");
    expect(String(attrs.storageKey)).not.toContain("buyer@example.com");
  });
});
