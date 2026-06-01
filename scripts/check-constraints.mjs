#!/usr/bin/env node
// Executable architecture guardrails — "the tool is the constraint" (T1-D).
// Returns a concise, structured, model-readable report and exits non-zero on any
// violation, so it can gate CI / `pnpm check` (G-EVAL, D4). Add rules HERE instead
// of restating prose rules in AGENTS.md (restating dilutes signal).
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { cwd, exit, stdout } from "node:process";

const ROOT = cwd();
const SKIP = new Set([
  "node_modules",
  ".next",
  ".git",
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

const report = {
  tool: "check-constraints",
  ok: violations.length === 0,
  count: violations.length,
  violations,
};
stdout.write(JSON.stringify(report, null, 2) + "\n");
exit(violations.length === 0 ? 0 : 1);
