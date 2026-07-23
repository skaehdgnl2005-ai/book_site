"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { untrusted } from "@/lib/guardrails";
import { receiveUpload, storeAsset, type AssetKind } from "@/lib/assets";
import { putObject } from "@/lib/storage";
import { orderRepo } from "@/app/api/payments/_lib/orders";
import { isPaidFamily } from "@/app/api/payments/_lib/status";
import { ACCESS_TTL_MS, cookieName, mintAccess } from "./access";
import { hasOrderAccess } from "./orderAccess";
import { finishingStore } from "./finishing";
import { after } from "next/server";
import { generateCode, hashCode, otpStore, verifyAndConsume } from "./otp";
import { emailAdapter } from "@/lib/email";
import { isProductionRuntime, redact } from "@/lib/env";

/**
 * Server actions for 마이페이지 (F017/F018). Every input is `untrusted()` at the boundary
 * (AGENTS #6). Every WRITE re-verifies the per-order capability cookie via `requireAccess` —
 * defense in depth, not just at page load — and requires the order to be PAID. cookies() is async
 * in Next 15 (awaited). PII (dedication/childName) is never logged.
 */

function normalizeEmail(v: unknown): string {
  return (typeof v === "string" ? v : "").trim().toLowerCase();
}

/** Capability cookie OR session ownership (F057) — the shared predicate, re-checked per WRITE. */
async function requireAccess(orderId: string): Promise<boolean> {
  return hasOrderAccess(orderId);
}

const UNIFORM_LOOKUP_NOTE = "입력하신 정보와 일치하는 주문이 있으면 인증 코드를 메일로 보냈습니다.";
const OTP_BAD = "인증 코드가 올바르지 않거나 만료되었습니다. 다시 시도해 주세요.";
const OTP_CLOSED = "마이페이지 접근이 일시적으로 제한되어 있습니다. 잠시 후 다시 시도해 주세요.";

export type LookupState = { stage?: "request" | "verify"; orderId?: string; error?: string; note?: string };

/**
 * F046 stage 1 (possession proof). Verify order# + the email paid with; ON MATCH issue + send a 6-digit OTP
 * (atomic store). ALWAYS advance to the verify stage with a uniform note — a non-match issues nothing but
 * looks identical, so there is no existence oracle. The send is scheduled with after() so it never blocks
 * the response (no latency oracle) and is not dropped on serverless freeze; the no-match path performs an
 * equal hash() to equalize compute. PII (email/code) is never logged.
 */
export async function requestAccessCode(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const input = untrusted({
    orderId: String(formData.get("orderId") ?? "").trim(),
    email: String(formData.get("email") ?? ""),
  }).value;

  const order = await orderRepo().get(input.orderId);
  if (order && normalizeEmail(order.buyerEmail) === normalizeEmail(input.email)) {
    const code = generateCode();
    const { sent } = await otpStore().issue(order.id, hashCode(order.id, code));
    if (sent) {
      const to = order.buyerEmail;
      after(async () => {
        try {
          await emailAdapter().send({ kind: "mypage_otp", to, code });
        } catch (e) {
          console.warn("otp send failed:", redact(String(e))); // recoverable by re-request; never surfaced
        }
      });
    }
  } else {
    hashCode("dummy", generateCode()); // equalize compute; residual = the match-only DB write (spec §4.3)
  }
  return { stage: "verify", orderId: input.orderId, note: UNIFORM_LOOKUP_NOTE };
}

/**
 * F046 stage 2. Atomically verify the 6-digit code; on success mint the capability cookie, THEN consume the
 * code (mint-before-consume + null-guard, so a null mint can never burn a single-use code), then redirect.
 * Malformed input is rejected before any debit (so garbage can't exhaust a legit user's attempt budget).
 * The cookie is set BEFORE redirect(), which is the final statement OUTSIDE any try/catch (throws by design).
 */
export async function verifyAccessCode(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const orderId = String(formData.get("orderId") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  // All the security logic (canonical gate → atomic debit → constant-time compare → mint-before-consume)
  // lives in the unit-testable `verifyAndConsume` seam; this action is thin glue (FormData + cookie + redirect).
  const result = await verifyAndConsume(otpStore(), orderId, code, mintAccess);
  if ("error" in result) {
    return { stage: "verify", orderId, error: result.error === "closed" ? OTP_CLOSED : OTP_BAD };
  }

  (await cookies()).set(cookieName(orderId), result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProductionRuntime(),
    path: "/mypage",
    maxAge: Math.floor(ACCESS_TTL_MS / 1000),
  });

  redirect(`/mypage/${orderId}`);
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
  if (!order || !isPaidFamily(order.status)) return NOT_PAID; // F054: open through fulfillment
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
  if (!order || !isPaidFamily(order.status)) return NOT_PAID; // F054: open through fulfillment
  if (!Number.isInteger(index) || index < 0 || index >= order.items.length) return BAD_ITEM;
  const value = untrusted(typeof text === "string" ? text : "").value.trim();
  if (value.length > MAX_DEDICATION) {
    return { ok: false, error: `헌정 문구는 ${MAX_DEDICATION}자 이내로 입력해 주세요.` };
  }
  await finishingStore().setDedication(orderId, index, value);
  return { ok: true };
}
