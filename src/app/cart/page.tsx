import type { Metadata } from "next";
import { CartView } from "../_components/order/CartView";

export const metadata: Metadata = { title: "장바구니 · 그림책 제작소" };
export const dynamic = "force-dynamic";

export default function CartPage() {
  return <CartView />;
}
