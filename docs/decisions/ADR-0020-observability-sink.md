# ADR-0020 — ObservabilitySink: fixed trace points + reference sinks

**Status:** Accepted — 2026-07-04

## Context

The kernel already emits a `TraceEvent` to an optional `sink` at various points, and the `trace`
GUP message exists. But the *set* of trace points was implicit (only what the code happened to
emit), and there was no reference sink — so a profile couldn't rely on which events fire, and every
consumer had to hand-roll formatting/collection. To make observability a real seam, the trace-point
set has to be a stated contract and there needs to be at least one reference target.

## Decision

Fix the trace points as a **closed set** matching `TraceEvent["event"]`, exported as `TRACE_POINTS`
(`kernel/src/observability.ts`), and document when each fires:

- `resolve` / `fallback` — a node resolved to a real capability, or fell back (interpret).
- `action` — a closed-grammar store action ran: assign/derive/emit (reduce).
- `transition` — a machine changed state (reduce).
- `effect` — an orchestrator effect was requested or an unhandled effect was dropped (reduce/kernel).
- `validate` — validate-before-commit ran (kernel/authoring boundary).

Ship three reference sinks over the existing `TraceSink` type — kept optional, not core:
`consoleSink(out?)` (formats one stable line via `formatTrace`), `bufferSink()` (collects into an
array for tests/tooling), and `multiSink(...sinks)` (fan-out to several targets, e.g. console + an
exporter). Concrete exporters (OpenTelemetry, ETW, file) are downstream sinks that satisfy the same
type; the kernel stays dependency-free.

## Alternatives considered

- **Bake OpenTelemetry/ETW into the kernel.** Couples the portable core to a specific backend and
  its dependencies; a `TraceSink` adapter keeps those out-of-core.
- **Leave trace points implicit.** A second kernel couldn't emit an equivalent trace stream, and
  tools couldn't rely on the vocabulary; a closed, documented set makes traces portable.
- **Put traces on the observable conformance contract.** Rejected in ADR-0015 — traces are impl
  detail that may differ between kernels; conformance asserts patches + resolved props only. Trace
  points are a *convenience/observability* contract, deliberately weaker than the behavioral one.

## Consequences

- Consumers can depend on which events fire and plug any backend behind one `TraceSink`.
- `bufferSink` gives tests and dev tooling a first-class way to assert on emitted traces.
- Concrete exporter sinks and the required per-point `detail` fields remain open for a later pass;
  the *kinds* are now fixed.
