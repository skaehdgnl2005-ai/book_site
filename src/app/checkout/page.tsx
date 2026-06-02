import type { Metadata } from "next";
import { CheckoutView } from "./CheckoutView";

export const metadata: Metadata = { title: "결제 · 그림책 제작소" };

export default function CheckoutPage() {
  return <CheckoutView />;
}
