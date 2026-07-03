# ADR-0010: Transport — GUP over a transport seam

**Status:** Accepted

## Context

[ADR-0004](ADR-0004-protocol-over-sdk.md) committed to delivering a **protocol + kernel**, not an
in-process SDK — the whole point being that the kernel and a renderer can run in *separate* processes
and speak GUP over a wire. Through Phase 3 that claim was unproven: the kernel, reducer, orchestrator,
and React adapter all ran in-process, calling each other directly. Nothing ever serialized a
`manifest`/`document`/`patch` out or accepted an `event` back across a boundary, and open item #7
(transport bindings) was untouched.

## Decision

Introduce a **`TransportProvider`** seam and a host that drives the kernel over it (`kernel/transport.ts`):

- **`TransportProvider`** is a minimal duplex contract: `send(message)` and `subscribe(listener)`.
  It moves whole **GUP envelopes** (`{ gup, type, payload }`), nothing kernel-specific.
- The five wire messages are given concrete types — **`GupMessage`** (manifest/document/patch/event/
  trace) plus an **`envelope(type, payload)`** helper — so both ends share one serialized shape.
- **`KernelTransportHost`** binds a kernel to a transport. On `start()` it publishes the opening
  sequence — `manifest`, then `document`, then the init `patch` — and thereafter, for each inbound
  **`event`**, dispatches it and sends back the resulting **`patch`**. Non-`event` inbound messages
  are ignored (no echo loop). Inbound dispatch is **serialized through a promise queue**, so
  concurrent events keep deterministic `rev` ordering.
- A reference **`createInMemoryTransportPair()`** gives two linked endpoints for headless, in-process
  tests that still exercise the *full serialize → deliver → deserialize* boundary — proving the loop
  without a network.

The renderer stays a pure `event`-emitter / `patch`-consumer (ADR-0006): it never sees the kernel,
only the transport.

## Alternatives considered

- **Skip transport; keep calling the kernel directly.** Rejected: it leaves ADR-0004's core bet
  (protocol, not SDK) unproven and blocks a future out-of-process C#/WinUI renderer that must talk
  over the same wire.
- **Make the transport kernel-aware (send patches/events as typed calls).** Rejected: it would leak
  kernel types across the boundary and defeat portability. The transport moves opaque GUP envelopes
  only.
- **Ship SSE/WebSocket first.** Deferred: the in-memory pair is the smallest thing that exercises the
  real boundary and stays test-deterministic; concrete network bindings (SSE to match the live-cards
  profile, WebSocket, stdio) are a follow-on that reuses this exact seam.
- **Validate every inbound message against the schemas at the wire.** Deferred: malformed events are
  already inert (the reducer ignores unknown nodes/events → no ops, honoring graceful fallback);
  boundary schema-hardening is a follow-on, not required to prove the loop.

## Consequences

- The protocol runs across a real boundary: a host publishes `manifest`/`document`/`patch` and a
  client round-trips an `event` to a `patch` — with the kernel and client decoupled by the transport.
- One serialized `GupMessage` shape is now shared by host and client, so a second (C#) kernel core or
  a non-React renderer can interoperate over the same wire.
- Determinism is preserved end to end: serialized inbound dispatch keeps `rev` monotonic; validate-
  before-commit and the pure-reducer law are untouched (the host still dispatches through the kernel).
- Open surface remaining: concrete network transports (SSE/WebSocket/stdio), reconnection/replay from
  a known `rev`, and optional inbound-message schema hardening.
