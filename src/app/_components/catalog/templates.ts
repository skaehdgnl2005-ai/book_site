/**
 * Catalog data access for the category pages (F005 기념일 / F006 첫 순간들).
 *
 * "From the database" — when a database is configured (`DATABASE_URL` set, a real
 * `prisma generate`d client present) we read the seeded `Template` rows via the
 * `src/lib/db` singleton. Otherwise — the hermetic path used by `pnpm check` and the
 * Playwright E2E (CI runs neither Postgres nor `prisma generate`, ADR-0002) — we fall
 * back to the canonical catalogue below, which MIRRORS `prisma/seed.ts` ENTRY_TEMPLATES
 * (the seed-side source of truth). The page renders identically either way.
 *
 * Drift guard: the category E2Es assert the exact labels / keys / cover prices, so any
 * divergence between this mirror and the seed fails the gate (DoD #3). We deliberately
 * do NOT import `prisma/seed.ts` here — it carries a Node one-shot runner (top-level
 * await + a dynamic `@prisma/client` import) that must not be pulled into the page bundle.
 */

export type CatalogCategory = "ANNIVERSARY" | "FIRST_MOMENT";

/** The fields a TemplateCard needs — a view model over the `Template` row / seed. */
export type CatalogTemplate = {
  key: string;
  category: CatalogCategory;
  label: string;
  blurb: string;
  softPriceWon: number;
  hardPriceWon: number;
  heroImageUrl: string | null;
  sortOrder: number;
};

const SOFT_PRICE_WON = 43000;
const HARD_PRICE_WON = 49000;

const t = (
  category: CatalogCategory,
  key: string,
  label: string,
  blurb: string,
  sortOrder: number,
): CatalogTemplate => ({
  category,
  key,
  label,
  blurb,
  softPriceWon: SOFT_PRICE_WON,
  hardPriceWon: HARD_PRICE_WON,
  heroImageUrl: null, // no real hero assets yet — cards show an honest media mat (brief §10)
  sortOrder,
});

/** Canonical entry catalogue — mirrors prisma/seed.ts ENTRY_TEMPLATES (brief product_lines.entry). */
const CATALOG: readonly CatalogTemplate[] = [
  t("ANNIVERSARY", "birth", "탄생", "세상에 처음 온 그날의 설렘을 한 권에 담아.", 1),
  t("ANNIVERSARY", "hundred_days", "백일", "백 일의 기다림 끝에 만난 작은 기적의 기록.", 2),
  t("ANNIVERSARY", "first_birthday", "돌", "첫 번째 생일, 가장 빛나는 하루의 이야기.", 3),
  t("ANNIVERSARY", "birthday", "생일", "해마다 자라는 아이를 위한 단 하나의 생일 책.", 4),
  t("ANNIVERSARY", "admission", "입학", "새로운 시작 앞에 선 아이에게 건네는 응원.", 5),
  t("FIRST_MOMENT", "first_steps", "첫 걸음마", "처음 내디딘 한 걸음, 그 용기를 오래 간직하다.", 6),
  t("FIRST_MOMENT", "first_word", "첫 말", "아이가 처음 부른 그 한마디로 시작되는 이야기.", 7),
  t("FIRST_MOMENT", "became_sibling", "형아 된 날", "동생을 맞이한 날, 한 뼘 더 자란 마음.", 8),
];

const bySortOrder = (a: CatalogTemplate, b: CatalogTemplate) => a.sortOrder - b.sortOrder;

function fromCatalog(category: CatalogCategory): CatalogTemplate[] {
  return CATALOG.filter((x) => x.category === category)
    .slice()
    .sort(bySortOrder);
}

/** Minimal Prisma delegate surface we depend on — a generated client satisfies it. */
type TemplateDelegate = {
  findMany(args: {
    where: { category: CatalogCategory; active: boolean };
    orderBy: { sortOrder: "asc" };
  }): Promise<
    Array<{
      key: string;
      category: CatalogCategory;
      label: string;
      blurb: string;
      softPriceWon: number;
      hardPriceWon: number;
      heroImageUrl: string | null;
      sortOrder: number;
    }>
  >;
};

/**
 * Read active templates for a category from a Prisma-like client, mapped to the view
 * model. Exported as an injection seam so the DB mapping + ordering is unit-testable
 * without a live database (the same pattern as db.ts `getDb(factory)` / seed.ts
 * `seedTemplates(client)`). Ordering is delegated to the DB (`orderBy: sortOrder`).
 */
export async function readTemplatesFromDb(
  category: CatalogCategory,
  db: { [model: string]: unknown },
): Promise<CatalogTemplate[]> {
  const rows = await (db.template as TemplateDelegate).findMany({
    where: { category, active: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((r) => ({
    key: r.key,
    category: r.category,
    label: r.label,
    blurb: r.blurb,
    softPriceWon: r.softPriceWon,
    hardPriceWon: r.hardPriceWon,
    heroImageUrl: r.heroImageUrl ?? null,
    sortOrder: r.sortOrder,
  }));
}

/**
 * Active templates for a category, in display order. Reads the live DB when one is
 * configured; otherwise (and on any DB error) falls back to the canonical seeded
 * catalogue so the page always renders. `@/lib/db` is imported dynamically and only
 * inside the DB branch, keeping `@prisma/client` out of the hermetic render path.
 */
export async function getTemplatesByCategory(
  category: CatalogCategory,
): Promise<CatalogTemplate[]> {
  if (process.env.DATABASE_URL) {
    try {
      const { getDb } = await import("@/lib/db");
      const rows = await readTemplatesFromDb(category, await getDb());
      // A non-empty DB result wins. An empty result deliberately falls through to the
      // seed mirror so a migrated-but-unseeded DB still renders the catalogue rather
      // than an empty grid. Trade-off: once admin deactivation ships, an all-inactive
      // category would also show the mirror — revisit the guard when that lands.
      if (rows.length > 0) return rows;
    } catch {
      // No generated client / no reachable DB (hermetic CI/E2E) — use the seed mirror.
    }
  }
  return fromCatalog(category);
}

/** Format KRW won as an integer with thousands separators (no minor unit). */
export function formatWon(won: number): string {
  return won.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
}
