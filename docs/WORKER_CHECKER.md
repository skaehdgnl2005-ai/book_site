# Worker ≠ Checker — independent review protocol (F042)

> "Code written" is not "done." The agent that **implements** a feature does not get to
> declare it done. A **separate** reviewer judges it. This is the harness's primary defence
> against *false completion* (Feedback layer, `docs/EVAL.md` G6) and the executable
> companion to it is `pnpm constraints` **R4** (`state:"passing"` ⟺ `passes:true`) — drift
> between "I think it's done" and "it's verified done" is a constraint violation.

Decision of record: **ADR-0005** (worker≠checker). Applied-by gate: **F034** (checkout chain),
**F042** (this protocol). Definition of done: `AGENTS.md` *Definition of done* + DoD #3.

## Roles

- **Worker** — implements the feature test-first (TDD), gets `pnpm check` + the feature's
  E2E to green, and writes the candidate `evidence`. The worker MUST NOT flip
  `state:"passing"`/`passes:true` on their own say-so.
- **Checker** — an **independent** reviewer who did **not** write the implementation. The
  checker re-derives whether the feature meets its spec, runs/reads the gates, and returns a
  verdict. Independence options, strongest first:
  1. a **separate session / sub-agent** with no memory of the implementation choices,
  2. a different person,
  3. at minimum, a fresh adversarial pass that argues *against* the work.

  In this harness the checker is realised as **sub-agents** dispatched with an adversarial
  prompt (see *Stance*), one per review dimension.

## Inputs the checker is given

- The diff (what actually changed) — not the worker's narrative of it.
- The feature's `feature_list.json` entry: `description`, `steps`, `verification`, and the
  DoD (`pnpm check` green **and** a user-facing E2E — directly or via `e2e_via`).
- The relevant spec/ADR and the project rules (`AGENTS.md`, `DESIGN.md`, `docs/CONSTRAINTS.md`).
- The gate output (`pnpm check`, the feature's E2E, `pnpm eval`).

## Stance — refute by default

Every candidate finding is treated as **false until independently verified**. A reviewer who
*suspects* a bug must confirm it against the actual code/behaviour before it counts; a claim
that cannot be substantiated is **dismissed with a recorded reason**, not carried forward as
FUD. Symmetrically, "looks fine" is not a pass — the checker must point at the line/test that
*makes* it fine. This two-way skepticism is what keeps the review from being either a rubber
stamp or a noise generator.

## Dimensions (lenses)

Run the relevant subset; one reviewer per lens keeps each focused and the panel diverse:

| Lens | Asks |
|---|---|
| **Spec compliance** | Does it do exactly what the `feature_list` entry + steps say? Nothing silently missing? |
| **Correctness** | Edge cases, error paths, idempotency, race/TOCTOU, off-by-one. |
| **Security / PII** | Untrusted input wrapped (`untrusted()`); secrets/PII redacted out of logs/traces/fixtures; irreversible actions gated. |
| **Tests have teeth** | Did each test fail before the fix? Would it catch a regression, or does it assert a mock / pass vacuously? |
| **Design SoR** | UI uses `DESIGN.md` tokens (R6/R7); a11y basics (labels, heading order, alt). |
| **Scope** | Only the track's files touched; deviations named + justified (an ADR), conflict-free. |

## Verdict — Accept / Revise / Block

- **Accept** — meets spec, gates green, tests have teeth, no unresolved finding. The feature
  may be marked `passing` with dated `evidence`.
- **Revise** — real findings exist but are bounded and fixable now; the worker fixes, then the
  checker **re-verifies** the specific findings. (This is the common path.)
- **Block** — a fundamental spec/safety problem, or 3 attempts without progress (R5); set
  `state:"blocked"`, write why in `PROGRESS.md`, escalate. Do **not** loop.

## Recording (required before `passes:true`)

The verdict + each finding's resolution (fixed / dismissed-with-reason) is recorded in
`PROGRESS.md` (session log) and, when it carries a decision, in `DECISIONS.md` (an ADR) —
**before** the feature flips to `passing`. The recorded review *is* the evidence the
`verification:"review: ..."` features (F034, F041, F042) point at.

## Worked applications in this repo (not hypothetical)

This protocol has gated every shipped track; representative instances:

- **TRACK-CHECKOUT (F012–F016, F034)** — a PRE-build 33-agent / 6-lens **design** review
  (19 findings folded in *before* code, incl. raw-body-first webhook HMAC + client-side
  `clearCart`-after-PAID), then a POST-build 12-agent **implementation** review → 4
  skeptic-verified findings fixed (production-checkout 503 gate, `getTemplateByKey`
  active-row rejection, tightened email regex). Recorded: ADR-0013.
- **TRACK-MYPAGE (F017, F018)** — 51-agent design review (16/45 confirmed; caught the
  enumeration-oracle gate ordering at design time) → 35-agent implementation review (21/29
  confirmed, all minor). Recorded: ADR-0014.
- **TRACK-POLISH (F036, F037, F039, F040)** — the checker (independent sub-agents) re-reviewed
  the perf/a11y/metrics/eval work; findings + resolutions recorded in `PROGRESS.md` and
  ADR-0015. This is the **applied-to-a-shipped-feature** instance for F042 itself: the
  reviewer of these features was not their implementer.

## Why a separate checker (and not "I tested it")

A worker's after-the-fact "it works" is biased toward the implementation they already wrote —
they verify what they remembered to build, not what the spec requires. An independent checker
re-derives the requirement and attacks the result. Tests-first proves a test *can* fail; an
independent checker proves the *feature* meets its contract. Both are required; neither
substitutes for the other.
