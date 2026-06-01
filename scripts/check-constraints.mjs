#!/usr/bin/env node
// Executable architecture guardrails — "the tool is the constraint" (T1-D).
// Returns a concise, structured, model-readable report and exits non-zero on any
// violation, so it can gate CI / `pnpm check` (G-EVAL, D4). Add rules HERE instead
// of restating prose rules in AGENTS.md (restating dilutes signal).
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { cwd, exit, stdout } from "node:process";

const ROOT = cwd();
const MAX_ATTEMPTS = 3;
const SKIP = new Set([
  "node_modules",
  ".next",
  ".git",
  ".harness",
  "coverage",
  "playwright-report",
  "test-results",
  "docs",
]);
const CODE_EXT = new Set([".ts", ".tsx", ".mjs", ".js"]);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const violations = [];
const add = (cond, file, rule, msg) => {
  if (cond) violations.push({ file, rule, msg });
};

for (const f of await walk(ROOT)) {
  if (!CODE_EXT.has(extname(f))) continue;
  const rel = f.slice(ROOT.length + 1).replaceAll("\\", "/");
  const isTest = /\.(test|spec)\.[tj]sx?$/.test(rel) || rel.startsWith("tests/");
  const src = await readFile(f, "utf8");

  // R1: no committed Stripe LIVE keys (test fixtures may reference one to assert refusal).
  add(
    !isTest && /\b(?:sk|pk)_live_[A-Za-z0-9]{6,}/.test(src),
    rel,
    "R1:no-live-keys",
    "Stripe LIVE key literal — dev/verify use TEST keys only (G-HITL).",
  );

  // R2: never log raw process.env (secret / PII leak). Use redact().
  add(
    /console\.\w+\([^)]*process\.env\b/.test(src),
    rel,
    "R2:no-env-logging",
    "Logging process.env risks leaking secrets/PII (E3). Use redact().",
  );

  // R3: irreversible side-effects in src/ must go through requireApproval().
  if (rel.startsWith("src/") && !rel.includes("guardrails")) {
    add(
      /\.charge\(|\.refund\(|sendEmail\(|\bfulfill\(/.test(src) && !/requireApproval\(/.test(src),
      rel,
      "R3:guard-irreversible",
      "Irreversible side-effect without requireApproval() (G-HITL).",
    );
  }
}

// --- feature_list invariants (structural anti-false-completion + executable termination) ---
const fl = JSON.parse(await readFile(join(ROOT, "feature_list.json"), "utf8"));
let attempts = {};
try {
  attempts = JSON.parse(await readFile(join(ROOT, ".harness", "attempts.json"), "utf8"));
} catch {
  attempts = {};
}
for (const f of fl.features) {
  // R4: "passing" ⟺ passes:true. Catches drift between the two completion fields.
  add(
    (f.state === "passing") !== (f.passes === true),
    "feature_list.json",
    "R4:state-passes-invariant",
    `${f.id}: state="${f.state}" but passes=${f.passes} — "passing" must equal passes:true (no false completion).`,
  );
  // R5: executable termination — after MAX_ATTEMPTS failed tries a feature must be
  // "blocked" (escalate), not silently looping. The harness counts; prose doesn't.
  const n = attempts[f.id] ?? 0;
  add(
    n >= MAX_ATTEMPTS && f.passes !== true && f.state !== "blocked",
    "feature_list.json",
    "R5:enforce-escalation",
    `${f.id}: ${n} attempts without passing — state must be "blocked" (escalate), not "${f.state}".`,
  );
}

const report = {
  tool: "check-constraints",
  ok: violations.length === 0,
  count: violations.length,
  violations,
};
stdout.write(JSON.stringify(report, null, 2) + "\n");
exit(violations.length === 0 ? 0 : 1);
