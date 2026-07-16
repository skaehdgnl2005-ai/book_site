import { Nav } from "../Nav";
import { TemplateCard } from "./TemplateCard";
import type { CatalogTemplate } from "./templates";
import styles from "./CategoryView.module.css";

// Shared scaffold for the two category pages (F005 기념일 / F006 첫 순간들). Same
// pattern, different data — eyebrow + h1 + intro, then the template card grid.
// Reuses the F002 shared kit (Nav) + globals.css classes (import-only).
export function CategoryView({
  eyebrow,
  title,
  intro,
  kicker,
  templates,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  kicker: string;
  templates: CatalogTemplate[];
}) {
  return (
    <>
      <Nav />
      <main>
        <section className="hero" aria-labelledby="category-title">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="hero__title" id="category-title">
            {title}
          </h1>
          <p className="hero__sub">{intro}</p>
        </section>

        <section className="section" aria-label="템플릿 목록" data-testid="template-grid">
          {/* role="list" — WebKit drops list semantics when list-style:none is set. */}
          <ul className={styles.grid} role="list">
            {templates.map((template, i) => (
              <li key={template.key} className={styles.cell}>
                <TemplateCard template={template} index={i + 1} kicker={kicker} />
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
