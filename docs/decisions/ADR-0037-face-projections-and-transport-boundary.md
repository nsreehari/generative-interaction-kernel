# ADR-0037 — Face package with pure/live strata; projections own policy, transports stay agnostic

**Status:** Accepted — 2026-07-12

## Context

After the kernel, protocol, agent-authoring, and concrete transport work landed, one architectural
ambiguity remained: what exactly sits between the embeddable kernel and the transport bindings?

Three confusions had started to blur together:

1. **Capability surface vs execution engine.** The kernel is the execution core, but callers often
   want a bounded callable surface such as `validateDocument`, `getState`, or `emit`.
2. **Audience policy vs implementation ownership.** "Agent" and "control" describe who is allowed to
   see which tools, but the underlying tool implementation should not be duplicated by audience.
3. **Transport vs policy.** MCP-over-HTTP and SSE were in danger of being treated as if they owned
   what capability surface is exposed, rather than merely carrying a chosen surface across a boundary.

The split `agentface/` + `controlface/` packages captured some useful ideas, but it encoded the wrong
axis as the primary one. The primary distinction is not audience first; it is **one face package with
pure and live parts**, then **projections** over that face for different audiences.

## Decision

Adopt the following boundary:

- **`kernel/` remains the embeddable execution engine.** It owns interpretation, reduction,
  resolution, patch generation, checkpoint/restore, and effect journaling.
- **`face/` becomes the single package owning the callable surface.** It contains:
  - a **pure face part** — authoring/validation helpers over JSON inputs that do not require a live
    kernel instance;
  - a **live face part** — inspect/drive tools backed by an embedded `Kernel` instance.
- **Projections live under `face/projections/`.** They do not implement separate behavior; they are
  filtered views over the face package:
  - `controlface` projection = full catalog;
  - `agentface` projection = allowlisted subset.
- **Transports are face-agnostic carriers.** `transports/*` must not choose a face or projection by
  default. They require an injected handler/broker and own only framing, routing, serialization, and
  network mechanics.
- **Samples/hosts are the outer composition layer.** They choose whether to embed a kernel, which
  projection to expose, and which transport to mount.

## Alternatives considered

### A. Keep separate `agentface/` and `controlface/` packages as peers
Rejected because it makes audience look like the ownership axis, duplicates or cross-imports the same
tool implementations, and obscures the fact that `agentface` is just a filtered view of the same
underlying capability surface.

### B. Make transports choose a default face/projection
Rejected because it couples wire mechanics to capability policy. A transport should be reusable for
any projection the outer host chooses to inject.

### C. Expose the kernel directly to every consumer and skip faces
Rejected because many consumers do not want raw runtime authority; they want a bounded, callable
surface. Faces provide that surface without forcing every caller to know the kernel internals.

### D. Keep a packaged HTTP host class inside `face/`
Rejected because route composition is an outer concern. The face package should own runtime logic and
projections; transport mounting belongs in sample/app hosts.

## Consequences

- The architecture becomes explicit: **kernel -> face -> projection -> transport -> sample host**.
- The pure/live split becomes the useful implementation boundary inside `face/`, while agent/control
  remains a projection/policy boundary.
- One live runtime can now be exposed simultaneously as:
  - an SSE render stream,
  - an agent-safe MCP projection,
  - a full control-plane MCP projection,
  without duplicating tool implementations.
- A product can now choose cleanly:
  - **embed the kernel** when it wants runtime authority in-process;
  - **consume a face projection** when it wants a bounded surface over an already-running runtime;
  - **wrap a projection in a transport** when it needs a process/network boundary.
- Documentation must teach the terms distinctly: kernel is the engine; face is the callable surface;
  projection is filtered policy; transport is the carrier.