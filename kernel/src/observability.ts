// ObservabilitySink reference implementations + the required trace points (ADR-0020).
//
// The kernel emits a `TraceEvent` to its optional `sink` at fixed points; a profile plugs
// in a concrete sink (console, OpenTelemetry, ETW, file). The kernel depends only on the
// `TraceSink` type, so these implementations are optional conveniences, not core.
//
// Required trace points (every conforming kernel MUST emit these, and only these kinds):
//   - "resolve"    : a node resolved to a real capability (interpret).
//   - "fallback"   : a node's capability was not in the registry -> graceful fallback (interpret).
//   - "action"     : a closed-grammar store action ran (assign/derive/emit) (reduce).
//   - "transition" : a machine changed state (reduce).
//   - "effect"     : an orchestrator effect was requested (invoke/confirm/navigate), or an
//                    unhandled effect was dropped (reduce/kernel).
//   - "validate"   : validate-before-commit ran (kernel/authoring boundary).
// The set is closed and matches `TraceEvent["event"]`; sinks may format but not invent kinds.

import type { TraceEvent, TraceSink } from "./types";

/** The canonical, closed set of trace-point kinds a kernel emits. */
export const TRACE_POINTS = [
  "resolve",
  "fallback",
  "action",
  "transition",
  "effect",
  "validate",
] as const satisfies ReadonlyArray<TraceEvent["event"]>;

/** Format a trace as one stable, human-readable line (used by {@link consoleSink}). */
export function formatTrace(t: TraceEvent): string {
  const parts: string[] = [t.event.toUpperCase()];
  if (t.node) parts.push(`node=${t.node}`);
  if (t.detail && Object.keys(t.detail).length > 0) parts.push(JSON.stringify(t.detail));
  return parts.join(" ");
}

/** A sink that writes each trace as a formatted line to a console-like target. */
export function consoleSink(out: { log(msg: string): void } = console): TraceSink {
  return (t) => out.log(formatTrace(t));
}

/**
 * A sink that collects traces into an array — for tests, snapshots, and dev tooling.
 * Returns the sink to pass as `opts.sink` plus the live buffer it fills.
 */
export function bufferSink(): { sink: TraceSink; events: TraceEvent[] } {
  const events: TraceEvent[] = [];
  return {
    sink: (t) => {
      events.push(t);
    },
    events,
  };
}

/** Fan every trace out to several sinks (e.g. console + an exporter) as one `TraceSink`. */
export function multiSink(...sinks: TraceSink[]): TraceSink {
  return (t) => {
    for (const s of sinks) s(t);
  };
}
