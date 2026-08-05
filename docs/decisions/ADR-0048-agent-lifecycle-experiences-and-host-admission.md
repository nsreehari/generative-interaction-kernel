# ADR-0048: Agent lifecycle experiences and host-owned admission

**Status:** Accepted — 2026-08-05

## Context

The existing Face model exposed a hand-authored catalog and then filtered it into agentface and
controlface projections. That established useful transport and trust boundaries, but it mixed
several different concerns:

- operations needed by an agent to understand any target;
- Blueprint runtime use, structural customization, and contract authoring;
- trusted host admission and mutation; and
- broader control-plane operations unrelated to Blueprint authority.

Names such as AX, AX+, and ACX did not explain those responsibilities. More importantly, a catalog
organized only by authority omitted the lifecycle an agent needs at every level: discover what is
available, understand a target, examine current facts, validate an intent, simulate its result,
preflight it against the target environment, and submit a proposal.

An agent does not execute authoritative changes itself. It submits typed intent through a tool call.
The host authenticates, authorizes, admits, applies, persists, and audits any resulting change. This
must remain true even when policy permits immediate autonomous application.

Blueprints add a second dimension. A runtime Blueprint describes the experience being used, while
compiler or authoring meta-Blueprints describe how candidate Blueprints are customized or authored.
The lifecycle surface must use those authored declarations without hard-coding domain knowledge in
the tool package.

## Decision

### Publish one neutral lifecycle package

Introduce `@gik/agent-lifecycle-exp` as a new public package. It does not replace agentface or
controlface in place. It establishes a new contract and migration path without importing their
audience-specific API model.

The package owns:

- `AgentLifecycleOps`, the agent-facing understanding and proposal lifecycle;
- `AgentHostLifecycleOps`, the trusted receipt, authorization, admission, and application lifecycle;
- machine-readable capability and operation manifests;
- transport-neutral JSON tools;
- deterministic profile-to-tool translation;
- tool catalogs and cumulative Blueprint experience projections; and
- neutral proposal, target, and report contracts.

It does not own Blueprint semantics, a Kernel, persistence, authorization policy, service execution,
transport protocols, or agent providers.

### Publish one Blueprint-specific host package

Introduce `@gik/blueprint-agent-host` as the HBX implementation over the neutral contracts. It owns
Blueprint proposal receipts, lifecycle status transitions, audit history, authorization and
admission policy composition, authoritative application delegation, rejection, status, idempotency
coordination, and the durable-runtime receipt binding.

The package is composed around a `BlueprintAuthority`; it is not embedded in Blueprint core or
BlueprintHost. A browser host, backend service, middleware, worker, or another product composition
layer imports the package and supplies its authority, identity, policies, and durable provider.
BlueprintHost may be adapted as an authority but does not import or call HBX itself.

`@gik/blueprint-agent-host` depends on `@gik/agent-lifecycle-exp` and
`@gik/durable-runtime`. The neutral lifecycle package has no reverse dependency.

### Use one standard agent lifecycle

Every agent lifecycle profile exposes these operations:

1. `manifest` describes the complete capability, target and intent kinds, proposal schema, and
   operation input schemas.
2. `discover` lists targets and resources available in the current host scope.
3. `describe` explains one selected target's authored contract.
4. `inspect` returns current runtime or candidate facts.
5. `validate` checks an intent without authoritative mutation.
6. `simulate` computes expected outcomes without authoritative mutation.
7. `preflight` checks the intent against the real target environment, dependencies, policy, and
   revision without applying it.
8. `propose` submits typed intent for host handling.

`manifest`, `discover`, and `describe` remain distinct. The lifecycle implementation owns the stable
operation manifest. A host registry owns discovery scope. Authored target material owns semantic
description, with runtime and provider registries supplying enrichment.

The host lifecycle exposes `receive`, `authorize`, `admit`, `apply`, `reject`, and `status`.
Authorization answers whether the caller may request the change. Admission answers whether the
specific proposal is valid under current policy, target revision, and state. Application performs
the authoritative transition.

HBX receipt states are `received`, `authorized`, `admitted`, `applying`, `applied`, `rejected`, and
`failed`. Receipt transitions and audit history are persisted through a `BlueprintProposalStore`.
The durable store binding appends receipt events and commits them through `@gik/durable-runtime`.
An authority must make `apply` idempotent by receipt ID because persistence cannot atomically cover
an arbitrary external side effect and its subsequent applied-status write.

### Translate profiles into tools mechanically

A lifecycle profile consists of an authored capability manifest, lifecycle handlers, and a
lower-snake-case prefix. `agentLifecycleTools(prefix, ops)` emits one `AgentTool` for each standard
operation. Tool descriptions and input schemas come from the manifest; handlers delegate to the
corresponding lifecycle operation.

For example, a `use_blueprint` profile becomes:

```text
use_blueprint_manifest
use_blueprint_discover
use_blueprint_describe
use_blueprint_inspect
use_blueprint_validate
use_blueprint_simulate
use_blueprint_preflight
use_blueprint_propose
```

This is a JSON callable surface, not a transport-specific surface. Function tools, RPC, HTTP, a
local runner, or another carrier adapts the same tool metadata and handler contract.

