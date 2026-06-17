#!/usr/bin/env node
// Executable architecture guardrails — "the tool is the constraint" (T1-D).
// Returns a concise, structured, model-readable report and exits non-zero on any
// violation, so it can gate CI / `pnpm check` (G-EVAL, D4). Add rules HERE instead
// of restating prose rules in AGENTS.md (restating dilutes signal).
import { readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, extname } from "node:path";
import { cwd, exit, stdout } from "node:process";

const ROOT = cwd();
const MAX_ATTEMPTS = 3;
const SKIP = new Set([
  "node_modules",
  ".next",
  ".git",
  ".worktrees", // sibling git worktrees (git-ignored): gates run from root must not scan into them
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

// R8: a "passing" product feature whose `verification` declares no E2E is a foundation
// lib with no own surface — it must name the buyer-facing dependents whose E2E transitively
// exercise it via `e2e_via` (DoD #3). Makes "no own E2E" an explicit, traceable choice, not
// a silent skip; listed ids must exist. Harness-track + features with their own E2E are exempt.
const featureIds = new Set(fl.features.map((f) => f.id));
for (const f of fl.features) {
  if (f.track !== "product" || f.passes !== true) continue;
  if (/\be2e\b|playwright|test:e2e/i.test(f.verification ?? "")) continue;
  const via = Array.isArray(f.e2e_via) ? f.e2e_via : [];
  add(
    via.length === 0,
    "feature_list.json",
    "R8:declare-transitive-e2e",
    `${f.id}: passing product feature with no own E2E — declare e2e_via:[dependent ids] (transitive E2E, DoD #3), don't skip silently.`,
  );
  for (const dep of via) {
    add(
      !featureIds.has(dep),
      "feature_list.json",
      "R8:declare-transitive-e2e",
      `${f.id}: e2e_via names unknown feature "${dep}".`,
    );
  }
}

// R9: feature_list.json is APPEND-ONLY. Diffed against the committed baseline (git HEAD),
// an existing item may change ONLY state/passes/evidence — never delete/rename an item nor
// weaken its steps/verification/track/etc. (AGENTS.md hard-constraint #2). Appending brand-new
// ids is allowed (the backlog grows); only baseline ids are policed. This is the executable
// teeth for the biggest otherwise-unguarded drift — e.g. "just drop F033's verification so the
// suite goes green" or "relabel F023 track to harness to dodge R8". The baseline is read from
// git; if unavailable (no repo / no HEAD / file absent at HEAD) the rule is SKIPPED, never
// failed — R9 can only ADD safety, never block work on a fresh tree.
const MUTABLE_FIELDS = new Set(["state", "passes", "evidence"]);
let baseline = null;
try {
  const raw = execFileSync("git", ["show", "HEAD:feature_list.json"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  baseline = JSON.parse(raw);
} catch {
  baseline = null; // cannot diff → skip R9 (don't fail a non-git / first-commit context).
}
if (baseline && Array.isArray(baseline.features)) {
  // The spec scaffold (every top-level key except the features array) is immutable.
  for (const k of Object.keys(baseline)) {
    if (k === "features") continue;
    add(
      JSON.stringify(baseline[k]) !== JSON.stringify(fl[k]),
      "feature_list.json",
      "R9:append-only",
      `top-level "${k}" changed — the feature_list spec/rules are immutable; only a feature's state/passes/evidence may change.`,
    );
  }
  const current = new Map(fl.features.map((f) => [f.id, f]));
  for (const base of baseline.features) {
    const cur = current.get(base.id);
    if (!cur) {
      add(
        true,
        "feature_list.json",
        "R9:append-only",
        `${base.id} was removed or renamed — items are never deleted/renamed (append a new id instead).`,
      );
      continue;
    }
    for (const k of new Set([...Object.keys(base), ...Object.keys(cur)])) {
      if (MUTABLE_FIELDS.has(k)) continue;
      add(
        JSON.stringify(base[k]) !== JSON.stringify(cur[k]),
        "feature_list.json",
        "R9:append-only",
        `${base.id}: "${k}" was changed/weakened — only state/passes/evidence are editable (no false completion by weakening the spec).`,
      );
    }
  }
}

// R10: every table CREATEd in a Prisma migration must also be granted RLS in some
// migration. Supabase exposes the `public` schema through PostgREST (reachable with the
// publishable anon key); a table without RLS is internet-readable/writable — the Supabase
// linter rates this ERROR/EXTERNAL (0013_rls_disabled_in_public). The app reaches Postgres
// only via Prisma as the table-OWNER `postgres` role (owners bypass RLS) + Storage via
// service_role (also bypasses), so RLS with zero policies = deny-all to anon while the app
// keeps full access. This makes "a new table ships unprotected" a hard gate failure instead
// of a Supabase security email weeks later. Static check over migration SQL (the .sql files
// are not in the code/style walk above). Ordering note: ship the table's RLS WITH the table,
// and land the migration before/with the env that opens its feature — never after (else the
// live path hits `relation … does not exist`). _prisma_migrations is Prisma-internal (not a
// migration CREATE TABLE) so it is not policed here, though enable_rls covers it too.
const MIGRATIONS_DIR = join(ROOT, "prisma", "migrations");
let migrationDirs = [];
try {
  migrationDirs = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // lexicographic = chronological (timestamp-prefixed); deterministic report order
} catch {
  migrationDirs = []; // no migrations dir (pre-DB tree) → R10 has nothing to police; never fail.
}
const createdIn = new Map(); // table -> first migration dir that CREATEs it
const rlsEnabled = new Set();
for (const d of migrationDirs) {
  let sql = "";
  try {
    sql = await readFile(join(MIGRATIONS_DIR, d, "migration.sql"), "utf8");
  } catch {
    continue; // a migration dir without migration.sql is not our concern here
  }
  for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/gi)) {
    if (!createdIn.has(m[1])) createdIn.set(m[1], d);
  }
  for (const m of sql.matchAll(/ALTER TABLE (?:ONLY )?"([^"]+)"\s+ENABLE ROW LEVEL SECURITY/gi)) {
    rlsEnabled.add(m[1]);
  }
}
for (const [table, dir] of createdIn) {
  add(
    !rlsEnabled.has(table),
    `prisma/migrations/${dir}/migration.sql`,
    "R10:rls-on-new-tables",
    `table "${table}" is CREATEd but never gets "ENABLE ROW LEVEL SECURITY" in any migration — Supabase exposes public tables via PostgREST (anon key); ship RLS with the table (deny-all; the Prisma owner role bypasses it).`,
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
