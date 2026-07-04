# ADR-0022 — v0.1 ships complete documents; incremental streaming is deferred

**Status:** Accepted — 2026-07-04

## Context

Not-yet-decided #10 asked whether v0.1 supports *progressive* document assembly — an agent streaming
a `document` that materializes piece by piece as it is produced — and how that would be expressed on
the wire. Agents can already author a *complete* document via typed builders with validate-before-
commit and reference lint (ADR-0013), and the Orchestrator already streams *follow-up patches* within
a dispatch (ADR-0009). The open question is specifically the *initial* `document` message arriving
incrementally.

## Decision

**v0.1 delivers a complete `document` in one message.** Incremental agent-side streaming of the
initial document is explicitly **deferred** beyond v0.1. Rationale:

- Validate-before-commit (ADR-0013) is defined over a whole document; a partial document has no
  well-defined validity, so streaming would either weaken the gate or require a separate "partial
  validity" model that doesn't exist yet.
- The dynamic need — content appearing over time — is already met *after* the first render by patches
  (state fills in, machines advance, Orchestrator results stream). The uncovered case is only the very
  first paint of a large document, which authoring + a fast lowering already handle acceptably.
- Keeping the initial document atomic preserves the five-message protocol and the single-authority
  reducer without a new streaming message type.

This resolves #10 as *decided-to-defer*, not *unresolved*: the door stays open, but it is out of scope
for v0.1.

## Alternatives considered

- **A streaming/partial `document` message now.** Adds a sixth message shape and a partial-validity
  model for a benefit (first-paint latency of large documents) that lowering speed and post-render
  patches already largely address; premature for v0.1.
- **Chunking documents via patches (send an empty root, then patch in nodes).** Patches carry *state*,
  not *document structure*; overloading them to stream node trees would blur the document/patch split
  the architecture depends on.

## Consequences

- Agents target a complete, validated document; renderers can assume a whole tree on first paint.
- Progressive assembly remains a clean future extension (its own ADR) if first-paint latency of very
  large documents becomes a measured problem.
