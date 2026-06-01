import { randomUUID } from "node:crypto";
import { redact } from "./env";
import { untrusted, type Tagged } from "./guardrails";

/**
 * Access-controlled asset storage for sensitive uploads — child photos and QR
 * videos (F029). Two safety properties this module exists to guarantee:
 *
 *  1. **No PII in the persistable record / logs / traces (E3).** The original
 *     `filename` (which often embeds the child's name) and the raw `bytes` are
 *     consumed at the boundary and never stored. The `storageKey` is an *opaque,
 *     randomly generated* object key — never derived from the filename/child name,
 *     never from the file contents, and never a public/inline URL. Because the key
 *     is random, no two records can be correlated through it (identical photo bytes
 *     do NOT collapse to one key). `assetLogAttrs()` is the only sanctioned way to
 *     put an asset on a trace.
 *  2. **Untrusted by provenance (E4).** Uploads arrive from buyers/admins, so they
 *     are wrapped with `untrusted()` (`receiveUpload`) and `storeAsset` refuses
 *     anything not tagged untrusted — provenance is explicit, never assumed.
 *
 * Pure + DB-independent (ADR-0002): this prepares the record to persist (mirrors
 * the Prisma `Asset` model); the actual object-storage PUT + DB write happen in
 * the caller, behind authorization.
 */

export type AssetKind = "CHILD_PHOTO" | "QR_VIDEO" | "OTHER";

/**
 * A raw inbound upload. `filename` and `bytes` are PII-bearing and MUST NOT be
 * persisted, logged, traced, or echoed in errors — only `contentType`/size escape.
 */
export interface UploadInput {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

/**
 * The persistable Asset record (mirrors `prisma.Asset`). `storageKey` is an opaque
 * object-storage key, NOT a public URL: access is granted out-of-band by an
 * authorized, server-side signer — assets are never served inline/public.
 */
export interface StoredAsset {
  kind: AssetKind;
  storageKey: string;
  contentType: string;
  byteSize: number;
}

// Per-kind contentType allowlist → file extension. The extension is derived from the
// (low-cardinality, non-PII) contentType, never from the untrusted filename, so the
// key can never leak the original name. Matched strictly (exact, case-sensitive).
const EXT_BY_TYPE: Record<AssetKind, Record<string, string>> = {
  CHILD_PHOTO: {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
  },
  QR_VIDEO: {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
  },
  OTHER: {
    "application/pdf": ".pdf",
  },
};

const KEY_PREFIX: Record<AssetKind, string> = {
  CHILD_PHOTO: "child-photo",
  QR_VIDEO: "qr-video",
  OTHER: "asset",
};

/**
 * Tag an inbound upload as untrusted at the trust boundary (E4). Call sites that
 * receive a buyer/admin upload wrap it here before `storeAsset()`.
 */
export function receiveUpload(raw: UploadInput): Tagged<UploadInput> {
  return untrusted(raw);
}

/**
 * Validate an untrusted upload and produce its access-controlled `StoredAsset`.
 * Throws (PII-safe message) on the wrong trust tag, an unsupported contentType for
 * the kind, or an empty body.
 */
export function storeAsset(kind: AssetKind, upload: Tagged<UploadInput>): StoredAsset {
  if (upload.trust !== "untrusted") {
    throw new Error(
      "Asset upload must be tagged untrusted() at the trust boundary (E4).",
    );
  }
  const { contentType, bytes } = upload.value;

  // Own-property lookup only: an untrusted contentType like "toString"/"constructor"/
  // "__proto__" must NOT resolve an inherited Object.prototype member and slip past
  // the allowlist (that would defeat the kind↔contentType check and forge the key).
  const exts = EXT_BY_TYPE[kind];
  const ext = Object.prototype.hasOwnProperty.call(exts, contentType)
    ? exts[contentType]
    : undefined;
  if (!ext) {
    // PII-safe: names only the kind + (non-PII) contentType — never filename/bytes.
    // Redacted defensively in case a crafted contentType echoes a secret/email.
    throw new Error(
      redact(`Unsupported contentType "${contentType}" for asset kind ${kind}.`),
    );
  }
  if (bytes.length === 0) {
    throw new Error(`Refusing to store an empty ${kind} asset.`);
  }

  return {
    kind,
    storageKey: `${KEY_PREFIX[kind]}/${randomUUID()}${ext}`,
    contentType,
    byteSize: bytes.length,
  };
}

/**
 * PII-free projection safe to attach to a trace/log line (pass to
 * `observability.emit`). It exposes ONLY non-PII descriptors — the filename, child
 * name, and raw bytes are excluded structurally upstream and never reach here.
 * `redact()` is a secondary backstop for the secret/email substrings its regex
 * covers (it does not, and need not, scrub names).
 */
export function assetLogAttrs(asset: StoredAsset): Record<string, string | number> {
  return {
    kind: asset.kind,
    storageKey: redact(asset.storageKey),
    contentType: redact(asset.contentType),
    byteSize: asset.byteSize,
  };
}
