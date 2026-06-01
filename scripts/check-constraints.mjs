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
const STYLE_EXT = new Set([".css"]); // scanned for design-SoR rules (R6/R7) under src/

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
  const ext = extname(f);
  const isCode = CODE_EXT.has(ext);
  const isStyle = STYLE_EXT.has(ext);
  if (!isCode && !isStyle) continue;
  const rel = f.slice(ROOT.length + 1).replaceAll("\\", "/");
  const isTest = /\.(test|spec)\.[tj]sx?$/.test(rel) || rel.startsWith("tests/");
  const src = await readFile(f, "utf8");

  if (isCode) {
    // R1: no committed LIVE payment keys. TossPayments live keys are live_sk_/live_ck_;
    // legacy Stripe sk_live_/pk_live_ stays caught (defence in depth). Test fixtures may
    // reference one to assert refusal, so tests are exempt. (Pattern is grouped so this
    // rule's own source never self-matches.)
    add(
      !isTest && /\b(?:live_(?:sk|ck)|(?:sk|pk)_live)_[A-Za-z0-9]{6,}/.test(src),
      rel,
      "R1:no-live-keys",
      "TossPayments LIVE key literal (or legacy Stripe) — dev/verify use TEST keys only (G-HITL).",
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

  // --- Design SoR (DESIGN.md / Atelier Sans): UI under src/ only. Minimal set, grows as UI lands.
  if (rel.startsWith("src/")) {
    // R6: depth is tone steps + 1px --line hairlines, never box-shadow (DESIGN.md ## Elevation).
    add(
      /box-shadow\s*:\s*[^;}\n]*\d/i.test(src) || /\bboxShadow\s*:\s*["'][^"']*\d/.test(src),
      rel,
      "R6:no-box-shadow",
      "box-shadow is banned (DESIGN.md): build depth with tone steps + 1px --line hairlines.",
    );
    // R7: no pure white/black — every neutral is warm (DESIGN.md ## Colors).
    add(
      /#(?:fff(?:fff)?|000(?:000)?)\b/i.test(src),
      rel,
      "R7:no-pure-white-black",
      "Pure #fff/#000 is banned (DESIGN.md): use the warm tokens (--bg, --surface, --ink, ...).",
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
