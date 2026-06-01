import Link from "next/link";

// Category preview card (Atelier Sans). Hairline-framed, radius 0, no shadow.
// Title is grotesk (category names are structure, not book titles → not serif).
export function CategoryCard({
  href,
  kicker,
  title,
  desc,
}: {
  href: string;
  kicker: string;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="category-card">
      <span className="category-card__kicker">{kicker}</span>
      <span className="category-card__title">{title}</span>
      <span className="category-card__desc">{desc}</span>
    </Link>
  );
}
