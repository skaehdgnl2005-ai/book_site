import { redact } from "./env";

/**
 * Minimal structured tracing (G-TRACE / H1). One JSON line per step / tool call /
 * error / metric so sessions are replayable and post-hoc debuggable. Free-text
 * attrs are redacted to keep secrets and PII out of traces (E3).
 */
export interface TraceEvent {
  ts: string;
  sessionId: string;
  kind: "step" | "tool" | "error" | "metric";
  name: string;
  durationMs?: number;
  ok?: boolean;
  attrs?: Record<string, string | number | boolean>;
}

export function emit(event: TraceEvent, sink: (line: string) => void = console.log): void {
  const safeAttrs = event.attrs
    ? Object.fromEntries(
        Object.entries(event.attrs).map(([k, v]) => [
          k,
          typeof v === "string" ? redact(v) : v,
        ]),
      )
    : undefined;
  sink(JSON.stringify({ ...event, attrs: safeAttrs }));
}

/** Wrap an async tool/step so its latency + outcome are traced (H1/H2). */
export async function traced<T>(
  sessionId: string,
  name: string,
  fn: () => Promise<T>,
  now: () => number = () => Date.now(),
  sink: (line: string) => void = console.log,
): Promise<T> {
  const start = now();
  try {
    const result = await fn();
    emit(
      { ts: new Date(start).toISOString(), sessionId, kind: "tool", name, durationMs: now() - start, ok: true },
      sink,
    );
    return result;
  } catch (err) {
    emit(
      {
        ts: new Date(start).toISOString(),
        sessionId,
        kind: "error",
        name,
        durationMs: now() - start,
        ok: false,
        attrs: { message: String(err) },
      },
      sink,
    );
    throw err;
  }
}