### Model Blueprint authority as cumulative experiences

Use these terms in architecture and documentation:

- **UBX — Use Blueprint Experience:** understand a Blueprint runtime and propose declared runtime
  actions.
- **CBX — Customize Blueprint Experience:** UBX plus understand and propose policy-bounded
  structural customization.
- **ABX — Author Blueprint Experience:** CBX plus understand and propose new or revised Blueprint
  contracts, modes, policies, tiers, recipes, and services.
- **HBX — Host Blueprint Experience:** ABX plus trusted receipt, authorization, admission,
  application, persistence, activation, rejection, and status.
- **Control:** HBX plus broader host operations that are not Blueprint lifecycle authority, such as
  runtime checkpoints, service diagnostics, sessions, transport lifecycle, or administrative state.

The catalogs satisfy:

```text
UBX subset CBX subset ABX subset HBX subset-or-equal Control
```

UBX, CBX, and ABX are agent-facing proposal surfaces. HBX is a trusted host surface. A product may
expose a narrower projection than its maximum authority.

Blueprint structure mode still governs proposals:

- `fixed` permits declared runtime use but no structural mutation;
- `adaptive` may auto-admit policy-allowed customization proposals;
- `reconfigurable` accepts customization proposals for a separate authorization decision; and
- authoring may propose a new contract or policy but does not activate it.

### Require authored lifecycle material at profile binding

`BlueprintDefinition.agentLifecycle.profiles` may contain `use`, `customize`, and `author` manifest
material. Blueprint JSON Schema validates any declared entry. Each entry identifies and describes
the profile, target kinds, intent kinds, goals, and constraints.

Not every Blueprint must declare every profile:

- an application/runtime Blueprint declares `use` material when exposed through UBX;
- a customization meta-Blueprint declares `customize` material when exposed through CBX; and
- an authoring/compiler meta-Blueprint declares `author` material when exposed through ABX.

Blueprints remain structurally valid without lifecycle material. Binding a Blueprint to a
lifecycle profile is the enforcement boundary: `defineBlueprintLifecycleProfile` rejects missing
material and rejects an authored profile identity or version that differs from its implementation.
This permits migration without silently fabricating agent semantics.

### Keep proposals non-authoritative

An agent-facing tool never exposes direct state mutation, unrestricted structural patching,
credential access, effect execution, or activation. `propose` returns a typed proposal targeting an
identity and optional expected revision. A host may automatically authorize and admit a low-risk
proposal, but the resulting application is still a host action and remains auditable as such.

## Alternatives considered

### A. Continue expanding agentface/controlface catalogs

Rejected as the target architecture because audience filtering does not express the common agent
lifecycle or separate proposal from host application. Existing packages remain operational during
migration.

### B. Put execution on `AgentLifecycleOps`

Rejected because a tool call is a request crossing a trust boundary. Host authorization, admission,
effects, persistence, and audit cannot be delegated to model reasoning.

### C. Treat `describe` as the complete manifest

Rejected because the capability contract and a selected target have different lifetimes and cache
semantics. Manifest describes the profile; describe explains one target; discover identifies which
targets exist.

### D. Generate all lifecycle information from Blueprint structure

Rejected because structure cannot reliably communicate semantic goals, intent kinds, preservation
requirements, or domain constraints. Those are authored material. Operation schemas and handlers
remain implementation-owned to prevent executable behavior from being encoded as prose.

### E. Require every Blueprint to declare UBX, CBX, and ABX

Rejected because runtime, customization, and authoring are different Blueprints and responsibilities.
The profile binding requires only the material appropriate to the capability being exposed.

### F. Make the lifecycle package depend on Blueprint, a transport, or an agent provider

Rejected because the lifecycle and proposal boundary applies to many targets. Blueprint is the first
profile family; transports and agent providers are outer adapters.

## Consequences

- Agent tools become predictable and mechanically generated.
- Agent providers can consume the same schemas without defining platform authority.
- Blueprint lifecycle semantics remain authored and versioned with the relevant application or
  meta-Blueprint.
- Discovery remains a host concern and can include registries, live instances, revisions, child
  Blueprints, capabilities, and services.
- UBX, CBX, ABX, HBX, and Control become literal cumulative catalog projections rather than informal
  labels.
- Existing agentface/controlface packages can migrate incrementally; no compatibility alias is
  required in the new package.
- Hosts must implement proposal storage, authorization, admission, application, and status where
  those capabilities are exposed.
- Product composition layers use `@gik/blueprint-agent-host`; Blueprint core and BlueprintHost stay
  independent of agent and durable orchestration.
- Provider adapters must translate neutral `AgentTool` metadata into their wire format and keep
  provisioned tool definitions synchronized with the generated catalog.

## Not decided here

- Product-specific lifecycle profiles, proposal schemas, authorization rules, and admission rules.
- Agent-provider selection, transport protocol, credential handling, or function-call loop policy.
- Host deployment topology or durable provider selection.
- Product-specific interpretation and application of admitted Blueprint proposals.
- Migration or retirement policy for existing Face packages.
