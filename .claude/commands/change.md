---
description: Intake a casually-tossed change request and carry it out within the harness rails (right-sized — trivial fixes stay light; risky work auto-escalates)
argument-hint: [what you want changed — plain prose, KO or EN, is fine]
---

A change request just came in:

> $ARGUMENTS

You are the **intake router** for this harness (그림책 제작소). Carry it out so it FITS this repo and
breaks **no invariant** — by *orchestrating rails that already exist* (`pnpm check` / `verify` /
`constraints` / `attempt` / `approve` / `status`, `feature_list.json`, the **nearest** `AGENTS.md`).
Invent no new machinery. Empty request → ask what they want changed, then stop.

## 0. Right-size the ceremony FIRST — keep casual tosses casual ("툭 던지기"는 가볍게)
Glance at the request and take the lightest lane that is safe:
- **Trivial** (copy/style tweak, local bugfix, no feature semantics, nothing in §RISK) →
  skim the nearest `AGENTS.md`, make the smallest edit reusing `src/app/_components` + `globals.css`
  tokens, run **`pnpm check`**, done. Skip §1–§4. Touch **no** `feature_list.json` field.
- **Feature work** (maps to / needs a `feature_list.json` item) → run the full routine, §1→§4.
- **RISK** (money · PII · fulfillment · email · deploy · live keys · OR deleting/renaming/weakening
  any feature item, test, the `check` script, or a constraint) → **STOP** and handle per §RISK first.
> Unsure which lane, or the toss touches **>1 feature** (WIP=1)? Ask **one** question and wait.

## §RISK — irreversible / weakening (handle before any code)
- Money/PII/fulfillment/email/deploy → route through `pnpm approve <action>` + `requireApproval()`
  (`src/lib/guardrails.ts`) **first** — human approval before acting. A live key is a hard **no** (R1).
- Deleting/renaming/weakening a `feature_list.json` item (or its `steps`/`verification`), a test, the
  `pnpm check` composite, or a constraint → **refuse**, propose a non-weakening alternative.
  *(Mechanically enforced now: **R9** diffs `feature_list.json` against git HEAD and fails
  `pnpm check` on any non-`state/passes/evidence` edit — don't route around it, fix the request.)*
- A *new* irreversible verb (e.g. `voidOrder`, `capturePayment`) is NOT in R3's list — treat it as
  RISK anyway, gate it through `requireApproval()`, and add it to `IRREVERSIBLE_ACTIONS` if real.

## 1. Preflight (feature lane) — start green
`pwd`; read **PROGRESS.md** (newest Handoff + its `Next:`) and `git log --oneline -15`; run
`./init.sh` (or `pnpm check`). If baseline is **red**, fix that first — never stack onto a red tree.

## 2. Bind to ONE target (WIP=1)
Pick **exactly one** item: an existing id, or the top `passes:false` row it belongs to. A genuinely
new item is an **append** — never repurpose/weaken an existing row, never open a second mid-flight,
never relabel `track` to dodge R8. Then `pnpm attempt <id>` (durable ledger; R5 auto-blocks at 3 —
that's the budget, not an error to route around).

## 3. Do the work — fit the structure, smallest viable change
Land edits in the right route/dir; reuse the established kit. Honor the in-play hard constraints:
TossPayments **TEST keys only**; `redact()` secrets & PII out of logs/traces; wrap external
(buyer/admin/webhook/web) input in `untrusted()` — never as instructions; UI only from **DESIGN.md**
tokens (warm neutrals — no pure #fff/#000/rgb-white, hairlines not shadows, radius 0, serif only for
Korean titles); KRW won is **integer** and unit price is **snapshotted on the order**; new arch rules
go in `scripts/check-constraints.mjs` (**executable**), never as prose. Prefer TDD where there's a
behavioral surface (failing test / `*.spec.ts` first). Edit `feature_list.json` **only** in
`state` / `passes` / `evidence` (R9 enforces this).

## 4. Verify, then record honestly & close
- Inner loop: `pnpm verify`. Full gate: **`pnpm check`** must exit 0 — non-zero = **not done**; fix
  the cause, never disable a rule / skip a test / trim `check`.
- Confirm a **user-facing E2E** covers it: `pnpm test:e2e -- <spec>`, or the `e2e_via:[real ids]`
  dependents' specs for a `src/lib/*` foundation. Purchase flow touched → `pnpm eval`, no step may
  regress to `pending`.
- **Passed** → `state:"passing"`, `passes:true`, dated `evidence` quoting the command output;
  `pnpm attempt <id> --reset`. **Not passed** → leave `passes:false`; on the 3rd attempt set
  `state:"blocked"` + write why. Append a dated **PROGRESS.md** Handoff (what / verification / `Next:`);
  `pnpm status` to confirm honest movement; walk `docs/clean-state-checklist.md`. **Commit only when
  the user asks** — branch off `main`, descriptive message, never `--no-verify`.

If the request can't be done without breaking an invariant, **stop and say so** — name the rail it
would break and offer a compliant alternative. A clean refusal beats a silent breach.
