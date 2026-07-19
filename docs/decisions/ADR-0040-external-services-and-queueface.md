# ADR-0040 — External services as one adapter contract: host-trusted kinds, Blueprint-owned declarations, QueueFace lifecycle

**Status:** Accepted

## Context

Bundles need to call external agentic/service backends (a chat/completion agent, a deterministic
simulator, an MCP tool server, a plain HTTP service) from cells, substrate agents, chat, and task
lanes. Left unaddressed, every bundle that needs this re-invents its own integration: its own
credential handling, its own retry/cancellation behavior, its own result-validation shape, and no
shared lifecycle across authoring (ACX) and running (AX) — an authoring agent proving out behavior
has no principled way to reach the same execution path a running agent would use. That is the
architectural gap this ADR closes: **one pluggable adapter contract** covering discovery,
inspection, validation, simulation, probe, execution, status, and cancellation, used identically by
ACX and AX. (ACX may exercise the full live AX execution/materialization path when an authoring
agent needs behavioral proof — the lifecycle labels do not imply ACX is pure, static, immediate, or
lightweight.)

## Decision

### Ownership model

The **host** registers only trusted **service kinds** and the factories capable of executing them
(e.g. a Copilot-style agent kind, a Foundry-style agent kind, a deterministic kind, an MCP kind). It
does **not** maintain an application-level catalog of every model, workspace, endpoint, agent, or
configured service instance. A host manifest says which kinds it supports and supplies runtime
policy, credential resolution, process/network sandboxing, queue infrastructure, resource limits,
cancellation, and secret redaction.

The **Blueprint** brings the concrete service configuration its behavior needs. A named service
declaration carries a kind, supported operations, and kind-specific config; a cell may instead carry
the same declaration inline. Named declarations exist only to remove repetition when several cells
or substrate agents share one configuration. Profiles lower these declarations into the Bundle
manifest unchanged.

Blueprints may carry endpoints and credential *references*, never literal keys, tokens, or
passwords. A `credentialRef` is authorized and resolved by the host at execution time and is never
copied into Bundle state, queue messages, browser JavaScript, logs, catalog snapshots, or
provenance.

### Compact contracts

- `ServiceKindFactory` — trusted host implementation: kind id, configuration schema, validation,
  discovery/probe, lazy `create`.
- `ServiceDeclaration` — Blueprint-owned `{ kind, config, operations }`, named or inline.
- `ServiceUse` — `{ service | inline, operation, contract }` attached to a cell or substrate-agent
  operation.
- `ServiceSubject` — identifies `cell`, `substrate-agent`, `chat`, or `task` scope without forking
  a separate service runtime per lane.
- `ServiceRequestRecord` — stable request/correlation/idempotency identity, Blueprint/state
  revisions, attempts, timestamps, resolved kind, provider-native session/thread provenance,
  terminal result/error state.
- `ServiceOutputPolicy` — `{ guardrails, onViolation }` attached to a `ServiceDeclaration`
  operation and optionally overridden on a single `ServiceUse`; a `ServiceKindFactory` may supply a
  kind-wide default policy a Blueprint inherits unless it overrides it.

`QueueFace` is the live runtime seam: it registers kinds, loads Blueprint declarations, validates
them, and lazily materializes scoped adapters (direct adapter registration remains only as a
low-level test/integration seam). Cache scope (`per-invocation`, `per-cell`, `per-blueprint`,
`per-session`) controls provider-native continuity — it is not host service-instance registration.
Immediate and queued execution share one request/settlement contract.

A shared `ServiceKindRegistry` is the single source both `QueueFace` (validation, materialization,
execution, cancellation) and the `ControlFace` projection (kind/config-schema/probe/queue-state)
consume, consistent with the face/projection boundary from
[ADR-0037](ADR-0037-face-projections-and-transport-boundary.md) — there is no parallel registry per
projection. `AgentFace` receives only the policy-approved operational subset.

### Lanes, services, and operations stay distinct identities

A service (e.g. a chat/completion agent) is not the same thing as an execution lane (chat, task,
substrate-agent, inline-cell) or a domain operation (whatever the Blueprint asks the service to do).
An `ExecutionRef`/queue lane controls *where* a worker runs; the Blueprint service declaration
selects *which* service runs inside that worker. Keeping these three axes separate in configuration
and provenance is what lets a Blueprint swap services without touching lane or operation semantics.

### Untrusted provider output: guardrails and violation policy

Provider output is untrusted data. Settlement runs the same declarative validator engine already
used for authored-input validation (`jsonata`, `ajv-schema`, `typedef` checks, extensible to future
semantic checks) against provider output, instead of each bundle hand-rolling structural and
known-reference checks in imperative code. A Blueprint attaches these checks — its **guardrails** —
as data on a `ServiceDeclaration` operation, optionally overridden per `ServiceUse`; a
`ServiceKindFactory` may supply a kind-wide default guardrail policy a Blueprint inherits unless it
overrides it. `QueueFace` evaluates guardrails once, immediately after a successful adapter
execution and before marking a request settled, and applies the resolved policy's `onViolation`
action — fail, bounded retry, bounded correction (re-invocation carrying the violation back to the
provider), or bounded fallback — recording attempts and the last violation on the
`ServiceRequestRecord` for provenance. Guardrail retry/correction attempts are counted separately
from transport-level retry and are always capped by the host regardless of what a policy declares,
so a Blueprint cannot author an unbounded call loop. External services cannot return arbitrary GIK
patches, events, authorization, or execution regardless of guardrail outcome — domain-owned
settlement preserves local policy and human gates. Deterministic execution may be selected as an
offline service, or used as an explicit, visible fallback; live-to-deterministic fallback is never
silent.

