# ADR-0005 — Kernel placement: server-side vs embedded

**Status:** Proposed / open — 2026-07-03

## Context

The GenUI Protocol ([ADR-0004](ADR-0004-protocol-over-sdk.md)) is **placement-agnostic**: the same
five messages work regardless of where the kernel runs. But the reference implementation must
assume a default, because placement affects the transport binding (not the message schemas).

## Options

### A. Server-side kernel (thin renderers)
The kernel runs on a server; renderers are thin clients that receive `document` + `patch` over the
network and emit `event`. 
- **Pros:** renderers are minimal and easy to port to new frameworks; validation, reduction, and
  orchestration are centralized; state is authoritative in one place.
- **Cons:** every interaction round-trips the network; requires a persistent connection; offline/local
  use is harder.

### B. Embedded kernel (in each renderer)
Each renderer embeds a kernel instance; the protocol is an in-process bus; the network is used only
to reach the Source and the Orchestrator.
- **Pros:** low-latency interaction; works offline for local behavior; the network carries only
  documents and durable-action calls.
- **Cons:** the kernel must be ported/available in each renderer's runtime; state authority and
  reconciliation across instances need care.

## Decision

**Open.** To be selected before the reference implementation begins. Both remain valid deployments;
this ADR fixes only the reference default.

## Consequences (either way)

- The five GUP message schemas are unaffected by this choice.
- The `TransportProvider` binding (network vs in-proc) is what changes.
- A future revision may support both with a shared kernel core compiled/hosted per target.
