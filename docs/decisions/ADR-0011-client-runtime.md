# ADR-0011: Client runtime — interpret + state replica on the renderer side

**Status:** Accepted

## Context

[ADR-0010](ADR-0010-transport-seam.md) let a host publish `manifest`/`document`/`patch` and accept
`event`s over a transport, but nothing on the *other* end consumed them — the transport tests used a
raw client that manually pushed events and collected patches. To actually drive a renderer over the
wire, two questions had to be answered:

1. **Who resolves?** A renderer needs *resolved* nodes (gate/props/children computed from state), but
   the protocol only carries `document` (structure) and `patch` (state deltas), never resolved trees.
2. **How does a fresh client get initial state?** `init()` emits only machine-state deltas; seeded or
   fetched data (e.g. `fetched_sources.orders`) would never reach a remote client that starts empty.

## Decision

Split the runtime cleanly across the wire and add a reference client:

- **The authoritative reducer stays on the host; interpretation moves to the client.** The client
  runs the *pure, read-only* interpreter (`resolveNode`) against a **local state replica**; the host
  owns the reducer and all writes. Reads are safe to duplicate (pure); writes are not, so they stay
  singular and authoritative on the host — preserving validate-before-commit and the pure-reducer law.
- **`GenUIClient`** (`kernel/client.ts`) consumes `manifest` (→ builds its `CapabilityRegistry` and an
  empty replica for the declared namespaces), `document` (→ the node tree to interpret), and each
  `patch` (→ applied to the replica). After document/patch it re-resolves and notifies subscribers.
  It emits `event`s back over the transport and never references the kernel.
- **Baseline as a full snapshot.** The host now sends `Kernel.baseline()` — a rev-0 patch carrying the
  *entire* current state (every namespace, seeded data + machine initial states) — instead of the
  machine-only `init()` patch. A fresh client reconstructs a complete replica from that one patch,
  then stays in sync via incremental patches. `init()` remains for the in-process controller
  (shared store, no replication needed).

The renderer stays a pure `event`-emitter / `patch`-consumer (ADR-0006): it binds to
`GenUIClient.getTree()`/`subscribe()`/`emit()` exactly as it binds to the in-process controller.

## Alternatives considered

- **Host sends resolved trees over the wire.** Rejected: it would put a `resolved` message outside the
  five-message protocol, ship recomputed props on every state change (heavier, less cacheable), and
  couple the wire format to render concerns. Sending `document` + `patch` and resolving client-side is
  smaller and keeps the protocol closed.
- **Client runs the reducer too (symmetric kernels).** Rejected for now: duplicating writes invites
  divergence and breaks single-authority/validate-before-commit. Reads (interpret) are pure and safe
  to duplicate; writes are not.
- **Keep the machine-only `init()` patch as the baseline.** Rejected: a remote client would silently
  miss seeded/fetched state. A full-snapshot baseline is the minimum correct initial sync.
- **Put `GenUIClient` in the React adapter.** Rejected: it has zero framework dependencies (only the
  interpreter + providers + transport). It is the reference *client half of the protocol*; a React
  binding over it is a thin follow-on.

## Consequences

- The protocol drives a renderer end to end over a boundary: a `GenUIClient` reconstructs full state
  from the baseline, paints the resolved tree, and round-trips a `rowSelect` event into a re-render
  with the gate opening — all headless, no kernel reference on the client.
- The read/write split is now explicit and enforced by placement: interpret + replica on the client,
  reducer + authority on the host.
- `baseline()` gives a clean initial-sync contract; incremental `patch`es keep the replica current.
- Open surface remaining: replica resync/replay from a known `rev` after reconnect, and patch
  coalescing for large state. (The thin React binding over `GenUIClient` has since landed — the same
  `GenUIRoot`/`useGenUI` accept either the in-process controller or the client via a structural
  `GenUISource`.)
