"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { untrusted } from "@/lib/guardrails";
import { receiveUpload, storeAsset, type AssetKind } from "@/lib/assets";
import { putObject } from "@/lib/storage";
import { orderRepo } from "@/app/api/payments/_lib/orders";
import { ACCESS_TTL_MS, cookieName, mintAccess, verifyAccess } from "./access";
import { finishingStore } from "./finishing";

/**
 * Server actions for 마이페이지 (F017/F018). Every input is `untrusted()` at the boundary
 * (AGENTS #6). Every WRITE re-verifies the per-order capability cookie via `requireAccess` —
 * defense in depth, not just at page load — and requires the order to be PAID. cookies() is async
 * in Next 15 (awaited). PII (dedication/childName) is never logged.
 */

function normalizeEmail(v: unknown): string {
  return (typeof v === "string" ? v : "").trim().toLowerCase();
}

/** Read + verify the httpOnly capability cookie for this order (await cookies() — Next 15). */
async function requireAccess(orderId: string): Promise<boolean> {
  const token = (await cookies()).get(cookieName(orderId))?.value ?? null;
  return verifyAccess(orderId, token);
}

type LookupState = { error?: string };

/**
 * F017 lookup. Verifies order# + the email paid with (uniform error → no id-existence oracle),
 * mints the capability cookie, and redirects to the finishing page. The cookie is set BEFORE
 * redirect(), and redirect() is the final statement OUTSIDE any try/catch (it throws NEXT_REDIRECT
 * by design). Redirect target uses the resolved `order.id`, never raw input.
 */
export async function lookupOrder(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const input = untrusted({
    orderId: String(formData.get("orderId") ?? "").trim(),
    email: String(formData.get("email") ?? ""),
  }).value;

  const order = await orderRepo().get(input.orderId);
  if (!order || normalizeEmail(order.buyerEmail) !== normalizeEmail(input.email)) {
    return { error: "주문번호와 이메일을 다시 확인해 주세요." }; // uniform: unknown id OR email mismatch
  }

  const token = mintAccess(order.id);
  if (!token) {
    // Fail-closed: production without MYPAGE_ACCESS_SECRET (no source-literal secret).
    return { error: "마이페이지 접근이 일시적으로 제한되어 있습니다. 잠시 후 다시 시도해 주세요." };
  }

  (await cookies()).set(cookieName(order.id), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_ENV === "production",
    path: "/mypage",
    maxAge: Math.floor(ACCESS_TTL_MS / 1000),
  });

  redirect(`/mypage/${order.id}`);
}

export type ActionResult = { ok: true } | { ok: false; error: string };

const DENIED: ActionResult = { ok: false, error: "접근 권한을 확인할 수 없습니다. 주문번호와 이메일로 다시 조회해 주세요." };
const NOT_PAID: ActionResult = { ok: false, error: "결제가 완료된 주문만 마무리할 수 있습니다." };
const BAD_ITEM: ActionResult = { ok: false, error: "잘못된 요청입니다." };

const MAX_DEDICATION = 500;

async function storeUpload(
  kind: AssetKind,
  file: unknown,
): Promise<{ ok: true; descriptor: { storageKey: string; contentType: string; byteSize: number } } | { ok: false; error: string }> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "파일을 선택해 주세요." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Trust boundary (E4): wrap before storeAsset; filename is consumed here and never persisted/echoed.
  const upload = receiveUpload({ filename: file.name, contentType: file.type, bytes });
  const stored = storeAsset(kind, upload); // throws on bad type → caller's catch (format message)
  try {
    await putObject(stored.storageKey, stored.contentType, bytes);
  } catch {
    return { ok: false, error: "파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  return {
    ok: true,
    descriptor: { storageKey: stored.storageKey, contentType: stored.contentType, byteSize: stored.byteSize },
  };
}

/** F017 — store the (post-pay) child photo for an item via the F029 path. Returns no PII. */
export async function uploadFinishingPhoto(orderId: string, index: number, formData: FormData): Promise<ActionResult> {
  if (!(await requireAccess(orderId))) return DENIED;
  const order = await orderRepo().get(orderId);
  if (!order || order.status !== "PAID") return NOT_PAID;
  if (!Number.isInteger(index) || index < 0 || index >= order.items.length) return BAD_ITEM;
  try {
    const res = await storeUpload("CHILD_PHOTO", formData.get("file"));
    if (!res.ok) return res;
    await finishingStore().setPhoto(orderId, index, res.descriptor);
    return { ok: true };
  } catch {
    return { ok: false, error: "지원하지 않는 형식입니다. JPG·PNG·WEBP·HEIC 이미지를 올려 주세요." };
  }
}

/** F018 — save the dedication for an item. PII — never logged. */
export async function saveDedication(orderId: string, index: number, text: string): Promise<ActionResult> {
  if (!(await requireAccess(orderId))) return DENIED;
  const order = await orderRepo().get(orderId);
  if (!order || order.status !== "PAID") return NOT_PAID;
  if (!Number.isInteger(index) || index < 0 || index >= order.items.length) return BAD_ITEM;
  const value = untrusted(typeof text === "string" ? text : "").value.trim();
  if (value.length > MAX_DEDICATION) {
    return { ok: false, error: `헌정 문구는 ${MAX_DEDICATION}자 이내로 입력해 주세요.` };
  }
  await finishingStore().setDedication(orderId, index, value);
  return { ok: true };
}
