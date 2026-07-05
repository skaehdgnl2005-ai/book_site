import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// The single accent 'pill' CTA (DESIGN.md ctaPrimary). One per screen.
export function CtaLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="cta">
      {children}
    </Link>
  );
}

/**
 * Action components (DESIGN.md ## Components #4):
 * a screen gets exactly ONE navy pill (CtaPrimary); every other action is a quiet
 * text link (TextAction / BackAction) — no boxed secondary buttons.
 *
 * Each renders a <Link> when `href` is given, otherwise a <button type="button">.
 * Button props (onClick, disabled, data-testid, …) pass through untouched.
 */
type LinkActionProps = {
  href: string;
  children: ReactNode;
  "data-testid"?: string;
  "aria-label"?: string;
};
type ButtonActionProps = { href?: undefined; children: ReactNode } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "className"
>;
type ActionProps = LinkActionProps | ButtonActionProps;

// Decorative arrow — hidden from AT so the accessible name stays the bare label.
function Arrow({ glyph }: { glyph: "→" | "←" }) {
  return (
    <span className="text-action__arrow" aria-hidden="true">
      {glyph}
    </span>
  );
}

// The navy pill — the ONE primary action of the screen (reuses the global .cta class).
export function CtaPrimary(props: ActionProps) {
  if (props.href !== undefined) {
    const { href, children, ...rest } = props;
    return (
      <Link href={href} className="cta" {...rest}>
        {children}
      </Link>
    );
  }
  const { children, type, ...rest } = props;
  return (
    <button className="cta" type={type ?? "button"} {...rest}>
      {children}
    </button>
  );
}

// Quiet text action — label + trailing arrow (arrow slides +5px, turns navy on hover).
export function TextAction(props: ActionProps) {
  if (props.href !== undefined) {
    const { href, children, ...rest } = props;
    return (
      <Link href={href} className="text-action" {...rest}>
        {children}
        <Arrow glyph="→" />
      </Link>
    );
  }
  const { children, type, ...rest } = props;
  return (
    <button className="text-action" type={type ?? "button"} {...rest}>
      {children}
      <Arrow glyph="→" />
    </button>
  );
}

// "← 뒤로" preset — leading arrow, slides -5px on hover. Children default to "뒤로".
export function BackAction(
  props:
    | (Omit<LinkActionProps, "children"> & { children?: ReactNode })
    | (Omit<ButtonActionProps, "children"> & { children?: ReactNode }),
) {
  if (props.href !== undefined) {
    const { href, children, ...rest } = props;
    return (
      <Link href={href} className="text-action text-action--back" {...rest}>
        <Arrow glyph="←" />
        {children ?? "뒤로"}
      </Link>
    );
  }
  const { children, type, ...rest } = props;
  return (
    <button className="text-action text-action--back" type={type ?? "button"} {...rest}>
      <Arrow glyph="←" />
      {children ?? "뒤로"}
    </button>
  );
}
