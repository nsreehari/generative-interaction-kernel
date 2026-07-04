# ADR-0021 — Layers are optional; only the terminal UI-DSL document is validated

**Status:** Accepted — 2026-07-04

## Context

ADR-0016 stacked lowering layers above the kernel (`Task → Domain → Interaction → UI`) and ADR-0018
added the Interaction/Presentation layers. That raised a real question left open as not-yet-decided
#15: is any layer *mandatory*? If a profile had to route through all four layers, a simple domain
(one that maps cleanly to kernel capabilities) would pay for abstraction it doesn't need, and every
profile would owe an interaction taxonomy before shipping anything.

## Decision

**No layer is mandatory.** A profile composes exactly the layers it needs and no more; the only hard
requirement is that a pipeline's terminal output is a kernel `DocumentPayload`. Concretely:

- A partial pipeline is declared by starting `pipeline(firstStage)` at whatever layer the profile
  authors in and `.to(...)`-ing down to the kernel document — e.g. a single-stage `Domain → UI`
  pipeline is valid and complete (`pipeline(lowerBoard).build()`).
- **Validation happens once, at the bottom.** `lowerToDocument` runs the same validate-before-commit
  schema check as hand-authored documents (ADR-0013). Intermediate layers are pure `Stage`s — typed
  and unit-testable — but are *not* schema-validated, because they have no fixed schema; only the UI
  DSL does. Skipping layers therefore costs no safety.
- Each `.to(...)` keeps the types aligned, so a stage can only attach to one whose output it accepts;
  the compiler enforces a well-formed pipeline regardless of how many layers are present.

## Alternatives considered

- **Mandate all four layers.** Forces ceremony (and an interaction taxonomy) on domains that don't
  need it; contradicts ADR-0016's "layers are optional" note.
- **Schema-validate every layer.** Higher layers are profile-defined and have no canonical schema;
  their contract is their TypeScript types plus unit tests. A per-layer schema would freeze
  vocabularies the platform intentionally leaves open.
- **Require at least the Interaction layer** (to force everything through "the moat"). Premature —
  the interaction taxonomy is still under design (not-yet-decided #13/#14); coupling every profile to
  it now would be a hard-to-reverse commitment.

## Consequences

- Simple profiles ship with one lowering stage; rich profiles add Interaction/Presentation above it.
- The single validation gate at the UI-DSL boundary catches a bug in *any* higher-layer compiler at
  the same place a malformed hand-authored document is caught.
- Still open: per-layer typed builders / optional validation for profiles that want stricter
  intermediate contracts, and whether a future policy ever makes a specific layer required for a
  class of profiles.
