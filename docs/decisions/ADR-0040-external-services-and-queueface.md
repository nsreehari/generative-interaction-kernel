# ADR-0040 — External services as one adapter contract: host execution, Blueprint-owned operations, Face projections

**Status:** Accepted — amended 2026-07-20

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

The **Blueprint** brings the concrete service configuration and complete operation contract its
behavior needs. A named service declaration carries a kind, kind-specific config, and named
operations. Each operation owns its provider operation, contract id, request transform and
validation, response transform and validation, violation behavior, and settlement transform.
Profiles lower these declarations into the runtime manifest unchanged. There is no separate
`serviceBindings` or `operationPolicies` precedence layer.

Blueprints may carry endpoints and credential *references*, never literal keys, tokens, or
passwords. A `credentialRef` is authorized and resolved by the host at execution time and is never
copied into Blueprint/Bundle code, Kernel state or events, queue records, logs, catalog snapshots,
or provenance. A trusted browser-host credential projection may transiently collect and store the
secret as host state; it emits only availability and discovery results into the Blueprint runtime.

### Compact contracts

- `ServiceKindFactory` — trusted host implementation: kind id, configuration schema, validation,
  discovery/probe, lazy `create`.
- `ServiceDeclaration` — Blueprint-owned `{ kind, config, operations }`.
- `ServiceOperationDeclaration` — one named invocation's provider operation, contract, subject,
  request/response data stages, settlement, and bounded violation behavior.
- `ServiceSubject` — identifies `cell`, `substrate-agent`, `chat`, or `task` scope without forking
  a separate service runtime per lane.
- `ServiceRequestRecord` — stable request/correlation/idempotency identity, Blueprint/state
  revisions, attempts, timestamps, resolved kind, provider-native session/thread provenance,
  terminal result/error state.
- `ServiceDependency` / `UnsatisfiedServiceDependencyError` — structured signal from a trusted
  service kind that an active invocation cannot proceed until the host supplies an opaque
  dependency reference, such as a credential. It carries no gathering UI or domain copy.
- `ServiceHost` — host-owned execution capability: kind materialization, transforms, validation,
  execution, queue/request lifecycle, retry/correction ceilings, cancellation, and settlement.

`ServiceHost` is the live execution seam. It loads Blueprint declarations and lazily materializes
scoped adapters through the trusted `ServiceKindRegistry`. Cache scope (`per-invocation`,
`per-cell`, `per-blueprint`, `per-session`) controls provider-native continuity — it is not host
service-instance registration. Immediate and queued execution share one request/settlement
contract.

GIK defines the `ServiceHost` interface and provides `DefaultServiceHost` as its official reference
implementation. Outer hosts instantiate it and supply trusted service-kind factories, adapters,
credential resolution, endpoint authorization, and environment policy. Providing the reference
coordinator does not make GIK the host or owner of external services or their storage.

`DefaultServiceHost` records an unsatisfied dependency as a failed request before applying host
policy. Its default immediate policy preserves the Blueprint operation's `failureSettlement`; a
strict headless host may instead surface the structured error to its caller. Queued execution
always retains the failure as a durable retry/dead-letter record rather than throwing through the
worker loop. Dependencies are inspected lazily for active invocations; this contract does not add
startup preflight or a second requirement graph.

`QueueFace` is a thin queue-oriented projection over `ServiceHost`; it does not register adapters or
execute providers. `ControlFace` projects kind/config-schema/probe/request-state operations from the
same `ServiceHost` instance, and `AgentFace` exposes only the policy-approved service operations
projected by `ControlFace`. These Faces depend on the `ServiceHost` contract; they do not construct
`DefaultServiceHost`. This is consistent with the face/projection boundary from
[ADR-0037](ADR-0037-face-projections-and-transport-boundary.md): faces expose one host capability
without owning a parallel registry or runtime. `AgentFace` receives only the policy-approved
operational subset.

### Lanes, services, and operations stay distinct identities

A service (e.g. a chat/completion agent) is not the same thing as an execution lane (chat, task,
substrate-agent, inline-cell) or a domain operation (whatever the Blueprint asks the service to do).
An `ExecutionRef`/queue lane controls *where* a worker runs; the Blueprint service declaration
selects *which* service runs inside that worker. Keeping these three axes separate in configuration
and provenance is what lets a Blueprint swap services without touching lane or operation semantics.

### Untrusted provider output: guardrails and violation policy

