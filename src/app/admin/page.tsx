import { redirect } from "next/navigation";

/** F059 — /admin has one home today: the order list. */
export default function AdminIndexPage(): never {
  redirect("/admin/orders");
}
