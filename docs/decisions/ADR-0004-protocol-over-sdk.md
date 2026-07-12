# ADR-0004 — Deliver as a protocol + kernel, not an in-process SDK

**Status:** Accepted — 2026-07-03

## Context

With the object model and provider contracts defined, the platform can be delivered in two shapes.
The choice determines whether a Document is a portable artifact or a language-bound object, and
whether the same document can drive multiple frameworks and an out-of-process orchestrator.

## Decision

Deliver as a **protocol + kernel**. The Document format and the state-delta format are a
**language-neutral wire contract** (the GIK Protocol / GIK — see
[docs/03-protocol.md](../03-protocol.md)). The kernel has a reference implementation, but any
conforming runtime — a renderer in any framework, a server-side validator, an out-of-process
orchestrator — can speak the protocol.

## Alternatives considered

### A. In-process SDK (one language; providers as objects; documents as in-memory structures)
**Rejected because:** it is language-bound; a single document cannot drive multiple UI frameworks;
and the orchestrator cannot live out-of-process. This is "a nice library," not "a platform." The
portability of the Document — the ability to store, diff, replay, snapshot-test, and hand it to any
conforming renderer — is the property that makes it a platform, and it requires a protocol.

## Consequences

- A Document becomes a portable artifact: storable, diffable, replayable, snapshot-testable.
- Renderers in different frameworks and orchestrators in different languages become conformance
  targets rather than shared code.
- The protocol imposes strict boundaries that preserve kernel invariants across the wire:
  - Only `document` + `patch` cross into a renderer.
  - Only `event` crosses back — **renderers never patch the store directly**; they emit events, the
    kernel reduces and emits patches. This preserves validate-before-commit and the pure-reducer law.
  - The store is authoritative kernel-side; the renderer holds a projection kept current by patches.
- A conformance fixture (normative JSON Schemas + a golden manifest/document/event/patch sample)
  becomes the first concrete artifact everything else is written against.
