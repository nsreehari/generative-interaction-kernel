# ADR-0006 — Render adapter is storage / transport / persistence agnostic

**Status:** Accepted — 2026-07-03

## Context

With the kernel placed primarily embedded ([ADR-0005](ADR-0005-kernel-placement.md)), the kernel
and the renderer can share a process. The question arose: *why should rendering be concerned with
storage or transport semantics at all?* If embedded co-location leaks infrastructure concerns into
the render layer, renderers stop being thin and portable.

## Decision

The `RenderAdapter`'s contract is strictly:

> input: **resolved nodes + patches** → output: **events**.

It has **no knowledge** of persistence, storage, or transport. Those concerns live *behind the
kernel* as separate providers — `StateModel` (state + persistence), `TransportProvider` (how
documents/patches arrive), `Orchestrator` (durable/external actions). The renderer never reads the
store, never writes it, and never knows how a document arrived.

Co-location of an embedded kernel with its renderer is a **deployment fact, not an API coupling**.
The `RenderAdapter` interface stays pure whether the kernel is embedded (shared process) or
server-side (across a network). This is what lets the *same* renderer run unchanged in either
placement.

## Alternatives considered

### A. Let the renderer read/write the store directly
**Rejected because:** it bypasses the reducer, breaking validate-before-commit and the pure-reducer
law; it couples UI code to the state model; and it makes renderers non-portable across placements.

### B. Let the renderer own its transport/connection semantics
**Rejected because:** it couples UI to infrastructure (connection, retries, persistence), so a new
framework binding would re-implement transport instead of just materializing nodes. Transport is
abstracted by the `TransportProvider`; the renderer only ever sees `document`/`patch` in and
`event` out.

## Consequences

- Renderers are thin, portable, and identical across embedded and server-side placements.
- Storage, persistence, and transport can be swapped without touching any rendering code.
- The protocol boundary (only `document`+`patch` in, only `event` out) is the enforcement mechanism
  for this separation.
