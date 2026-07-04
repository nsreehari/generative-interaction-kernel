# ADR-0025: Scripted Orchestrator effects in the conformance matrix

**Status:** Accepted

## Context

Deferred effects — `invoke` / `confirm` / `navigate` — are the one behavioral surface the reducer
*requests* but does not perform: they cross the Orchestrator seam
([ADR-0009](ADR-0009-orchestrator-effects.md)), which owns time, tool calls, and human-in-the-loop
approval. The behavioral conformance matrix ([ADR-0015](ADR-0015-conformance-matrix.md)) and its
runner contract ([ADR-0023](ADR-0023-conformance-runner-portability.md)) deliberately ran with **no
Orchestrator**, so cases only exercised pure reducer output. That left a real gap: the *settle*
mechanics an effect drives — applying an effect's returned `ops`, then recursively settling its
follow-up `events`, all inside one dispatch at one rev, in a contractual order — were asserted only by
the TypeScript kernel's own unit tests. A second kernel could pass all ten cases yet still route
effects differently, and no case would catch it. Open item 7 named exactly this: scripting a
`confirm`/`invoke` response into a JSON case.

The second (C#) kernel ([ADR-0024](ADR-0024-second-kernel-csharp.md)) sharpened the need: it had
collected effects but never routed them, because nothing in the matrix demanded it.

## Decision

Add a **deterministic, canned Orchestrator script** to the conformance case format, and make the effect
seam part of the portable contract.

- **Case schema** gains an optional `orchestrator` array. Each entry is `{ on, result }`: `on` matches
  an effect by `kind` (required) plus optional `node` / `tool`; `result` is `{ ops?, events? }` — the
  same shape a real Orchestrator returns. The runner returns the first matching entry's result; an
  unmatched effect is unhandled and contributes nothing.
- **Both runners** (`kernel/test/conformance.test.ts` and `GenUI.Conformance`) build a
  `ScriptedOrchestrator` from that array and construct the kernel with it. The script is pure data —
  no clock, RNG, or IO — so cases stay reproducible.
- **The C# kernel gained the seam it was missing**: an `IOrchestrator` (invoke/confirm/navigate →
  `OrchestratorResult?`), an enriched `Effect` (carrying `tool`/`args`/`payload` for matching), and a
  `settle` recursion in `Dispatch` that applies `result.ops` and recursively settles `result.events` —
  one dispatch = one rev regardless of fan-out. This mirrors `kernel.ts` exactly.
- **The runner contract** (`conformance/README.md`) is updated: scripted effects move from "out of
  scope" to a defined, optional facility, and the op-order rule (reducer ops → effect `result.ops` →
  follow-up-event ops) is now demonstrated, not just described.

Two new cases exercise it: `11-orchestrator-invoke-cascade` (a press runs an `invoke`, the script
returns fetched rows plus a `resolved` event, driving a machine `idle → loading → ready` — three ops
at one rev in order) and `12-orchestrator-confirm-approved` (a `confirm` whose scripted approval
produces the only write of the dispatch). Both pass on **both** kernels.

This resolves the effect-seam half of open item 7.

## Alternatives considered

- **Leave effect settling to per-kernel unit tests.** Rejected: unit tests are language-bound, so they
  cannot prove two kernels *agree* on settle order and one-rev collapse. The whole point of the matrix
  is that "pass" means the same behavior everywhere; the effect seam was the one place it did not.
- **Model a richer Orchestrator (real tools, async timing, retries).** Rejected for the contract: time
  and IO are non-deterministic and belong to the host, not the portable matrix. A canned response
  captures exactly the reducer-observable consequence (patches + resolves) without importing
  non-determinism. Live Orchestrator behavior stays explicitly out of scope.
- **Match effects only by kind.** Rejected as too coarse: a document with two invokes (different tools)
  or a mix of confirm/navigate needs to script distinct responses. Optional `node`/`tool` matchers keep
  the common case terse while allowing precision; first-match keeps it deterministic.
- **Assert traces/effect records directly instead of their store consequences.** Rejected: traces are
  an out-of-core diagnostic seam ([ADR-0020](ADR-0020-observability-sink.md)) and may legitimately
  differ across kernels. The contract stays on patches + resolves.

## Consequences

- The effect seam is now portable-contract behavior: a second kernel that mis-orders or drops effect
  fan-out fails a shared case, not just a TypeScript unit test.
- The C# kernel is no longer effect-blind — it has a real `IOrchestrator` and settle loop, so it can
  host scripted (and, later, real) orchestration on the same code path as the reference.
- Cases can now express async-data and HITL flows (fetch → machine, confirm → write) as pure data.
- Still open under item 7: nothing further — the effect-seam gap it named is closed. Broader
  Orchestrator realism (real tools/timing) remains deliberately out of the conformance contract.
