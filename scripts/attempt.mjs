#!/usr/bin/env node
// Executable termination counter — closes the prose-only gap in loop termination.
// `pnpm attempt <featureId>` records one work attempt at the START of working a
// feature. After 3 failed tries, check-constraints rule R5 forces the feature to
// "blocked" (escalate). Call with --reset when a feature reaches passing.
// The ledger (.harness/attempts.json) is committed so counts survive sessions (F1).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { cwd, argv, exit, stdout } from "node:process";

const LEDGER = join(cwd(), ".harness", "attempts.json");
const id = argv[2];
const reset = argv.includes("--reset");

if (!id || id.startsWith("--")) {
  stdout.write("Usage: pnpm attempt <featureId> [--reset]\n");
  exit(2);
}

let ledger = {};
try {
  ledger = JSON.parse(await readFile(LEDGER, "utf8"));
} catch {
  ledger = {};
}

if (reset) {
  delete ledger[id];
} else {
  ledger[id] = (ledger[id] ?? 0) + 1;
}

await mkdir(dirname(LEDGER), { recursive: true });
await writeFile(LEDGER, JSON.stringify(ledger, null, 2) + "\n");

stdout.write(
  reset
    ? `Reset attempts for ${id}.\n`
    : `${id}: attempt ${ledger[id]} (block forced at 3 without passing).\n`,
);
exit(0);
