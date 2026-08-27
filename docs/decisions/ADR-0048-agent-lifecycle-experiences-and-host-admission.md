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
preflight it against the target environment, and maintain a proposal draft for host completion.

An agent does not execute authoritative changes itself. During one host request, it reads or replaces
a non-authoritative draft containing a complete ordered batch of typed domain actions. At completion,
the host turns the latest valid draft into a proposal, supplies its identity and metadata, authenticates,
authorizes, admits, applies, persists, and audits any resulting change. This must remain true even when
policy permits immediate autonomous application.

Blueprints add a second dimension. A runtime Blueprint describes the experience being used, while
compiler or authoring meta-Blueprints describe how candidate Blueprints are customized or authored.
The lifecycle surface must use those authored declarations without hard-coding domain knowledge in
the tool package.

## Decision

### Publish one neutral lifecycle package

Introduce `@gik-ai/agent-lifecycle-exp` as a new public package. It does not replace agentface or
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

Introduce `@gik-ai/blueprint-agent-host` as the HBX implementation over the neutral contracts. It owns
Blueprint proposal receipts, lifecycle status transitions, audit history, authorization and
admission policy composition, authoritative application delegation, rejection, status, idempotency
coordination, and the durable-runtime receipt binding.

The package is composed around a `BlueprintAuthority`; it is not embedded in Blueprint core or
BlueprintHost. A browser host, backend service, middleware, worker, or another product composition
layer imports the package and supplies its authority, identity, policies, and durable provider.
BlueprintHost may be adapted as an authority but does not import or call HBX itself.

`@gik-ai/blueprint-agent-host` depends on `@gik-ai/agent-lifecycle-exp` and
`@gik-ai/durable-runtime`. The neutral lifecycle package has no reverse dependency.

### Use one standard agent lifecycle vocabulary

The standard agent lifecycle vocabulary contains these operations:

1. `manifest` describes the complete capability, target and intent kinds, proposal schema, and
   operation input schemas.
2. `discover` lists targets and resources available in the current host scope.
3. `describe` explains one selected target's authored contract.
4. `inspect` returns current runtime or candidate facts.
5. `validate` checks an intent without authoritative mutation.
6. `simulate` computes expected outcomes without authoritative mutation.
7. `preflight` checks the intent against the real target environment, dependencies, policy, and
   revision without applying it.
8. `read_in_progress_proposal` returns the current request-scoped proposal draft without mutation.
9. `set_in_progress_proposal` atomically replaces the complete request-scoped proposal draft.

`manifest` is mandatory for every profile. A profile exposes the other operations that are
meaningful for its target; it does not publish state-dependent tools whose required target state
does not exist. Operation names retain the semantics above wherever they are exposed.

Profiles must select operations explicitly in one of three ways:

- `standard` exposes all operations;
- `static-authoring` exposes `describe`, `validate`, `simulate`, `read_in_progress_proposal`, and
  `set_in_progress_proposal` in addition to the mandatory `manifest`; and
- an explicit custom operation list supports another target-appropriate subset.

The selection is part of authored lifecycle material and is reflected literally in the capability
manifest and generated tool family. A profile declares either one preset or an explicit list, never
both. Omitting operation selection is invalid.

Operation context and lifecycle effect are separate concerns:

- `manifest` and `describe` use authored contract material and have no host-state dependency;
- `validate` uses the agent-supplied candidate and performs pure checks;
- `simulate` uses the candidate and caller-supplied or candidate-owned mock/initial state without
  reading current host state;
- `discover`, `inspect`, and `preflight` read current host scope, target state, or policy;
- `read_in_progress_proposal` reads the draft associated with the host-created request identity;
- `set_in_progress_proposal` validates and replaces that complete draft but does not create a receipt
  or authoritatively apply it.

A proposal draft contains a complete ordered action batch and optional rationale. It does not contain
a proposal ID, receipt ID, target, capability, revision, actor, or timestamp; the host owns those
fields. There is at most one draft per request and lifecycle profile. Replacement is atomic, so no
`append_proposal` operation exists and a partially assembled action list is never authoritative.

A static authoring profile is appropriate when an agent drafts publication of a self-contained
artifact with its own initial state. Its draft contains exactly one typed `publish-blueprint` action.
It does not expose `discover`, `inspect`, or `preflight` merely as no-op tools.

Where exposed, `manifest`, `discover`, and `describe` remain distinct. The lifecycle implementation
owns the stable operation manifest. A host registry owns discovery scope. Authored target material
owns semantic description, with runtime and provider registries supplying enrichment.

The host lifecycle exposes `receive`, `authorize`, `admit`, `apply`, `reject`, and `status`.
Authorization answers whether the caller may request the change. Admission answers whether the
specific proposal is valid under current policy, target revision, and state. Application performs
the authoritative transition.

