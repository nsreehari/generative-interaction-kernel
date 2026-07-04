# ADR-0012: Reconnection — broker host with a patch log, resume or full resync

**Status:** Accepted

## Context

[ADR-0010](ADR-0010-transport-seam.md) and [ADR-0011](ADR-0011-client-runtime.md) gave a point-to-
point transport and a client replica, but assumed a single, stable connection. Real deployments have
many renderers and dropped connections: a client that disconnects and returns must regain a
*consistent* replica without replaying its whole session, and a late joiner must get current state.
The transport host owned exactly one connection and re-onboarded only at `start()`, so neither case
was handled, and open item #7 still listed reconnection/replay.

## Decision

Make `KernelTransportHost` a **broker** with a bounded **patch log**, and treat reconnection as a
transport concern *below* the closed five-message GUP protocol (no new message type):

- The host **attaches** any number of connections and **broadcasts** each dispatch patch to all of
  them. Inbound `event`s are still dispatched serially through one queue, so `rev` stays monotonic and
  the log is totally ordered.
- The host keeps a **patch log** (`baseline` at rev 0, then each dispatch delta), bounded to a maximum
  length; old entries are dropped from the front.
- **Onboarding is resume-aware.** `attach(transport, fromRev?)`:
  - **Resume** — if `fromRev` is within the retained log, replay *only* the deltas after it. The
    client keeps its replica and manifest/document, so no full re-onboard is sent.
  - **Full resync** — otherwise (fresh client, late joiner, or a `fromRev` older than the log) send
    `manifest → document → snapshotPatch()` (the complete current state at the current rev).
- `Kernel.snapshotPatch()` returns the full state at the *current* rev **without** re-seeding machine
  states (unlike `baseline()`/`init()`), so mid-session re-onboarding never clobbers live state.
- The client supports **reconnection**: `GenUIClient.rebind(transport)` re-points it at a new
  transport while keeping its replica (so it can resume). Patch application is **idempotent** (patches
  at or below the current rev are ignored), and a received `manifest` resets the rev so a full resync
  always applies.

## Alternatives considered

- **Add a `hello`/`resume` GUP message.** Rejected: it would open the closed five-message protocol for
  a concern that is purely about connection lifecycle. Reconnection is orchestrated by the host/transport
  layer beneath GUP; the client conveys its `rev` through the transport (e.g. an SSE query param), not
  a document-level message.
- **Always full-resync on reconnect (no log).** Rejected as the *only* option: correct but wasteful
  for large state and frequent reconnects. The log makes incremental replay the common path and full
  resync the fallback — the log bound caps memory and degrades gracefully to full resync.
- **Reuse `baseline()` for mid-session onboarding.** Rejected: `baseline()` calls `init()`, which
  re-seeds machine initial states and would erase live machine progress. `snapshotPatch()` snapshots
  current state as-is.
- **Per-connection kernels/state.** Rejected: the kernel is the single source of truth; connections
  are views. One authoritative reducer, many replicas.

## Consequences

- Many renderers can attach to one kernel; each patch is broadcast to all, keeping replicas in sync.
- A dropped client reconnects and catches up with a minimal delta replay; a late joiner full-syncs to
  current state — both verified headlessly (resume replays only the missing patch; a late client sees
  the gate already open from an earlier selection).
- The closed protocol is preserved: reconnection added no GUP message, only host/transport
  orchestration and client-side idempotency.
- Open surface remaining: log persistence/compaction across host restarts, and conveying `fromRev`
  over a concrete network transport (SSE/WebSocket) — the seam is ready for it.
