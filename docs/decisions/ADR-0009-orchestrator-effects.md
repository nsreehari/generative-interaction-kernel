# ADR-0009: Orchestrator — invoke/confirm/navigate as post-reduction effects

**Status:** Accepted

**Amended by:** [ADR-0049](ADR-0049-stable-event-contracts-and-effect-settlements.md) replaces `confirm` with resolver-neutral `request`, uses `control`/`data`, and standardizes effect settlements.

## Context

[ADR-0003](ADR-0003-stateless-events-with-reducer.md) fixed sequencing as data reduced by a **pure
reducer**: an event reduces to a patch with no side effects, no time, no I/O. But three of the six
action families are inherently effectful — `invoke` (call a tool/backend), `confirm` (human-in-the-
loop approval), and `navigate` (routing). Through Phase 2 these were parked: the reducer merely
traced them as `deferred` and produced no patch. Something had to actually perform them without
breaking reducer purity, and open item "async resources / where does awaiting live" had to resolve.

## Decision

Effectful actions become **effects the kernel runs after reduction**, executed by an **Orchestrator**
provider. The reducer stays pure:

- The pure reducer emits, alongside `ops` and `traces`, a list of **`OrchestratorEffect`s** — a
  request record (`kind`, `node`, `tool`/`to`, `args`, triggering `payload`). It performs nothing.
- The kernel, after applying the reduction's ops, hands each effect to the matching Orchestrator
  method (`invoke` / `confirm` / `navigate`). The Orchestrator owns time and I/O.
- An Orchestrator returns an **`OrchestratorResult`**: optional store `ops` (e.g. a fetched result
  written to a namespace) and optional follow-up **`events`** (e.g. `resolved`, or a human's
  `approved`). The kernel applies the ops and **recursively settles** each follow-up event.
- **One `dispatch` = one `rev`**, regardless of how many effects and follow-up events it fans out to;
  the returned patch is the fully *settled* delta. A depth bound guards runaway effect/event chains.
- **Async data is modeled as machine states** (`idle → loading → ready`), not as awaited values in
  the reducer: the triggering event moves the machine to `loading`; the Orchestrator's follow-up
  event moves it to `ready`. This keeps loading/error/retry declarative and inspectable.
- The default provider is a **`NullOrchestrator`**: effects with no handler are traced `unhandled`
  and change nothing — so a document referencing tools runs harmlessly before wiring exists.

`emit` remains an **internal** event on the reducer's own queue (no Orchestrator); `invoke`/`confirm`/
`navigate` are the only actions that cross the Orchestrator boundary.

## Alternatives considered

- **Await inside the reducer.** Rejected: it destroys purity/determinism (ADR-0003), makes replay
  and testing time-dependent, and couples the reducer to transport and tool latency.
- **A separate "effects kernel" / second grammar.** Rejected: same reasoning as ADR-0002 — effects
  are expressed as ordinary behavior-edge actions; only their *execution* is externalized, not the
  grammar.
- **Renderer performs the effect.** Rejected: it violates ADR-0006 (renderers only emit events, never
  reach out) and would let two adapters diverge on side-effect behavior.
- **Fire effects, ignore results.** Rejected: real flows need the result to feed back (fetched rows,
  approval outcome). Returning `ops` + `events` and settling them keeps the loop closed and one patch
  per dispatch.

## Consequences

- `invoke`/`confirm`/`navigate` are now real and testable: a fetch settles as a store delta plus an
  `idle→loading→ready` transition; a confirm returns the human's follow-up event; a navigate reaches
  routing without touching the store — all in one dispatch, one rev.
- The reducer is still pure and replayable; all non-determinism lives behind the Orchestrator seam,
  which a profile supplies (default: no-op).
- Store seeding from a real fetch (noted as Phase 3 in [ADR-0008](ADR-0008-first-render-adapter-react.md))
  is now the Orchestrator's job, as intended.
- Open surface remaining: a standard confirm/HITL UX contract, cancellation/retry semantics, and
  streaming/partial results are follow-ons, not yet fixed.
