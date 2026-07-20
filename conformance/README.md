# Conformance runner contract

The behavioral matrix (`cases/*.case.json`, [ADR-0015](../docs/decisions/ADR-0015-conformance-matrix.md))
is language-neutral **data**. Each kernel implementation ships its own *runner* that loads these cases
and asserts its reducer produces the specified patches and resolved tree. The reference (TypeScript)
runner lives in [`../kernel/test/conformance.test.ts`](../kernel/test/conformance.test.ts); a second
kernel (e.g. a C# core) proves equivalence by passing the **same** cases.

This document pins the semantics a runner MUST honor so that "pass" means the same thing in every
language. Everything here is normative; the case schema (`conformance-case.schema.json`) only gates
*shape*, not the behavior below.

## Case lifecycle

1. **Load** `manifest`/`document`. Each may be an **enveloped** message (`{ gik, type, payload }`)
   or a **bare payload**; the runner unwraps to the payload when a `gik` field is present. When
   `manifestRef`/`documentRef` is given instead, resolve it as a path **relative to the case file**.
2. **Namespaces** come from `manifest.namespaces`; the store is keyed by those namespace roots.
3. **Seed then init.** Apply the `seed` ops (if any) to the store, *then* seed machine states
   (`init`). This ordering is significant: seed represents fetched/computed state that exists before
   the document is initialized.
4. **`expectInvalid`.** If true, constructing the kernel with validation enabled MUST fail
   (throw / exception / error `Result` — whatever the host language uses for a rejected document).
   No steps run.
5. **`expectInitialResolve`.** Assert on the resolved tree after `init`, before any event.
6. **Steps.** For each step, dispatch `event`, then assert `expectPatch` against the initiating patch,
  `expectSettledPatch` against a detached invocation's terminal patch, and `expectResolve` against
  the freshly resolved tree when those expectations are present.

A case MAY also declare an `orchestrator` script (see below) to exercise deferred effects.

## Revision & patch rules

- **One dispatch = one patch = one rev.** Every `dispatch` returns exactly one patch and increments
  the revision by **exactly 1**, *even when `ops` is empty*. A no-op event still bumps the rev.
- `init` establishes the baseline at **rev 0**; the first `dispatch` therefore returns **rev 1**.
  Revisions are strictly monotonic (`rev = 0, 1, 2, …`).
- A dispatch that fans out through `emit` and/or Orchestrator effects still collapses to a single
  patch at a single rev — the accumulated ops, in order.

## Op-order is part of the contract

`patch.ops` is an **ordered** list and is compared order-sensitively. A conforming kernel MUST emit
ops in this deterministic order:

1. Reducer ops in evaluation order — actions in the order declared on the node's edge; `emit`
   fan-out drives machines and appends their writes in emit/queue order.
2. Then any Orchestrator effect `result.ops` (in effect order).
3. Then, recursively, the ops of each follow-up event an effect produced.

Two kernels that produce the same ops in a different order do **not** conform.

## Scripted Orchestrator effects

Deferred effects (`invoke` / `confirm` / `route`) cross the Orchestrator seam
([ADR-0009](../docs/decisions/ADR-0009-orchestrator-effects.md)); the reducer only *requests* them. A
case MAY exercise this seam by declaring an `orchestrator` array of **deterministic, canned**
responses — no clock, RNG, or IO, so the case stays reproducible.

Each entry is `{ on, result }`:

- **`on`** matches an effect: `kind` (required) plus optional `node` and `tool` (a `tool` matcher
  only applies to `invoke`). The runner returns the **first** matching entry's `result`; an effect
  with no match is unhandled and contributes nothing.
- **`result`** is `{ ops?, events? }` — the same shape a real Orchestrator returns: direct store
  `ops` and/or follow-up `events`, both settled **inside the same dispatch**.

A conforming runner routes each collected effect to its match, applies `result.ops`, then recursively
settles each `result.events` event — exactly the order pinned above (reducer ops, then effect
`result.ops`, then follow-up-event ops). The whole fan-out is still **one patch at one rev**. The
Orchestrator itself is not modeled beyond this canned response; the runner supplies no real tools,
time, or HITL UI — only the scripted result.

## Op semantics

| `op` | Meaning at `path` |
|---|---|
| `set` | Replace the value at `path` wholesale. |
| `merge` | Shallow key-combine the given object into the object at `path` (existing sibling keys preserved). |
| `remove` | Delete the leaf at `path`. |

`path` is a dot-delimited, namespace-rooted path (e.g. `card_data.profile.a`).

## Value equality

Assertions compare JSON values structurally, with these cross-language rules:

- **Numbers** compare by numeric value. A typed runner MUST NOT distinguish `1` from `1.0`, nor
  fail on int-vs-float representation — JSON has a single number type.
- **Objects** compare independent of key order.
- **Arrays** compare order-sensitively (including `patch.ops`, per above).
- `resolveExpectation.props` is **partial**: only the listed keys are asserted (deep-equal); other
  props on the node are ignored. `visible` / `fallback` / `capability` are asserted exactly.
- A node is located in the resolved tree by `id` via depth-first search. `fallback` is true iff the
  node's `capability` is **not** present in the manifest registry.

## Determinism

The reduce and resolve paths MUST be pure: no wall-clock, no RNG, no IO. The same case yields the
same patches and the same resolved tree on every run and in every conforming kernel.

## Out of scope (deliberately not on the contract)

- **Traces / observability.** Trace points are an out-of-core diagnostic seam
  ([ADR-0020](../docs/decisions/ADR-0020-observability-sink.md)); cases assert nothing about them.
- **Live Orchestrator behavior.** A case scripts only **canned** effect responses (above). Real tool
  execution, timing, retries, and HITL UI are the host Orchestrator's concern and are not modeled;
  cases assert only the reducer-observable result (patches + resolves) of a scripted response.
- **Streaming.** v0.1 delivers a complete document per message
  ([ADR-0022](../docs/decisions/ADR-0022-defer-streaming.md)).
