# Evaluation & Feedback (category G)

"Code written" is not "done". Completion is judged by **independent, executable** checks,
not by the implementer (worker ≠ checker).

## Eval harness (G1)
`pnpm eval` runs the canonical multi-step **purchase flow** (`eval/golden/purchase-flow.json`)
as graded steps and reports agent-style metrics. As features land, flip a step's `impl`
to `true` and point `verify` at the real E2E/integration check. Unbuilt steps report as
**pending** — never counted as success (honest scoring).

## Metrics (G3)
Reported per run / per task:
- **task_success_rate** — graded steps passing ÷ total.
- **step_efficiency** — optimal_steps ÷ steps taken.
- **tool/argument correctness** — did the step call the right check with the right inputs.
- From traces (`docs/OBSERVABILITY.md`): latency, error rate, tool-call failure rate.

## Golden & regression sets (G2)
- `eval/golden/*.json` — versioned canonical cases; the behavior baseline.
- E2E specs (`tests/e2e/*`) are the regression net for shipped features.

## Holdout / no overfitting (G4)
- `eval/holdout/*.json` is **reserved**. It is used only for a final regression read and
  **never** for tuning or iteration. Tuning against it would inflate scores. The two sets
  use different cards/quantities so passing golden doesn't guarantee passing holdout.

## Grading (G5)
- Deterministic where possible: E2E assertions + the constraints checker.
- For subjective output (e.g. catalog copy, error UX), use an **LLM-as-judge** rubric pass
  and escalate borderline cases to human review.
- **Worker ≠ checker (F042):** the agent that implements a feature does not mark it done.
  A separate review pass (or sub-agent) returns **Accept / Revise / Block**; the result is
  recorded in `PROGRESS.md` before `passes:true`. Full protocol: **`docs/WORKER_CHECKER.md`**
  (roles, refute-by-default stance, review dimensions, recording rules, worked applications).

## Failure clustering (G6)
Triage failures by the build-guide's 5 layers, not one-offs:
| Layer | Symptom | Fix |
|---|---|---|
| Task spec | ambiguous done | sharpen `feature_list` step + verification |
| Context (SoR) | knowledge not in repo | move it into a doc; cold-start test |
| Environment | can't run/test | `init.sh`, version pins, `docker-compose` |
| Feedback | false completion | add E2E + checker before `passes:true` |
| State | drift across sessions | `PROGRESS.md` + git checkpoints + handoff |

Recurring clusters become new `check-constraints` rules or new golden cases.
