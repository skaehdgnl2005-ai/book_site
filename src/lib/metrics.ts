import type { TraceEvent } from "./observability";

/**
 * Ops metrics (H2) derived from the trace stream `src/lib/observability` emits.
 *
 * The trace stream is the source of truth; this module only *reads* it, so metrics
 * never diverge from what actually happened. A "tool call" is a `traced()` outcome —
 * a `kind:"tool"` (ok:true) or `kind:"error"` (ok:false) event carrying a durationMs.
 * Plain `step`/`metric` events are not tool calls (no operation outcome).
 *
 * Definitions (OBSERVABILITY.md H2):
 *   - error rate            = error events ÷ all events
 *   - tool-call failure rate = failed tool calls ÷ tool calls
 *   - latency p50/p95/max    = over tool-call durations
 */
export interface LatencyMs {
  p50: number | null;
  p95: number | null;
  max: number | null;
}

export interface OpsMetrics {
  events: number;
  toolCalls: number;
  errors: number;
  errorRate: number;
  toolCallFailureRate: number;
  latencyMs: LatencyMs;
}

export interface SessionMetrics extends OpsMetrics {
  sessionId: string;
}

const isToolCall = (e: TraceEvent): boolean =>
  (e.kind === "tool" || e.kind === "error") && typeof e.ok === "boolean";

/** Nearest-rank percentile: sorted[⌈p·n⌉-1]. Returns null for an empty sample. */
function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1];
}

export function collectMetrics(events: TraceEvent[]): OpsMetrics {
  const toolCalls = events.filter(isToolCall);
  const errors = events.filter((e) => e.kind === "error");
  const failures = toolCalls.filter((e) => e.ok === false);
  const latencies = toolCalls
    .map((e) => e.durationMs)
    .filter((d): d is number => typeof d === "number");

  return {
    events: events.length,
    toolCalls: toolCalls.length,
    errors: errors.length,
    errorRate: events.length ? errors.length / events.length : 0,
    toolCallFailureRate: toolCalls.length ? failures.length / toolCalls.length : 0,
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: latencies.length ? Math.max(...latencies) : null,
    },
  };
}

export function collectMetricsBySession(events: TraceEvent[]): SessionMetrics[] {
  const bySession = new Map<string, TraceEvent[]>();
  for (const e of events) {
    const list = bySession.get(e.sessionId);
    if (list) list.push(e);
    else bySession.set(e.sessionId, [e]);
  }
  return [...bySession.entries()].map(([sessionId, evs]) => ({
    sessionId,
    ...collectMetrics(evs),
  }));
}

export interface Collector {
  /** Pass as the `sink` to `traced()` / `emit()` — it parses each JSON trace line into an event. */
  sink: (line: string) => void;
  /** The accumulated (already-redacted) trace events. */
  events: TraceEvent[];
  /** Aggregate ops metrics over everything collected so far. */
  metrics: () => OpsMetrics;
  /** Per-session breakdown. */
  bySession: () => SessionMetrics[];
}

/**
 * An in-memory collector that turns the trace stream into queryable metrics. Because it
 * consumes `emit()`'s already-redacted JSON lines, secrets/PII never reach the metrics
 * either (E3). Drop-in: `traced(sessionId, name, fn, now, collector.sink)`.
 */
export function createCollector(): Collector {
  const events: TraceEvent[] = [];
  return {
    events,
    sink: (line: string) => {
      try {
        events.push(JSON.parse(line) as TraceEvent);
      } catch {
        // A non-JSON sink line is not a trace event — ignore rather than corrupt metrics.
      }
    },
    metrics: () => collectMetrics(events),
    bySession: () => collectMetricsBySession(events),
  };
}
