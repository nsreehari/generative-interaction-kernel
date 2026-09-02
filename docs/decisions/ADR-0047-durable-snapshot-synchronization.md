# ADR-0047: Durable snapshot synchronization with bounded patch fallback

**Status:** Accepted — 2026-08-04

## Context

ADR-0044 established a provider-neutral durable transition runtime whose providers own committed
state, opaque spec, revisions, leases, journals, and effects. It did not define how a UI, backend,
worker, CLI, or other headless consumer reads committed state without taking a writer lease or
learns that another process committed a newer revision.

Using `acquireTransition` followed by `abortTransition` for reads temporarily acquired an exclusive
writer lease, included journal data that readers did not need, and treated normal read cleanup as
transition failure handling. Always transferring a full snapshot was correct but wasteful for
frequent checks. Conversely, unbounded patch history would add retention, compaction, ordering, and
recovery policy to every provider.

This synchronization concern is not the Kernel transport reconnection model in ADR-0012. Kernel
protocol patches describe Kernel state evolution and may be replayed by a transport broker. Durable
snapshot changes synchronize opaque `{ state, spec }` checkpoints identified by provider revisions
and can be consumed without React, a renderer, or a Kernel.

## Decision

### Committed reads never acquire a transition lease

`DurableProvider.readSnapshot` returns the authoritative committed state, opaque spec, and revision.
It does not inspect, acquire, release, or modify a transition lock and does not return journal,
lease, cursor, wake, or effects data.

`readSnapshotChanges({ afterRevision })` is the revision-aware synchronization operation. It returns
one of three results:

- `unchanged` when `afterRevision` is the current committed revision;
- `changes` when `afterRevision` is exactly the base of the one retained snapshot patch; or
- `reset` with the full authoritative snapshot when the revision is absent, unknown, or too old.

A missing runtime or mismatched `runtimeId` is rejected consistently with other runtime operations.

### Providers retain one bounded RFC 6902 patch

Each successful transition commit computes an RFC 6902 patch over the checkpoint document
`{ state, spec }`. The patch records its opaque `baseRevision` and resulting `revision` and is stored
atomically with the resulting checkpoint. A provider retains only that latest one-revision patch.
Existing records without patch metadata remain readable and produce `reset`.

Consumers use `applyRuntimeSnapshotChanges` to validate the base revision and apply `unchanged`,
`changes`, or `reset` without mutating the input snapshot. A patch whose base does not match the
consumer revision is rejected rather than applied speculatively.

This patch is a checkpoint synchronization artifact. It is not a Kernel `Patch`, a semantic
`BlueprintPatch`, a `ProgramPatch`, or a spec-update instruction. Durable providers continue to
treat state and spec as opaque JSON values.

### Subscription is framework-neutral and transport-independent

`createDurableRuntime().subscribe(refs, listener, options)` is available to any consumer. The
baseline implementation performs serialized polling over `readSnapshotChanges`:

- at most one provider read is active per subscription;
- unchanged revisions do not invoke the listener;
- multiple commits between polls safely degrade to `reset`;
- the local revision advances before listener delivery;
- errors are reported through `onError` and polling continues; and
- the returned unsubscribe function prevents future polling and delivery.

Polling is the portable safety baseline, not a requirement that every transport remain polling-only.
A provider may implement `subscribeSnapshotInvalidations` to wake the same serialized scheduler.
The runtime coalesces notification bursts, performs immediate catch-up after attachment and
reconnection, and retains periodic safety polling for missed notifications. Notifications carry
only `runtimeId`, `stateRef`, and an optional advisory revision; they are invalidations, not
authoritative snapshot payloads.

The initial adapters use `BroadcastChannel` after committed IndexedDB transactions, a custom MCP
notification driven by the filesystem server's checkpoint watcher, and Azure SignalR after
successful Cosmos-backed commits. Notification publication failure never changes commit success.

React is one possible consumer. `gik-react/durable` translates durable-runtime changes into its
existing `GenUISource` tree notification and stops its subscription with the source lifecycle, but
neither the durable provider contract nor subscription semantics depend on React or another UI
framework.

## Alternatives considered

### A. Acquire and abort a transition for every read

Rejected because readers should not contend for a writer lease, block processing, receive pending
journal entries, or use abort as routine cleanup.

### B. Always return the full snapshot

Retained as the correctness fallback but rejected as the only response. A current consumer can avoid
state transfer, and a one-revision follower can apply a bounded delta safely.

### C. Retain an unbounded or configurable patch chain

Rejected for the current contract because every provider would need patch-log retention,
compaction, ordering, and migration policy. One retained patch bounds storage and makes recovery
behavior explicit. Longer histories may be added later as an optimization without weakening reset.

### D. Put snapshots or patches directly in notifications

Rejected because notification delivery may be duplicated, delayed, or lost. Notifications indicate
that a read may be useful; `readSnapshotChanges` remains the authoritative recovery operation.

### E. Standardize SSE as the durable subscription API

Rejected because SSE is a transport choice and does not fit direct IndexedDB, filesystem, backend,
CLI, or in-process consumers. The runtime API remains provider- and transport-neutral.

### F. Reuse Kernel protocol revisions and patches

Rejected because durable runtime is execution-model-neutral and persists opaque state and spec.
Kernel, Blueprint, and durable checkpoint revisions have different ownership and semantics.

## Consequences

- Read-only consumers never interfere with transition leases.
- UI and non-UI consumers share one durable synchronization API.
- Current consumers avoid payload transfer; one-revision followers receive compact patches; lagging
  consumers recover through an authoritative reset.
- Provider storage growth is constant because only one patch is retained.
- State and spec changes are synchronized atomically under one resulting revision.
- Providers and remote protocols add a required `readSnapshotChanges` operation.
- Polling latency and load remain configurable safety tradeoffs when push wakeups are attached.
- IndexedDB, filesystem MCP, and Azure SignalR can reduce synchronization latency without becoming
  authoritative state transports.
- Durable snapshot patches must not be interpreted as application commands or Kernel protocol
  patches.

## Not decided here

- A longer retained patch history or provider-specific compaction policy.
- Delivery guarantees beyond lossy invalidation and future transport adapters such as Firestore.
- Cross-runtime fan-out infrastructure or subscription authorization.
- Automatic subscription wiring in server, worker, or CLI hosts beyond the implemented React host.
- Snapshot compression, field projection, or partial-spec synchronization.
