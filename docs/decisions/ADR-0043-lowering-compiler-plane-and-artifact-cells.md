# ADR-0043: Lowering compiler plane and artifact Cells

**Status:** Accepted — 2026-07-24

## Context

ADR-0016 and ADR-0038 established layered, declarative lowering, but described the terminal artifact
primarily as a projected UI document. The Kernel now accepts projected and headless executable
programs and owns a continuous graph suitable for user interfaces, services, workflows,
automations, and agent systems. Blueprint tiers and recipes therefore cannot remain frontend-only.

Lowering also needs an extension model. A fixed recipe catalog cannot anticipate every domain, and
an AI agent may need to select, compose, or propose a strategy when existing recipes are
insufficient. Letting transient model reasoning directly mutate an executing Kernel would erase the
boundary between compilation and authoritative execution.

## Decision

### Lowering is a compile phase, not a deployment phase

Lowering transforms higher-level artifacts into one canonical executable Blueprint before the
Kernel grants that artifact execution authority. It may run during a developer build, in CI, in an
authoring workbench, at publication time, or on demand immediately before execution. "Compile
time" means before authoritative execution, not necessarily before deployment.

The terminal artifact may be:

- a projected executable program for an interactive frontend;
- a headless service or automation program;
- a workflow or agent program whose behavior is represented by the canonical graph; or
- a Blueprint containing both headless behavior and an optional projection.

No backend Blueprint must fabricate a presentation tier, projection root, or renderer capability.
All terminal programs cross the same Kernel validation boundary.

### Strategy and compilation are separate planes

The strategy plane may be asynchronous and nondeterministic. An agent or host may select existing
recipes, compose a compatible chain, parameterize a strategy, synthesize candidate declarative
recipes, compare candidates, or suspend for human approval.

The compilation plane is policy-controlled and evidence-producing. A registered executor consumes
a validated recipe and input artifact, emits the next artifact, and preserves provenance. Terminal
emission must pass structural and semantic validation before the resulting Blueprint can execute.
Agent reasoning may author compiler inputs; it is not itself executable authority.

### Lowering uses an artifact Cell meta-graph

A Lowering Cell is one independently addressable artifact-processing participant above Kernel
execution. Its minimal contract declares:

- an ID and kind;
- optional source and target layer kinds;
- typed artifact input and output ports;
- an optional versioned strategy and executor reference; and
- policy for determinism, validation, and approval.

The initial kinds are `transform`, `select-strategy`, `synthesize-strategy`, `validate`, `approve`,
and `emit-blueprint`. This contract supports deterministic stages and agent- or human-mediated
strategy work without defining an execution engine yet.

A Lowering Cell is not an application `CellDefinition`. Two graphs remain distinct:

```text
compiler meta-graph --produces--> validated executable Blueprint
                                         |
                                         v
                              Kernel continuous runtime graph
```

The compiler may use the same explicit-port and causal principles as the runtime, but compiler
state, candidate artifacts, approvals, and provenance do not become application runtime state
unless the produced Blueprint explicitly models them.

### One backend-neutral terminal lowering API

`ProgramLowering<In, Out>` may terminate in any `ExecutableProgramDefinition`.
`lowerToProgram` preserves whether the result is projected or headless and validates it before
returning a wire message. `lowerToProjectedProgram` remains a narrower convenience for callers that
require a projection.

## Consequences

- Blueprint tiers and recipes are backend-neutral artifact-compilation concepts.
- UI-oriented layer kinds such as interaction and presentation remain valid profile choices, not
  mandatory universal tiers.
- Service-oriented profiles may define domain-specific tiers and lower directly to a headless
  executable program.
- An agent can redefine strategy by producing or selecting validated strategy artifacts, subject to
  executor registration and policy.
- Reproducibility requires strategy identity, version, inputs, outputs, and evidence to be retained
  by future compiler orchestration.
- Physical package extraction of authoring and lowering remains deferred until these contracts
  stabilize; capability boundaries are documented before package boundaries are changed.
- This ADR refines ADR-0016's UI-only terminal description without reversing its one-kernel,
  optional-layer, composable-stage, or validate-before-execute decisions.

## Not decided here

- The persistent wire schema for a complete lowering meta-graph.
- Which agent provider or protocol performs strategy synthesis.
- Candidate scoring, caching, incremental recompilation, retry, or provenance storage formats.
- Whether compiler orchestration eventually reuses `ContinuousGraphRuntime` internally.
- Physical package names or release boundaries for authoring and compiler APIs.