import Image from "next/image";
import Link from "next/link";

// Category preview card (Atelier Sans). Hairline-framed, radius 0, no shadow.
// Title is grotesk (category names are structure, not book titles → not serif).
// Media mirrors the TemplateCard pattern: 4:5 mat, hairline, hover scale 1.03.
export function CategoryCard({
  href,
  img,
  kicker,
  title,
  desc,
}: {
  href: string;
  img: string;
  kicker: string;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="category-card">
      <span className="category-card__media" aria-hidden="true">
        <Image
          className="category-card__img"
          src={img}
          alt=""
          fill
          sizes="(min-width: 720px) 33vw, 100vw"
        />
      </span>
      <span className="category-card__kicker">{kicker}</span>
      <span className="category-card__title">{title}</span>
      <span className="category-card__desc">{desc}</span>
    </Link>
  );
}