## Alternatives considered

- **Per-bundle bespoke integrations** (the pre-existing state). Rejected: every bundle re-solves
  credentials, retries, cancellation, and validation independently, with no shared ACX/AX execution
  path.
- **A host service-instance registry** (one host entry per model/agent/workspace/endpoint).
  Rejected: couples the host to every concrete deployment target instead of just the kinds it
  trusts; Blueprints — not the host — own which concrete service a bundle needs.
- **Domain-specific service kinds** (e.g. a portfolio-specific agent kind). Rejected: kinds must
  stay reusable across bundles; domain prompts/contracts/settlement/policy belong to the Blueprint/
  Profile, not the kind.
- **Separate QueueFace implementations for cells vs. substrate agents.** Rejected: both feed one
  QueueFace lifecycle and differ only in subject, continuity, input snapshot, and settlement
  target — `ServiceSubject` discriminates them instead of forking the runtime.
- **A single generic "URL service" kind standing in for all HTTP-shaped services.** Rejected: an
  HTTP-execution kind still needs a policy-controlled contract (auth, schema, timeout), not just an
  address — collapsing it to a bare URL would be a lowest-common-denominator regression relative to
  the richer lifecycle semantics other kinds get.
- **Literal credentials in Blueprints or queue messages.** Rejected: `credentialRef` + host-side
  resolution keeps secrets out of Bundle state, queue messages, browser JavaScript, logs, and
  provenance entirely.
- **New Kernel action verbs for service invocation.** Rejected: the existing `invoke` vocabulary
  already covers this; services are a QueueFace/effect-handler concern, not a new closed-grammar
  verb.
- **A bespoke output-validation type built new for services.** Rejected: the platform already has a
  declarative validator engine serving the same purpose for authored-input validation; guardrails
  reuse it rather than introducing a parallel validation vocabulary.
- **Guardrail policy fixed only at the service-kind level, or only per-Blueprint.** Rejected: a
  host-trusted kind needs to ship a sane default (for example, always attempt one bounded
  correction turn) without every Blueprint repeating it, while a Blueprint still needs to tighten or
  relax that default for its own operation or a single call site.
- **Unbounded retry or correction on guardrail violation.** Rejected: repeatedly re-invoking a
  paid or agentic provider with no ceiling is a resource-exhaustion risk; attempts are always
  host-capped independent of whatever a Blueprint's policy declares.
- **Silent live-to-deterministic fallback on exhausted guardrails.** Rejected: consistent with this
  ADR's untrusted-provider-output stance — exhaustion is a terminal, visible state that a
  Blueprint's own settlement/effect handling surfaces, not a mechanism QueueFace hides.

## Consequences

- `kernel/src/types.ts` gains `ServiceDeclaration`, `ServiceUse`, `ServiceSubject`,
  `ExternalsSpec.services`/`ManifestPayload.externals.services`; the prior operation-only
  `ServiceRequirement` shape is deprecated but still parses, for backward compatibility.
- `face/` gains `QueueFace` and `ServiceKindRegistry` as new, tested live-runtime primitives, and the
  `ControlFace` projection gains `describeServiceKinds`/`listServiceRequests`/`probeService` —
  extending the kernel → face → projection → transport layering of ADR-0037 with a services seam
  rather than a parallel mechanism.
- `schemas/manifest.schema.json` and `schemas/profile.schema.json` accept both the legacy and the
  full service-declaration shape, so existing documents keep validating.
- Existing bundles that previously called an external backend directly (bespoke HTTP protocols,
  direct proxy calls from effect handlers) migrate onto this contract incrementally; migration is
  tracked as ordinary implementation work, not a further architectural decision.
- Reference kind implementations live outside the platform packages (in the sample host), so adding
  a new kind never requires touching `QueueFace`, `ControlFace`, or any consuming Blueprint.
- `kernel/src/types.ts` additionally gains `ServiceOutputPolicy` and its violation-action shape on
  `ServiceDeclaration` (per operation) and `ServiceUse` (override); `ServiceRequestRecord` gains
  guardrail attempt and last-violation fields alongside its existing attempt/result/error state.
- `QueueFace.execute()` gains a guardrail-evaluation step between adapter execution and settlement,
  reusing the existing declarative validator package rather than a new evaluation mechanism;
  behavior is unchanged for any declaration that declares no guardrails.
- `ServiceKindFactory` gains an optional kind-wide default policy hook, consumed only when a
  Blueprint does not supply its own.
