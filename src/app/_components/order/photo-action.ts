"use server";

import { receiveUpload, storeAsset } from "@/lib/assets";

export type PhotoResult =
  | { ok: true; photo: { storageKey: string; contentType: string; byteSize: number } }
  | { ok: false; error: string };

/**
 * F009 — validate + store an access-controlled child-photo descriptor (F029 path).
 * PII-safe: never echoes the filename. Durable byte storage is downstream (mypage F017).
 */
export async function uploadChildPhoto(formData: FormData): Promise<PhotoResult> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "사진 파일을 선택해 주세요." };
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const upload = receiveUpload({ filename: file.name, contentType: file.type, bytes });
    const stored = storeAsset("CHILD_PHOTO", upload);
    return {
      ok: true,
      photo: {
        storageKey: stored.storageKey,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
      },
    };
  } catch {
    return {
      ok: false,
      error: "지원하지 않는 형식입니다. JPG·PNG·WEBP·HEIC 이미지를 올려 주세요.",
    };
  }
}
