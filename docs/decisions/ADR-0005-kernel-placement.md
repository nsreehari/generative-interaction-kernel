# ADR-0005 — Kernel placement: server-side vs embedded

**Status:** Accepted — 2026-07-03 (hybrid, primarily embedded)

## Context

The GIK Protocol ([ADR-0004](ADR-0004-protocol-over-sdk.md)) is **placement-agnostic**: the same
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

**Hybrid, primarily embedded.** The reference default embeds the kernel in each renderer runtime
and reduces locally; a server-side kernel is retained only as an **optional authority /
reconciliation** point for consequential actions and shared state.

Rationale: the platform's users are **both agents and humans**, and agents *generate* the UX by
streaming documents (as a `Source`). Those documents must materialize and reduce next to the human
for interaction to feel live, so local (embedded) reduction is the default; round-tripping every
`event` to a server would fight that. The server kernel remains authoritative for anything that
crosses a trust or shared-state boundary.

**Accepted tradeoff:** the kernel core must be available in each renderer's runtime (e.g. JS *and*
C#). This is affordable because the core is deliberately small — a pure reducer + interpreter
contract — and can be shared via a single portable core (or a spec-conformant reimplementation the
conformance fixture verifies identical).

**Security boundary:** embedded reduction is a *latency optimization, not a trust boundary*.
Consequential `invoke`/`confirm` actions and anything authorization- or integrity-sensitive are
re-validated by the authoritative (server) kernel; an embedded client's reduce is never trusted for them.

## Consequences

- The five GIK message schemas are unaffected by this choice.
- The `TransportProvider` binding (in-proc for local reduce; network to reach the remote `Source`
  and `Orchestrator`) is what changes.
- The kernel core is kept small and portable so it can run per renderer runtime.
- Co-location of an embedded kernel with its renderer is a *deployment fact, not an API coupling* —
  the `RenderAdapter` interface stays pure regardless (see
  [ADR-0006](ADR-0006-render-adapter-infra-agnostic.md)).