HBX receipt states are `received`, `authorized`, `admitted`, `applying`, `applied`, `rejected`, and
`failed`. Receipt transitions and audit history are persisted through a `BlueprintProposalStore`.
The durable store binding appends receipt events and commits them through `@gik-ai/durable-runtime`.
An authority must make `apply` idempotent by receipt ID because persistence cannot atomically cover
an arbitrary external side effect and its subsequent applied-status write.

### Translate profiles into tools mechanically

A lifecycle profile consists of an authored capability manifest, lifecycle handlers, and a
lower-snake-case prefix. `agentLifecycleTools(prefix, ops)` always emits `manifest` and emits one
`AgentTool` for each additional operation declared by the capability manifest. Tool descriptions
and input schemas come from the manifest; handlers delegate to the corresponding lifecycle
operation.

For example, a `use_blueprint` profile becomes:

```text
use_blueprint_manifest
use_blueprint_discover
use_blueprint_describe
use_blueprint_inspect
use_blueprint_validate
use_blueprint_simulate
use_blueprint_preflight
use_blueprint_read_in_progress_proposal
use_blueprint_set_in_progress_proposal
```

A `static-authoring` profile becomes:

```text
author_blueprint_manifest
author_blueprint_describe
author_blueprint_validate
author_blueprint_simulate
author_blueprint_read_in_progress_proposal
author_blueprint_set_in_progress_proposal
```

This is a JSON callable surface, not a transport-specific surface. Function tools, RPC, HTTP, a
local runner, or another carrier adapts the same tool metadata and handler contract.

### Batch component capability description

Component discovery is separate from lifecycle target `describe`, but follows the same
transport-neutral rule. The common component `describe` tool has exactly two kinds:

- `catalog-capabilities` returns compact selection guidance for the supplied capability IDs;
- `multiple-capabilities` returns exact authoring contracts for a non-empty array of shortlisted IDs.

There is no singular `capability` kind. Agents shortlist once and retrieve all candidate details in
one call, avoiding provider-dependent serial tool loops. Hosts merge package and custom component
catalogs before constructing the tool; authorization and returned-artifact admission remain separate.

### Model Blueprint authority as cumulative experiences

Use these terms in architecture and documentation:

- **UBX — Use Blueprint Experience:** understand a Blueprint runtime and draft declared runtime
  actions for host completion.
- **CBX — Customize Blueprint Experience:** UBX plus understand and draft policy-bounded
  structural customization.
- **ABX — Author Blueprint Experience:** CBX plus understand and draft new or revised Blueprint
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
- authoring may draft a new contract or policy for host completion but does not activate it.

### Require authored lifecycle material at profile binding

`BlueprintDefinition.agentLifecycle.profiles` may contain `use`, `customize`, and `author` manifest
material. Blueprint JSON Schema validates any declared entry. Each entry identifies and describes
the profile, target kinds, intent kinds, goals, constraints, and its operation preset or explicit
operation list.

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
credential access, effect execution, or activation. The set operation accepts a complete typed
action batch and replaces only the draft in the current request scope. The read operation returns
that draft. On successful completion, the host uses its own request identity and current target facts
to create the authoritative proposal envelope and receipt; it never trusts a model- or provider-supplied
receipt ID. No draft means there is nothing to finalize. A host may automatically authorize and admit
a low-risk proposal, but the resulting application is still a host action and remains auditable.

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
- Profiles expose only meaningful operations while preserving one stable operation vocabulary.
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
- Product composition layers use `@gik-ai/blueprint-agent-host`; Blueprint core and BlueprintHost stay
  independent of agent and durable orchestration.
- Provider adapters must translate neutral `AgentTool` metadata into their wire format and keep
  provisioned tool definitions synchronized with the generated catalog.

## Not decided here

- Product-specific lifecycle profiles, proposal schemas, authorization rules, and admission rules.
- Agent-provider selection, transport protocol, credential handling, or function-call loop policy.
- Host deployment topology or durable provider selection.
- Product-specific interpretation and application of admitted Blueprint proposals.
- Migration or retirement policy for existing Face packages.

## Amendment (2026-08-21): `agentLifecycle` removed from the canonical Blueprint schema

