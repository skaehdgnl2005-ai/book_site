import { test, expect } from "@playwright/test";
import { emit } from "../../src/lib/observability";

// F036 — perf budget H3: p95 page load < 2s on home + the two category pages.
//
// What we measure: the browser's own Navigation Timing `duration` (startTime→
// loadEventEnd) — the same full-page-load number real RUM reports — sampled over
// several warm loads, then the p95.
//
// Why warm: the E2E server is `next dev`, which compiles each route ON FIRST HIT
// (a one-time dev-only cost, not a property of the page). The budget targets
// steady-state serve latency (the production proxy), so we prime each route, then
// sample. This is an explicit, documented choice — not a way to hide slowness:
// every *measured* load is a fully-compiled route, exactly what a returning user hits.
//
// Each route's p95 is emitted as a redacted `kind:"metric"` trace line
// (src/lib/observability), so the perf result lands in the same trace stream the
// ops metrics (F039) and OBSERVABILITY.md H3 budget read from — not just an assertion.

const BUDGET_MS = 2000;
const WARMUP = 2; // prime next-dev on-demand compilation (unmeasured)
const SAMPLES = 20; // measured warm loads per route

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/anniversary", name: "category-anniversary" },
  { path: "/first-moments", name: "category-first-moments" },
];

/** Full-page-load duration (ms) the browser itself recorded for the current document. */
async function navDurationMs(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const [nav] = performance.getEntriesByType(
      "navigation",
    ) as PerformanceNavigationTiming[];
    return nav ? nav.duration : 0;
  });
}

/** Nearest-rank percentile: value at ⌈p·n⌉-1 of the sorted samples (p95 over n=20 drops only the single worst). */
function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.ceil(p * s.length) - 1];
}

test.describe("perf — p95 page load < 2s (F036, budget H3)", () => {
  for (const route of ROUTES) {
    test(`${route.name} (${route.path}) p95 load < ${BUDGET_MS}ms`, async ({ page }) => {
      test.setTimeout(120_000);

      // Warm: pay next-dev's one-time compile cost off the clock.
      for (let i = 0; i < WARMUP; i++) {
        await page.goto(route.path, { waitUntil: "load" });
      }

      // Measure: each sample is a fully-compiled route load (returning-user latency).
      const samples: number[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        await page.goto(route.path, { waitUntil: "load" });
        samples.push(await navDurationMs(page));
      }

      const p95Ms = Math.round(percentile(samples, 0.95));
      const p50Ms = Math.round(percentile(samples, 0.5));
      const maxMs = Math.round(Math.max(...samples));

      // Track in observability (step 3): one structured metric line per route, redacted sink.
      emit({
        ts: new Date(0).toISOString(),
        sessionId: "perf.spec",
        kind: "metric",
        name: `page_load.${route.name}`,
        durationMs: p95Ms,
        ok: p95Ms < BUDGET_MS,
        attrs: { route: route.path, p95Ms, p50Ms, maxMs, samples: SAMPLES },
      });

      expect(p95Ms, `${route.name} p95=${p95Ms}ms (max=${maxMs}ms) must be < ${BUDGET_MS}ms`).toBeLessThan(
        BUDGET_MS,
      );
    });
  }
});
