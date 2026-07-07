import type { Metadata } from "next";
import { getSessionUser } from "../account/_lib/sessionUser";
import { CheckoutView } from "./CheckoutView";

export const dynamic = "force-dynamic"; // session cookie → member email prefill (F057)
export const metadata: Metadata = { title: "결제 · 그림책 제작소" };

export default async function CheckoutPage() {
  const user = await getSessionUser();
  return <CheckoutView defaultBuyerEmail={user?.email ?? ""} />;
}