`BlueprintDefinition.agentLifecycle` (and the `BlueprintAgentLifecycleDefinition`/
`BlueprintAgentLifecycleProfile`/`BlueprintAgentLifecycleProfileManifest` types, and the
`blueprint.schema.json` property that validated them) is removed from `@gik-ai/blueprint`. Evidence
driving this: zero real sample Blueprint ever declared it — not even a Blueprint whose entire
purpose is exposing an authoring surface to an agent. Its one live reader
(`createBlueprintAgentLifecycle` in the browser-host sample) only ever built its comparison
`implementation` manifest by re-reading the *same* Blueprint's own `agentLifecycle` field back out
(via `createBlueprintLifecycleManifest`), so the "authored profile identity/version must match the
serving implementation" enforcement this section originally described could never actually observe
a mismatch in that path — it compared a value to itself. The one place that self-declared a profile
(the platform's own fixed lowering meta-graph) never had that declaration read by anything, including
its own tests.

This is a schema-level removal only. `@gik-ai/agent-lifecycle-exp`'s Blueprint-lifecycle-material types
(`BlueprintLifecycleMaterialSource`, `BlueprintUseSource`, etc.) and binding functions
(`defineBlueprintLifecycleProfile`, `requireBlueprintLifecycleMaterial`, `useBlueprint`,
`customizeBlueprint`, `authorBlueprint`) are untouched and keep working exactly as before: they were
always defined against their own independent, optional, structurally-typed shape
(`payload.agentLifecycle?.profiles?...`) rather than importing `@gik-ai/blueprint`'s types, so they
never depended on the field being part of the canonical schema. A host wanting to exercise this
machinery still supplies an object carrying that material — it simply can no longer be a canonical,
schema-validated `BlueprintArtifact`.

**`structureMode`/`structurePolicy` were never superseded by `agentLifecycle` and remain the real,
load-bearing mechanism governing which lifecycle operations apply to a Blueprint** — this amendment
changes nothing about them:

- `fixed` — only `use` is possible; no structural mutation, agent or host, is ever admitted.
- `reconfigurable` — accepts a structural patch only from an `authorized` origin (ADR-0018/ADR-0046);
  the host proposes and applies it.
- `adaptive` — additionally admits a patch whose every operation is listed in
  `structurePolicy.allowedBlueprintOperations`; here the agent proposes (via a governed intent) and
  the host still applies it, never the reverse.

If a future need arises for a Blueprint (or a family of Blueprints) to self-describe richer
agent-lifecycle material again, it should be re-introduced as an explicitly host-owned association
(e.g. a registry keyed by Blueprint id, mirroring how credential references are host-owned rather than
authored inline — ADR-0034-adjacent precedent), not as a field on the portable authored artifact.

## Amendment (2026-08-24): self-mutation of `structureMode`/`structurePolicy` is always host-activated

The platform's `adaptive` lowering meta-graph precedent already requires that its own
`structureMode`/`structurePolicy` remain "reconfigurable under host authority, never adaptive," even
once that meta-graph becomes agent/host-editable. This amendment states that precedent as a general
rule rather than one specific to the compiler/lowering meta-graph: **any proposal that would change a
Blueprint's own `structureMode` or `structurePolicy` — regardless of which lifecycle profile (`use`,
`customize`, or `author`) originates it — is host-activated only.** No lifecycle profile may cause a
Blueprint to adopt a broader self-mutation policy than its currently active one without a distinct
trusted-host activation step. A `use` or `customize` profile's `validate`/`simulate`/`preflight` and
proposal operations may describe or stage such a change, but applying it always requires the same
authorized-origin admission path (ADR-0018/ADR-0046) that already governs `BlueprintPatchRequest`
application — an agent-originated intent can never itself flip a Blueprint from `fixed` to
`reconfigurable`/`adaptive`, or widen `allowedBlueprintOperations`/`allowedProgramOperations`, by being
applied.

### Materialization-time lowering vs. live structural and binding decisions

`describeBlueprint` (`@gik-ai/agent-lifecycle-exp`) now surfaces service/projection tier and recipe
summaries together with `structureMode`/`structurePolicy`, so an agent can discover the target's
materialization and structural capabilities before proposing a change. Authors must distinguish
three mechanisms:

- **Tier/recipe lowering** (`serviceRecipes`/`projectionRecipes`) is deterministic and
  materialization-time only: it is driven exclusively by immutable external context (locale,
  capability, policy, deployment strategy), runs once per materialization, and cannot react to live
  runtime state or a live user/agent turn.
- **Cell-graph structural patching** (`addCell`/`replaceCell`/`removeCell`) is live and policy-gated.
  It changes the parent Blueprint's Cell topology through the host-authorized admission path; it is
  not a lowering operation.
- **Bound child-Blueprint swapping** changes the complete `BlueprintArtifact` held by a
  `gik:blueprint` state token through an ordinary `use` data proposal. It changes which child is
  rendered at that binding point without changing the parent Cell graph or selecting a tier/recipe.

A Cell may also choose its own `_view` hint or update ordinary state continuously during live
execution. An agent that wants presentation or behavior to respond to live conditions must use those
runtime mechanisms, a bound child swap, or an admitted structural patch as appropriate. It must not
propose a new lowering recipe or tier: recipes are materialization-time-only and are never proposed
or activated adaptively.
