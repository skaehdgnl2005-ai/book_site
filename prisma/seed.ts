/**
 * prisma/seed.ts — seed the 8 entry-line templates (F004).
 *
 * A Template IS the entry-line product (선택 = 상품 선택). The 8 below are the brief's
 * entry catalogue (기념일 5 + 첫 순간들 3), priced 소프트 43,000 / 하드 49,000원 (KRW won,
 * integer — no minor unit).
 *
 * Idempotent: `seedTemplates` upserts each row keyed on the unique `key`, so re-running
 * converges to the canonical catalogue instead of inserting duplicates.
 *
 * Generate-independent (ADR-0002 / ADR-0006): this module never *statically* imports
 * `@prisma/client` (which is absent until `prisma generate`). The seed logic takes an
 * injected client, and the one-shot runner builds a real client via dynamic import only
 * when executed directly. Wired to `prisma db seed` through package.json `prisma.seed`;
 * run it after `pnpm db:up` + `pnpm prisma:generate`.
 *
 * Runtime note: the `prisma db seed` runner executes this TS file via Node's built-in
 * type stripping (`--experimental-strip-types`), which needs **Node >= 22.6** — newer
 * than the project's `>=20` engines floor, but matching the dev runtime (Node 24).
 * `pnpm check` / the F004 unit test do NOT invoke the runner, so this gap never touches
 * the machine gate; it only affects the manual seed step. (See PROGRESS.md follow-up.)
 */
import { pathToFileURL } from "node:url";

export type TemplateCategory = "ANNIVERSARY" | "FIRST_MOMENT";

export type TemplateExtraVar =
  | "NONE"
  | "BIRTHDATE"
  | "AGE"
  | "SCHOOL"
  | "FIRST_WORD"
  | "SIBLING_GENDER";

export type TemplateSeed = {
  category: TemplateCategory;
  key: string;
  label: string;
  blurb: string;
  extraVar: TemplateExtraVar;
  softPriceWon: number;
  hardPriceWon: number;
  sortOrder: number;
  active: boolean;
};

/** The upsert args we depend on — keyed on the unique `key` so re-seeding is idempotent. */
export type TemplateUpsertArgs = {
  where: { key: string };
  create: TemplateSeed;
  update: Omit<TemplateSeed, "key">;
};

/** Minimal client surface `seedTemplates` needs; a real PrismaClient satisfies it structurally. */
export interface TemplateSeedClient {
  template: { upsert(args: TemplateUpsertArgs): Promise<unknown> };
}

const SOFT_PRICE_WON = 43000;
const HARD_PRICE_WON = 49000;

const entry = (
  category: TemplateCategory,
  key: string,
  label: string,
  blurb: string,
  extraVar: TemplateExtraVar,
  sortOrder: number,
): TemplateSeed => ({
  category,
  key,
  label,
  blurb,
  extraVar,
  softPriceWon: SOFT_PRICE_WON,
  hardPriceWon: HARD_PRICE_WON,
  sortOrder,
  active: true,
});

/** The 8 entry-line templates, in display order (PRODUCT_BRIEF → product_lines.entry). */
export const ENTRY_TEMPLATES: readonly TemplateSeed[] = [
  entry("ANNIVERSARY", "birth", "탄생", "세상에 처음 온 그날의 설렘을 한 권에 담아.", "BIRTHDATE", 1),
  entry("ANNIVERSARY", "hundred_days", "백일", "백 일의 기다림 끝에 만난 작은 기적의 기록.", "NONE", 2),
  entry("ANNIVERSARY", "first_birthday", "돌", "첫 번째 생일, 가장 빛나는 하루의 이야기.", "NONE", 3),
  entry("ANNIVERSARY", "birthday", "생일", "해마다 자라는 아이를 위한 단 하나의 생일 책.", "AGE", 4),
  entry("ANNIVERSARY", "admission", "입학", "새로운 시작 앞에 선 아이에게 건네는 응원.", "SCHOOL", 5),
  entry("FIRST_MOMENT", "first_steps", "첫 걸음마", "처음 내디딘 한 걸음, 그 용기를 오래 간직하다.", "NONE", 6),
  entry("FIRST_MOMENT", "first_word", "첫 말", "아이가 처음 부른 그 한마디로 시작되는 이야기.", "FIRST_WORD", 7),
  entry("FIRST_MOMENT", "became_sibling", "형아 된 날", "동생을 맞이한 날, 한 뼘 더 자란 마음.", "SIBLING_GENDER", 8),
];

/**
 * Upsert every entry template, keyed on its unique `key`. Returns the count seeded.
 * Idempotent by construction: a second run updates the same rows rather than duplicating.
 */
export async function seedTemplates(client: TemplateSeedClient): Promise<number> {
  for (const template of ENTRY_TEMPLATES) {
    const { key, ...fields } = template;
    await client.template.upsert({
      where: { key },
      create: template,
      update: fields,
    });
  }
  return ENTRY_TEMPLATES.length;
}

/** One-shot runner for `prisma db seed`. Builds a real client lazily (needs `prisma generate`). */
async function main(): Promise<void> {
  const mod = (await import("@prisma/client")) as unknown as {
    PrismaClient: new () => TemplateSeedClient & { $disconnect: () => Promise<void> };
  };
  const db = new mod.PrismaClient();
  try {
    const seeded = await seedTemplates(db);
    console.log(`Seeded ${seeded} entry templates.`);
  } finally {
    await db.$disconnect();
  }
}

// Run main() only when executed directly (prisma db seed) — never on import (tests/app).
const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  await main();
}
