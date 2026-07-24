"use server";

import { headers } from "next/headers";
import { receiveUpload, storeAsset, MAX_UPLOAD_BYTES } from "@/lib/assets";
import { putObject } from "@/lib/storage";
import { clientIp, enforceRateLimit, RL_UPLOAD } from "@/lib/rateLimit";

export type PhotoResult =
  | { ok: true; photo: { storageKey: string; contentType: string; byteSize: number } }
  | { ok: false; error: string };

/**
 * F009 — validate + durably store an access-controlled child photo (F029 path).
 * PII-safe: never echoes the filename. The bytes go to Supabase Storage when configured
 * (else descriptor-only, hermetic); the same storageKey is recorded on the order's Asset.
 */
export async function uploadChildPhoto(formData: FormData): Promise<PhotoResult> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "사진 파일을 선택해 주세요." };
  }
  // F085 — reject oversized BEFORE buffering into memory (this pre-pay action is unauthenticated), and
  // bound flood rate per IP. Real distributed limiting is Vercel WAF (DEPLOY.md); this is defense-in-depth.
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "사진이 너무 큽니다. 10MB 이하 이미지를 올려 주세요." };
  }
  if (!enforceRateLimit(`upload:${clientIp(await headers())}`, RL_UPLOAD).ok) {
    return { ok: false, error: "업로드 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let stored;
  try {
    const upload = receiveUpload({ filename: file.name, contentType: file.type, bytes });
    stored = storeAsset("CHILD_PHOTO", upload);
  } catch {
    return { ok: false, error: "지원하지 않는 형식입니다. JPG·PNG·WEBP·HEIC 이미지를 올려 주세요." };
  }
  try {
    await putObject(stored.storageKey, stored.contentType, bytes);
  } catch {
    return { ok: false, error: "사진을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  return {
    ok: true,
    photo: { storageKey: stored.storageKey, contentType: stored.contentType, byteSize: stored.byteSize },
  };
}
