import { redirect } from "next/navigation";
import { requireAdmin } from "./_lib/adminAuth";

/** F059 — /admin has one home today: the order list. F075 — own requireAdmin so /admin itself
 *  is existence-hidden (404) to non-admins, not merely redirected past the layout gate. */
export default async function AdminIndexPage(): Promise<never> {
  await requireAdmin();
  redirect("/admin/orders");
}
