/**
 * Prisma client singleton — generate- AND database-independent (ADR-0002 / ADR-0006).
 *
 * We deliberately do NOT `import { PrismaClient } from "@prisma/client"` at the top
 * level: `pnpm check` runs without `prisma generate`, so the generated client is
 * absent and a static import would (a) fail `tsc` — the package re-exports from the
 * not-yet-generated `.prisma/client` — and (b) throw at import time. Instead the
 * client is built lazily, via a dynamic import on first use, and cached on `globalThis`
 * so dev hot-reloads reuse one instance (the standard Next.js App Router pattern).
 *
 * A real deployment runs `prisma generate` (e.g. `pnpm prisma:generate`) before the
 * first `getDb()` call, so the dynamic import resolves to the real client there.
 */

/**
 * The slice of `PrismaClient` this module guarantees today. Kept structural (not the
 * generated `PrismaClient` type, which doesn't exist pre-`generate`); model delegates
 * are reached through the index signature and tightened by features as they wire queries.
 */
export type Db = {
  $disconnect: () => Promise<void>;
  [model: string]: unknown;
};

// We cache the in-flight PROMISE, not the resolved client. Because the factory is
// async (it dynamically imports @prisma/client), caching the resolved value would
// assign the slot only *after* an `await` — letting two concurrent first callers each
// run the factory and construct two clients (one orphaned, never $disconnect()ed).
// Caching the promise assigns synchronously, before any suspension, so concurrent
// first callers share a single factory invocation.
type DbStore = { __dbPromise?: Promise<Db> };

const globalForDb = globalThis as unknown as DbStore;

async function defaultFactory(): Promise<Db> {
  const mod = (await import("@prisma/client")) as unknown as {
    PrismaClient: new () => Db;
  };
  return new mod.PrismaClient();
}

/**
 * Returns the process-wide Prisma singleton, creating it on first call and reusing it
 * thereafter — including under concurrent first-use. `factory`/`store` are injection
 * seams for tests, so the singleton guarantee can be verified without a generated
 * client or a live database; production code calls `getDb()` with no arguments.
 */
export function getDb(
  factory: () => Promise<Db> = defaultFactory,
  store: DbStore = globalForDb,
): Promise<Db> {
  // `??=` assigns synchronously (the catch handler clears the slot so a failed first
  // init doesn't permanently poison the singleton — a later call can retry).
  store.__dbPromise ??= factory().catch((err: unknown) => {
    store.__dbPromise = undefined;
    throw err;
  });
  return store.__dbPromise;
}
