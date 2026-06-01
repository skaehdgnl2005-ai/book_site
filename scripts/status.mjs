#!/usr/bin/env node
// Honest dual status (anti-Goodhart). Harness readiness (SCORECARD.md ≈ 85/READY)
// measures the MACHINERY; it is NOT product delivery. This prints product-track vs
// harness-track feature delivery so the two are never conflated. Read together (G1).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cwd, stdout } from "node:process";

const fl = JSON.parse(await readFile(join(cwd(), "feature_list.json"), "utf8"));
const track = (t) => fl.features.filter((f) => f.track === t);
const passing = (a) => a.filter((f) => f.passes === true).length;
const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);

const product = track("product");
const harness = track("harness");
const untracked = fl.features.filter((f) => f.track !== "product" && f.track !== "harness");

// Read the harness number from its single source (scorecard.yaml), don't hardcode it here.
let overall = null;
let hstatus = "unknown";
try {
  const yaml = await readFile(join(cwd(), "scorecard.yaml"), "utf8");
  overall = Number((yaml.match(/overall_score:\s*([\d.]+)/) ?? [])[1] ?? "");
  hstatus = (yaml.match(/^status:\s*(\w+)/m) ?? [])[1] ?? "unknown";
} catch {
  /* scorecard not present */
}

stdout.write(
  JSON.stringify(
    {
      harness_readiness: { overall, status: hstatus, source: "scorecard.yaml" },
      product_delivery: {
        passing: passing(product),
        total: product.length,
        pct: pct(passing(product), product.length),
      },
      harness_track: {
        passing: passing(harness),
        total: harness.length,
        pct: pct(passing(harness), harness.length),
      },
      untracked: untracked.length,
      note: "harness_readiness measures the MACHINERY, NOT product delivery. ROBUST promotion additionally requires real product_delivery (rubric G1). Don't optimize the harness number in place of shipping features.",
    },
    null,
    2,
  ) + "\n",
);
