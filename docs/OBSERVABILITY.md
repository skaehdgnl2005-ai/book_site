# Observability & Operations (category H + G-TRACE)

## Tracing (H1 / G-TRACE)
`src/lib/observability.ts` emits **one JSON line per event** so sessions are replayable
and post-hoc debuggable:

```json
{"ts":"2026-06-01T...","sessionId":"...","kind":"tool","name":"checkout.session.create","durationMs":142,"ok":true,"attrs":{...}}
```

- `kind ∈ {step, tool, error, metric}`. Wrap async work with `traced(sessionId, name, fn)`
  to capture latency + outcome automatically.
- `attrs` are passed through `redact()` — secrets/PII never land in a trace (E3).
- In production, point the `sink` at your log/OTel pipeline; the shape is OTel-friendly
  (name, duration, ok, attrs).

## Operational metrics (H2)
Derive from the trace stream:
- **latency** (`durationMs`, track p50/p95 — budget below),
- **error rate** (`kind:"error"` ÷ total),
- **tool-call failure rate** (`ok:false` ÷ tool events),
- **token / cost** per task once model calls are added (record as `kind:"metric"`).

## Budgets (H3)
- **Page load p95 < 2s** (catalog & detail) — asserted by `tests/e2e/perf.spec.ts` (F025).
- Per-task **step / token / cost** budget tracked (F029); warn on overage.
- Cost discipline: cache where safe, route to the smallest model that passes eval,
  parallelize independent checks.

## Where to look when something breaks
1. `PROGRESS.md` — last verified state + known issues.
2. Trace lines for the failing `sessionId` (redacted).
3. `pnpm constraints` — structural/guardrail violations.
4. `pnpm eval` — which purchase-flow step regressed.
