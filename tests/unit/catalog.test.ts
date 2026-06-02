import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  formatWon,
  getTemplatesByCategory,
  readTemplatesFromDb,
  getTemplateByKey,
  type CatalogCategory,
  type TemplateExtraVar,
} from "../../src/app/_components/catalog/templates";
import { ENTRY_TEMPLATES } from "../../prisma/seed";
import type { TemplateExtraVar as SeedExtraVar } from "../../prisma/seed";
// Compile-time parity: the catalog's local TemplateExtraVar union must equal the seed's
// union EXACTLY (bidirectional assignability), independent of whether a new member is yet
// used by any template row — guards the deliberate type copy directly, not just via data.
const _extraVarParityForward: SeedExtraVar = null as unknown as TemplateExtraVar;
const _extraVarParityBackward: TemplateExtraVar = null as unknown as SeedExtraVar;
void _extraVarParityForward;
void _extraVarParityBackward;

// Catalog data access for the category pages (F005 기념일 / F006 첫 순간들).
//
// The Playwright E2E exercises the HERMETIC seed-mirror render path (CI has no DB).
// These unit tests cover what the E2E cannot: the live-DB read+map+order branch (via an
// injected fake client — the db.ts/seed.ts injection-seam pattern), and a non-E2E drift
// guard on the mirror's keys/labels/blurbs/prices vs the seeded catalogue. Stays
// DB-independent (ADR-0002): no live Postgres, no @prisma/client.

// Expected seeded catalogue, per category, in display (sortOrder) order. This is the
// brief's entry line — the same data prisma/seed.ts seeds and the mirror must match.
const EXPECTED: Record<CatalogCategory, Array<{ key: string; label: string }>> = {
  ANNIVERSARY: [
    { key: "birth", label: "탄생" },
    { key: "hundred_days", label: "백일" },
    { key: "first_birthday", label: "돌" },
    { key: "birthday", label: "생일" },
    { key: "admission", label: "입학" },
  ],
  FIRST_MOMENT: [
    { key: "first_steps", label: "첫 걸음마" },
    { key: "first_word", label: "첫 말" },
    { key: "became_sibling", label: "형아 된 날" },
  ],
};

describe("formatWon", () => {
  it("formats KRW integers with thousands separators (no minor unit)", () => {
    expect(formatWon(0)).toBe("0원");
    expect(formatWon(43000)).toBe("43,000원");
    expect(formatWon(49000)).toBe("49,000원");
    expect(formatWon(119000)).toBe("119,000원");
  });
});

describe("getTemplatesByCategory — hermetic seed mirror (no DATABASE_URL)", () => {
  const saved = process.env.DATABASE_URL;
  beforeEach(() => {
    delete process.env.DATABASE_URL; // force the fallback path deterministically
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });

  for (const category of ["ANNIVERSARY", "FIRST_MOMENT"] as CatalogCategory[]) {
    it(`returns exactly the ${category} templates in sort order, fully populated`, async () => {
      const rows = await getTemplatesByCategory(category);
      expect(rows.map((r) => r.key)).toEqual(EXPECTED[category].map((e) => e.key));
      expect(rows.map((r) => r.label)).toEqual(EXPECTED[category].map((e) => e.label));
      for (const r of rows) {
        expect(r.category).toBe(category);
        expect(r.softPriceWon).toBe(43000);
        expect(r.hardPriceWon).toBe(49000);
        expect(r.blurb.trim().length).toBeGreaterThan(0); // drift guard: blurb present
        expect(r.heroImageUrl).toBeNull(); // no real hero assets yet — honest mat
      }
    });
  }

  it("never bleeds templates across categories", async () => {
    const all = [
      ...(await getTemplatesByCategory("ANNIVERSARY")),
      ...(await getTemplatesByCategory("FIRST_MOMENT")),
    ];
    expect(all).toHaveLength(8); // the 8 entry templates, partitioned 5 + 3
    expect(new Set(all.map((r) => r.key)).size).toBe(8); // no duplicate keys
  });
});

type FakeRow = {
  key: string;
  label: string;
  category: CatalogCategory;
  blurb: string;
  softPriceWon: number;
  hardPriceWon: number;
  sortOrder: number;
  heroImageUrl?: string | null;
};

