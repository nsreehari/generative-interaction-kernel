# ADR-0003 — Stateless events; sequencing as data reduced by a pure reducer

**Status:** Accepted — 2026-07-03

## Context

The behavior edge ([ADR-0002](ADR-0002-interaction-as-edge.md)) is stateless: `event → action`.
But some behavior is inherently sequential (wizards, approval flows, multi-step processes) and some
is durable/async (retries, timers, long-running agent loops). The question was how to support
stateful mechanisms without turning the kernel into a workflow engine, given a stated preference
for stateless events.

## Decision

Keep the kernel a **pure reducer**; achieve statefulness by putting state in **data** and reducing
over it. Three tiers, each at the correct layer:

| Tier | Where state lives | Mechanism |
|---|---|---|
| Ephemeral UI state | a namespace value | stateless `assign` |
| Bounded sequencing (wizard/approval) | a declared **Machine** (data); current state is a namespace value | kernel runs a pure `reduce(state, event) → state` |
| Durable / async | the **Orchestrator** provider | kernel `invoke`s out; result returns as event + patch |

A state machine is **declarative data + a stateless reduce** — the machine definition is data, its
current state is a namespace value, and the kernel's job is a pure function. Async is modeled as
**states** (`loading → success | error`), never a kernel-side `await`; the actual awaiting,
retrying, and timing happen in the Orchestrator, whose completion re-enters the machine via an
event and a store write.

**Governing law:** the kernel is always a pure `(state, event) → state`. It never owns memory or
time. State is data in namespaces; durability is a provider.

## Alternatives considered

### A. Stateful sagas as a kernel primitive (awaits, retries, timers, durable execution)
**Rejected because:** it forces the kernel to own memory and time, breaking the pure-reducer law;
it makes validation and agent-authoring materially harder (durable execution semantics are hard to
statically check and to emit correctly); and it duplicates capabilities the Orchestrator provider
already owns.

### B. Kernel-side `await` inside a transition
**Rejected because:** it blocks the reducer and makes the kernel stateful over time. Modeling the
wait as an explicit state keeps the reducer pure and non-blocking.

## Consequences

- Machines are portable, snapshot-testable, replayable, and agent-authorable (they are data with a
  schema and expression-based guards).
- The existing reactive derivation model is the data-only subset of the same reducer.
- Durable execution has a single, correct home (the Orchestrator), surfaced back to the kernel as
  ordinary state.
