import Link from "next/link";
import type { ReactNode } from "react";

// The single accent 'pill' CTA (DESIGN.md ctaPrimary). One per screen.
export function CtaLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="cta">
      {children}
    </Link>
  );
}
