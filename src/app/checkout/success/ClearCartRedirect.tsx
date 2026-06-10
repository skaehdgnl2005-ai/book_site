"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearCart } from "@/lib/cart";
import { Nav } from "../../_components/Nav";
import { Footer } from "../../_components/Footer";

/** Runs ONLY after a server-confirmed PAID: empties the cart (localStorage) then goes to /orders/[id]. */
export function ClearCartRedirect({ orderId }: { orderId: string }) {
  const router = useRouter();
  useEffect(() => {
    clearCart(); // client-side; preserves the cart on cancel/failure (which never reach here)
    router.replace(`/orders/${orderId}`);
  }, [orderId, router]);
  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="success-title">
          <p className="eyebrow">결제 완료</p>
          <h1 className="hero__title" id="success-title">주문을 확인하고 있어요…</h1>
        </section>
      </main>
      <Footer />
    </>
  );
}