const row = (
  key: string,
  label: string,
  sortOrder: number,
  heroImageUrl?: string | null,
): FakeRow => ({
  key,
  label,
  category: "ANNIVERSARY",
  blurb: "b",
  softPriceWon: 43000,
  hardPriceWon: 49000,
  sortOrder,
  heroImageUrl,
});

describe("readTemplatesFromDb — live-DB branch (injected fake client)", () => {
  it("delegates ordering/filtering to the DB and maps every field faithfully", async () => {
    const calls: unknown[] = [];
    // Rows returned out of order on purpose: readTemplatesFromDb must NOT re-sort — it
    // trusts the DB `orderBy` (asserted below) and preserves the row order it receives.
    const fakeDb = {
      template: {
        findMany: async (args: unknown) => {
          calls.push(args);
          return [
            row("birthday", "생일", 4, null),
            row("birth", "탄생", 1, "https://cdn.example/birth.jpg"),
          ];
        },
      },
    };

    const rows = await readTemplatesFromDb("ANNIVERSARY", fakeDb);

    expect(rows.map((r) => r.key)).toEqual(["birthday", "birth"]); // order preserved
    expect(rows.find((r) => r.key === "birth")?.heroImageUrl).toBe(
      "https://cdn.example/birth.jpg", // heroImageUrl passthrough
    );
    expect(calls[0]).toEqual({
      where: { category: "ANNIVERSARY", active: true }, // active-only, scoped to category
      orderBy: { sortOrder: "asc" },
    });
  });

  it("normalizes a missing heroImageUrl to null", async () => {
    const fakeDb = {
      template: { findMany: async () => [row("hundred_days", "백일", 2)] },
    };
    const [r] = await readTemplatesFromDb("ANNIVERSARY", fakeDb);
    expect(r.heroImageUrl).toBeNull();
  });

  it("maps extraVar from the DB row, defaulting a missing one to NONE", async () => {
    const fakeDb = {
      template: {
        findMany: async () => [
          { ...row("birth", "탄생", 1), extraVar: "BIRTHDATE" },
          row("hundred_days", "백일", 2), // no extraVar field → NONE
        ],
      },
    };
    const rows = await readTemplatesFromDb("ANNIVERSARY", fakeDb);
    expect(rows.find((r) => r.key === "birth")?.extraVar).toBe("BIRTHDATE");
    expect(rows.find((r) => r.key === "hundred_days")?.extraVar).toBe("NONE");
  });
});

// extraVar must be a single source of truth: the mirror must match prisma/seed.ts exactly,
// AND the live-DB seam must carry it (a DB-configured deploy must not silently drop it).
describe("catalog extraVar — drift guard vs prisma/seed.ts (no DATABASE_URL)", () => {
  const saved = process.env.DATABASE_URL;
  beforeEach(() => delete process.env.DATABASE_URL);
  afterEach(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });

  it("every template's extraVar matches the seed source of truth", async () => {
    for (const seed of ENTRY_TEMPLATES) {
      const t = await getTemplateByKey(seed.key);
      expect(t, `missing template ${seed.key}`).not.toBeNull();
      expect(t!.extraVar).toBe(seed.extraVar);
    }
  });

  it("the mirror's set of extraVar values equals the seed's set (catches a new enum member ONCE a template uses it)", () => {
    const seedSet = new Set(ENTRY_TEMPLATES.map((t) => t.extraVar));
    const mirrorSet = new Set<TemplateExtraVar>();
    // pull the mirror via getTemplateByKey for each seed key
    return Promise.all(ENTRY_TEMPLATES.map((s) => getTemplateByKey(s.key))).then((rows) => {
      for (const r of rows) mirrorSet.add(r!.extraVar);
      expect([...mirrorSet].sort()).toEqual([...seedSet].sort());
    });
  });
});

describe("getTemplateByKey — hermetic resolution (no DATABASE_URL)", () => {
  const saved = process.env.DATABASE_URL;
  beforeEach(() => delete process.env.DATABASE_URL);
  afterEach(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  });

  it("resolves a known key from the seed mirror", async () => {
    const t = await getTemplateByKey("birth");
    expect(t?.label).toBe("탄생");
    expect(t?.extraVar).toBe("BIRTHDATE");
  });
  it("resolves a NONE-extraVar template", async () => {
    expect((await getTemplateByKey("hundred_days"))?.extraVar).toBe("NONE");
  });
  it("returns null for an unknown key", async () => {
    expect(await getTemplateByKey("not-a-real-key")).toBeNull();
  });
});
