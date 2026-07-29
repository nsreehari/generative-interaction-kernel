# ADR-0044: Provider-neutral durable transition runtime

**Status:** Accepted — 2026-07-28

## Context

GIK can open declarative Blueprints, lower them to executable programs, run Kernel transitions, and
delegate durable asynchronous work to provider engines. Those responsibilities do not define the
storage and concurrency boundary needed when a browser, Azure Function, MCP host, or another host
must process an inbox reliably across restarts and competing workers.

The first durable-runtime implementation coupled that boundary to a `DurableKernel` contract and a
persisted `kernelId`. That made provider APIs appear to understand Kernel semantics and left no
neutral place for another pure reducer, interpreter, or execution engine. It also persisted only
state and effects, although execution may evolve the declarative specification that controls the
next transition.

The durable layer needs one model that can acquire multiple ordered events, invoke caller-owned
pure logic, and commit every durable consequence together without interpreting application data.

## Decision

### The durable runtime treats execution values as opaque

The public execution contract is `DurableTransitionAdapter<TState, TSpec, TEvent, TEffect,
TSpecUpdate>`. The host supplies:

- `initialState()` and `initialSpec()`;
- `transition({ state, spec, events })`, returning next state, zero or more effects, and optional
	spec updates; and
- `applySpecUpdates({ spec, updates })`, returning the materialized spec for the next transition.

`spec` means an opaque declarative specification. A caller may bind it to a Blueprint, workflow,
program, policy, or another declarative artifact. Durable runtime and providers do not parse,
validate, lower, execute, or patch it themselves. Likewise, events, effects, and spec updates are
opaque values at this boundary.

Both transition operations are caller-owned and deterministic with respect to their inputs. They
may return synchronously or through a Promise, but they do not perform acquisition or persistence.
The runtime may retry a transition after a failed or lost commit, so external side effects do not
belong inside either operation.

### The runtime owns leased orchestration

`createDurableRuntime` is the host-neutral factory. For each run, it:

1. resolves one provider from the operation's refs;
2. acquires a transition lease and reads state, spec, revision, cursor, and all ordered journal
   entries after that cursor;
3. passes the entry payloads as one event array to `transition`;
4. passes emitted spec updates to `applySpecUpdates`;
5. asks the provider to atomically commit the advanced cursor, next state, materialized spec,
   emitted spec updates, and effects/outbox; and
6. aborts the lease on local execution failure.

An empty effects array is a normal successful result. An absent spec-update list is normalized to
an empty list. `runtimeId` identifies ownership/version compatibility of a persisted runtime; it
does not identify or imply a Kernel.

`createBrowserDurableRuntime` remains a compatibility alias. Browser, Azure, MCP, and future hosts
may all own transition execution; storage location does not determine execution ownership.

### Providers own persistence and concurrency, not execution

`DurableProvider` exposes semantic initialize, acquire, commit, abort, wake, journal, and queue
operations. IndexedDB, Cosmos, and filesystem implementations persist the same opaque transition
checkpoint shape. Connectors and server transports forward that shape without adding Blueprint or
Kernel behavior.

The provider commit is the authoritative transaction boundary. Revision and cursor preconditions,
lease ownership, checkpoint replacement, outbox insertion, and lease release belong to one
provider operation. Backend-specific durability guarantees and hardening remain implementation
concerns and do not change this public contract.

### This boundary is distinct from adjacent architecture

- ADR-0041 owns Blueprint resolution and lowering into a runtime definition. This runtime can carry
  that output as an opaque spec but does not open or lower it.
- ADR-0033 owns reactive state and resumable multi-step workflow engines behind provider seams.
  Such an engine may implement the transition adapter, but durable-runtime does not standardize its
  vocabulary or workflow semantics.
- ADR-0040 owns external service execution and settlement. Durable effects/outbox records may drive
  that lifecycle, but providers do not execute services during transition commit.
- ADR-0003 keeps application event reduction pure and durable async work outside Kernel reduction.
  This decision preserves that split by committing effects for later processing.

## Alternatives considered

### A. Keep `DurableKernel` as the public contract

Rejected because persistence does not need Kernel identity or semantics. It prevents reuse by other
pure execution models and leaks one caller's vocabulary into every provider and transport.

### B. Let providers execute transitions or apply spec updates

Rejected because providers would need application code, Blueprint/Kernel knowledge, and deployment
of arbitrary execution logic. Storage backends would cease to be interchangeable and opaque.

### C. Persist only spec updates and materialize on every acquire

Rejected as the only required model because replay and compaction policy then become provider
semantics. The runtime instead commits the caller-materialized spec and may retain the emitted
update list as transition provenance.

### D. Let the host enqueue effects after committing state

Rejected because a crash between those operations loses effects, while retrying can duplicate a
state transition. Effects belong in the same provider commit as state and cursor.

### E. Process one journal event per transition

Rejected as a universal rule. Acquisition returns the ordered pending batch and the caller decides
how its pure transition interprets that array. The committed cursor covers the complete acquired
batch.

## Consequences

- Durable-runtime is independent of Blueprint and Kernel packages and terminology.
- Hosts can plug in reducers, interpreters, workflow engines, or Kernel adapters through one pure
  contract.
- Spec update semantics remain caller-owned while their durable consequences share the transition
  transaction.
- Provider implementations and remote transports carry a larger checkpoint contract: state, spec,
  spec updates, cursor, revision, lease metadata, and effects.
- Existing persisted records using `kernelId` require migration or reinitialization under
  `runtimeId`.

## Not decided here

- The concrete type or schema of a caller's spec or spec updates.
- Blueprint mutation, merge, validation, or lowering semantics.
- Event-level deduplication, transition idempotency keys, lease renewal, or batch-size policy.
- Backend-specific durability hardening and recovery mechanisms.
- Long-running workflow semantics inside a transition adapter.

## Amendment (2026-07-29): portable Blueprint materialization as opaque spec

ADR-0046 defines one Blueprint binding without changing this provider-neutral contract. A host may
use `{ authoredBlueprint, externalContext, materializedBlueprint }` as `TSpec`, run the shared
`@gik/blueprint` materialized transition, and represent admitted authored patches as `TSpecUpdate`.
The provider atomically stores the caller-materialized next spec with state, cursor, and effects.
It never parses the terminal Blueprint. Stateless workers read the portable materialization from
the acquired spec and need no process-local cache.