Provider output is untrusted data. The host runs the same declarative validator engine already used
for authored-input validation (`jsonata`, `ajv-schema`, `typedef` checks, extensible to future
semantic checks) against provider output, instead of each Bundle hand-rolling structural and
known-reference checks in imperative code. A Blueprint attaches these checks directly to the
operation's response stage. `ServiceHost` evaluates them after successful adapter execution and
before settlement, then applies the operation's `onViolation` action — fail, bounded retry, bounded
correction, or bounded fallback — recording attempts and the last violation on the
`ServiceRequestRecord`. Retry/correction attempts are counted separately from transport retry and
are always capped by the host. External services return data only; they cannot supply arbitrary GIK
patches, events, authorization, or execution. The Blueprint-owned settlement transform preserves
local policy and human gates. Deterministic execution may be selected as an offline service or used
as an explicit, visible fallback; live-to-deterministic fallback is never silent.

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
- **Separate service hosts for cells vs. substrate agents.** Rejected: both feed one host lifecycle
  and differ only in subject, continuity, input snapshot, and settlement
  target — `ServiceSubject` discriminates them instead of forking the runtime.
- **A single generic "URL service" kind standing in for all HTTP-shaped services.** Rejected: an
  HTTP-execution kind still needs a policy-controlled contract (auth, schema, timeout), not just an
  address — collapsing it to a bare URL would be a lowest-common-denominator regression relative to
  the richer lifecycle semantics other kinds get.
- **Literal credentials in Blueprints or queue messages.** Rejected: `credentialRef` + host-side
  collection/resolution keeps secrets out of Blueprint/Bundle code, Kernel state/events, queue
  records, logs, and provenance.
- **New Kernel action verbs for service invocation.** Rejected: the existing `invoke` vocabulary
  already covers this; services are a QueueFace/effect-handler concern, not a new closed-grammar
  verb.
- **A bespoke output-validation type built new for services.** Rejected: the platform already has a
  declarative validator engine serving the same purpose for authored-input validation; guardrails
  reuse it rather than introducing a parallel validation vocabulary.
- **Guardrail policy split across kind defaults, declaration policy, and call-site overrides.**
  Rejected: precedence fragments one authored operation across multiple authorities. The Blueprint
  operation owns one explicit policy; the host admits it within stricter environment ceilings.
- **Unbounded retry or correction on guardrail violation.** Rejected: repeatedly re-invoking a
  paid or agentic provider with no ceiling is a resource-exhaustion risk; attempts are always
  host-capped independent of whatever a Blueprint's policy declares.
- **Silent live-to-deterministic fallback on exhausted guardrails.** Rejected: consistent with this
  ADR's untrusted-provider-output stance — exhaustion is a terminal, visible state that a
  Blueprint's own settlement/effect handling surfaces, not a mechanism the host hides.

## Consequences

- `kernel/src/types.ts` gains `ServiceDeclaration`, `ServiceUse`, `ServiceSubject`,
  `ExternalsSpec.services`/`ManifestPayload.externals.services`; the prior operation-only
  `ServiceRequirement` shape is deprecated but still parses, for backward compatibility.
- `face/` gains `ServiceHost`, the queue-oriented `QueueFace` projection, and
  `ServiceKindRegistry`; the `ControlFace` projection gains
  `describeServiceKinds`/`listServiceRequests`/`probeService` —
  extending the kernel → face → projection → transport layering of ADR-0037 with a services seam
  rather than a parallel mechanism.
- `schemas/manifest.schema.json` and `schemas/profile.schema.json` accept both the legacy and the
  full service-declaration shape, so existing documents keep validating.
- Existing bundles that previously called an external backend directly (bespoke HTTP protocols,
  direct proxy calls from effect handlers) migrate onto this contract incrementally; migration is
  tracked as ordinary implementation work, not a further architectural decision.
- Reference kind implementations live outside the platform packages (in the sample host), so adding
  a new kind never requires changing a consuming Blueprint or Face projection.
- `ServiceRequestRecord` carries guardrail attempts and last violations alongside transport
  attempts/result/error state.
- `ServiceHost` evaluates request and response data stages and the final settlement transform using
  trusted expression and validator implementations. QueueFace contains no alternate callback or
  provider-owned settlement path.
- Production Bundle source must not construct service registries, adapters, QueueFaces, or
  credential stores; architecture tests enforce that boundary.
