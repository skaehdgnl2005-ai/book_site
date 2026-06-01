import { describe, it, expect } from "vitest";
import { getDb, type Db } from "../../src/lib/db";
import {
  ENTRY_TEMPLATES,
  seedTemplates,
  type TemplateSeed,
  type TemplateSeedClient,
  type TemplateUpsertArgs,
} from "../../prisma/seed";

// F004 — DB wrapper (Prisma singleton) + seed the 8 entry templates.
//
// `pnpm check` is DB- AND generate-independent (ADR-0002 / ADR-0006): the generated
// Prisma client is absent, so nothing here may touch a live Postgres OR statically
// import @prisma/client. We assert behaviour via dependency injection / fakes only.

type DbStore = { __dbPromise?: Promise<Db> };

function fakeClient(tag: number): Db {
  return { $disconnect: async () => {}, __tag: tag };
}

describe("db singleton (F004)", () => {
  it("instantiates the client once and reuses it across sequential calls", async () => {
    let made = 0;
    const factory = async (): Promise<Db> => {
      made += 1;
      return fakeClient(made);
    };
    const store: DbStore = {};

    const first = await getDb(factory, store);
    const second = await getDb(factory, store);

    expect(made).toBe(1); // factory invoked exactly once
    expect(first).toBe(second); // same instance returned
  });

  it("invokes the factory once under CONCURRENT first-use (no double-construct, no leak)", async () => {
    // The bug this guards: an async factory whose result is cached only after `await`
    // lets two concurrent first callers each build a client. The cache must hold the
    // in-flight promise so both callers share one factory invocation.
    let made = 0;
    const factory = async (): Promise<Db> => {
      made += 1;
      await Promise.resolve(); // force a suspension before the client exists
      return fakeClient(made);
    };
    const store: DbStore = {};

    const [a, b] = await Promise.all([getDb(factory, store), getDb(factory, store)]);

    expect(made).toBe(1);
    expect(a).toBe(b);
  });

  it("reuses an already-populated store (hot-reload safe across re-evaluation)", async () => {
    let made = 0;
    const existing = fakeClient(99);
    const store: DbStore = { __dbPromise: Promise.resolve(existing) };
    const factory = async (): Promise<Db> => {
      made += 1;
      return fakeClient(made);
    };

    const got = await getDb(factory, store);

    expect(made).toBe(0); // never built a new client
    expect(got).toBe(existing);
  });

  it("does not poison the singleton when the first init fails (a later call retries)", async () => {
    let made = 0;
    const store: DbStore = {};
    const flaky = async (): Promise<Db> => {
      made += 1;
      if (made === 1) throw new Error("init boom");
      return fakeClient(made);
    };

    await expect(getDb(flaky, store)).rejects.toThrow("init boom");
    const recovered = await getDb(flaky, store);

    expect(made).toBe(2); // retried after the failed first attempt
    expect((recovered as unknown as { __tag: number }).__tag).toBe(2);
  });
});

describe("entry templates seed data (F004)", () => {
  // The 8 entry-line templates, in display order, per PRODUCT_BRIEF.
  const EXPECTED = [
    { category: "ANNIVERSARY", key: "birth", label: "탄생", extraVar: "BIRTHDATE" },
    { category: "ANNIVERSARY", key: "hundred_days", label: "백일", extraVar: "NONE" },
    { category: "ANNIVERSARY", key: "first_birthday", label: "돌", extraVar: "NONE" },
    { category: "ANNIVERSARY", key: "birthday", label: "생일", extraVar: "AGE" },
    { category: "ANNIVERSARY", key: "admission", label: "입학", extraVar: "SCHOOL" },
    { category: "FIRST_MOMENT", key: "first_steps", label: "첫 걸음마", extraVar: "NONE" },
    { category: "FIRST_MOMENT", key: "first_word", label: "첫 말", extraVar: "FIRST_WORD" },
    { category: "FIRST_MOMENT", key: "became_sibling", label: "형아 된 날", extraVar: "SIBLING_GENDER" },
  ] as const;

  it("defines exactly the 8 entry templates in display order", () => {
    expect(ENTRY_TEMPLATES).toHaveLength(8);
    expect(ENTRY_TEMPLATES.map((t) => t.key)).toEqual(EXPECTED.map((e) => e.key));
  });

  it("maps each template's category, label and extra variable correctly", () => {
    for (const e of EXPECTED) {
      const t = ENTRY_TEMPLATES.find((x) => x.key === e.key);
      expect(t, `missing template ${e.key}`).toBeTruthy();
      expect(t?.category).toBe(e.category);
      expect(t?.label).toBe(e.label);
      expect(t?.extraVar).toBe(e.extraVar);
    }
  });

  it("prices every entry book at 43,000 (soft) / 49,000 (hard) KRW won", () => {
    for (const t of ENTRY_TEMPLATES) {
      expect(t.softPriceWon).toBe(43000);
      expect(t.hardPriceWon).toBe(49000);
    }
  });

  it("has a non-empty blurb and a unique key with a stable 1..8 sort order", () => {
    const keys = ENTRY_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length); // unique
    expect(ENTRY_TEMPLATES.every((t) => t.blurb.trim().length > 0)).toBe(true);
    expect(ENTRY_TEMPLATES.map((t) => t.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("seedTemplates idempotency (F004)", () => {
  function recordingClient(): { calls: TemplateUpsertArgs[]; client: TemplateSeedClient } {
    const calls: TemplateUpsertArgs[] = [];
    return {
      calls,
      client: {
        template: {
          upsert: async (args: TemplateUpsertArgs) => {
            calls.push(args);
            return args.create;
          },
        },
      },
    };
  }

  it("upserts every template keyed by its unique key (never plain-inserts → no duplicates)", async () => {
    const { calls, client } = recordingClient();

    const n = await seedTemplates(client);

    expect(n).toBe(8);
    expect(calls).toHaveLength(8);
    for (const c of calls) {
      // idempotency hinges on matching the unique `key`, not creating blindly
      expect(Object.keys(c.where)).toEqual(["key"]);
      expect(c.where.key).toBe(c.create.key);
    }
  });

  it("converges to exactly 8 rows against a stateful store after two runs (no duplicates)", async () => {
    // A fake that models real upsert-by-unique-key semantics (insert-or-replace).
    const rows = new Map<string, TemplateSeed>();
    const client: TemplateSeedClient = {
      template: {
        upsert: async (args: TemplateUpsertArgs) => {
          rows.set(args.where.key, args.create); // keyed on `key` → replace, never duplicate
          return args.create;
        },
      },
    };

    await seedTemplates(client);
    await seedTemplates(client); // re-seed

    expect(rows.size).toBe(8); // converged, not 16
    expect([...rows.keys()].sort()).toEqual(ENTRY_TEMPLATES.map((t) => t.key).slice().sort());
  });
});
