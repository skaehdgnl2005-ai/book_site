import { describe, it, expect } from "vitest";
import { traced, type TraceEvent } from "../../src/lib/observability";
import { collectMetrics, collectMetricsBySession, createCollector } from "../../src/lib/metrics";

// F039 — ops metrics derived from the trace stream (OBSERVABILITY.md H2):
// latency p50/p95, error rate (kind:"error" ÷ events), tool-call failure rate
// (failed tool calls ÷ tool calls). A "tool call" is a traced() outcome — a
// kind:"tool" (ok:true) or kind:"error" (ok:false) event carrying a durationMs.

const ev = (p: Partial<TraceEvent>): TraceEvent => ({
  ts: "t",
  sessionId: "s",
  kind: "tool",
  name: "n",
  ...p,
});

/** Deterministic clock: returns the queued timestamps in order (traced() reads start then end). */
function clockFrom(...times: number[]): () => number {
  const q = [...times];
  return () => q.shift() ?? 0;
}

describe("collectMetrics (F039 / H2)", () => {
  it("computes error rate, tool-call failure rate, and latency percentiles", () => {
    const events: TraceEvent[] = [
      ev({ kind: "tool", ok: true, durationMs: 100 }),
      ev({ kind: "tool", ok: true, durationMs: 200 }),
      ev({ kind: "error", ok: false, durationMs: 300, name: "boom" }),
      ev({ kind: "step", name: "plan" }), // not a tool call (no outcome)
      ev({ kind: "metric", name: "page_load", durationMs: 50 }), // a measurement, not a tool-call latency
    ];

    const m = collectMetrics(events);

    expect(m.events).toBe(5);
    expect(m.toolCalls).toBe(3); // 2 tool + 1 error outcome
    expect(m.errors).toBe(1);
    expect(m.errorRate).toBeCloseTo(1 / 5);
    expect(m.toolCallFailureRate).toBeCloseTo(1 / 3);
    // latency over tool-call durations only ([100,200,300]) — the metric's 50 is excluded.
    expect(m.latencyMs.p50).toBe(200);
    expect(m.latencyMs.p95).toBe(300);
    expect(m.latencyMs.max).toBe(300);
  });

  it("is safe on an empty stream (no NaN / divide-by-zero)", () => {
    const m = collectMetrics([]);
    expect(m.events).toBe(0);
    expect(m.toolCalls).toBe(0);
    expect(m.errorRate).toBe(0);
    expect(m.toolCallFailureRate).toBe(0);
    expect(m.latencyMs.p50).toBeNull();
    expect(m.latencyMs.p95).toBeNull();
    expect(m.latencyMs.max).toBeNull();
  });

  it("reports a zero failure rate when every tool call succeeds", () => {
    const m = collectMetrics([
      ev({ kind: "tool", ok: true, durationMs: 10 }),
      ev({ kind: "tool", ok: true, durationMs: 20 }),
    ]);
    expect(m.toolCallFailureRate).toBe(0);
    expect(m.errorRate).toBe(0);
  });
});

describe("collectMetricsBySession (F039 — aggregate per session)", () => {
  it("groups events by sessionId and aggregates each independently", () => {
    const events: TraceEvent[] = [
      ev({ sessionId: "a", kind: "tool", ok: true, durationMs: 100 }),
      ev({ sessionId: "a", kind: "error", ok: false, durationMs: 200 }),
      ev({ sessionId: "b", kind: "tool", ok: true, durationMs: 300 }),
    ];

    const bySession = collectMetricsBySession(events);
    const a = bySession.find((s) => s.sessionId === "a");
    const b = bySession.find((s) => s.sessionId === "b");

    expect(bySession).toHaveLength(2);
    expect(a?.toolCalls).toBe(2);
    expect(a?.toolCallFailureRate).toBeCloseTo(0.5);
    expect(a?.errorRate).toBeCloseTo(0.5);
    expect(b?.toolCalls).toBe(1);
    expect(b?.toolCallFailureRate).toBe(0);
  });
});

describe("createCollector (F039 — collected from traced())", () => {
  it("accumulates traced() outcomes (success + failure) and reports their rates + latency", async () => {
    const collector = createCollector();
    // success then failure; each traced() reads the clock at start and end.
    const clock = clockFrom(1000, 1100, /* success: 100ms */ 2000, 2300 /* failure: 300ms */);

    await traced("sess", "ok-call", async () => 42, clock, collector.sink);
    await expect(
      traced("sess", "bad-call", async () => {
        throw new Error("nope");
      }, clock, collector.sink),
    ).rejects.toThrow("nope");

    const m = collector.metrics();
    expect(collector.events).toHaveLength(2);
    expect(m.toolCalls).toBe(2);
    expect(m.errors).toBe(1);
    expect(m.toolCallFailureRate).toBeCloseTo(0.5);
    expect(m.latencyMs.max).toBe(300);
    expect(m.latencyMs.p50).toBe(100); // sorted [100,300] → ⌈0.5·2⌉-1 = index 0

    // and it groups per session too
    const [sess] = collector.bySession();
    expect(sess.sessionId).toBe("sess");
    expect(sess.toolCalls).toBe(2);
  });

  it("does not leak PII from a failing tool's error message into the collected event", async () => {
    const collector = createCollector();
    await expect(
      traced("sess", "leaky", async () => {
        throw new Error("contact buyer@example.com");
      }, clockFrom(0, 5), collector.sink),
    ).rejects.toThrow();
    const serialized = JSON.stringify(collector.events);
    expect(serialized).not.toContain("buyer@example.com");
    expect(serialized).toContain("***@***");
  });
});
