import type { Metadata } from "next";
import { requireAdmin } from "./_lib/adminAuth";

export const dynamic = "force-dynamic"; // session gate on every request — never cached
export const metadata: Metadata = {
  title: "관리자 · 그림책 제작소",
  robots: { index: false, follow: false },
};

/**
 * F059 (ADR-0024) — every /admin surface renders only past requireAdmin() (global session +
 * ADMIN_EMAILS allowlist; failure = 404, existence hidden). Server actions under /admin
 * re-verify on their own — this layout is the first gate, not the only one (defense in depth,
 * the mypage actions precedent). PII discipline (E3): admin screens RENDER buyer/shipping/child
 * data for fulfillment work but no admin code path ever logs/traces it.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
