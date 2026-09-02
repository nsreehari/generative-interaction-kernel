# ADR-0050: Host-owned invocation authorization and governed participant requests

**Status:** Accepted - 2026-09-01

## Context

Durable Purpose Participants are long-lived Blueprint organisms that pursue a host-defined purpose across many process-stateless transitions. During one service `invoke`, a host-executed agent may make bounded tool calls; human input may remain pending for minutes or days; and some plan actions eventually need to apply real domain effects. This raises an authorization problem the closed grammar and the external-services contract (ADR-0040) did not fully address:

- A single host-wide `agentTools` list exposed the same tools to every request, and tool *visibility* was implicitly treated as permission to operate on any target the tool schema accepts.
- Confirmation-required outcomes had no typed representation, so a Cell would have had to parse arbitrary error strings, and there was pressure to mutate an `invoke` into a `request` inside the host.
- There was no host-owned, inspectable decomposition of what a participant may do, and no cheap, fail-closed way to authorize the many tool calls that occur within one service effect.
- Human request routing risked letting an agent supply recipients, channels, or role names.

The design intent is captured in the maintainer design note (`gik-maintainer` `TODO.md`, sections 8–14 and 22). This ADR records the kernel/service-host decisions that realize it. It deliberately does **not** introduce a second participant runtime, a parallel authorization system, or a new effect runtime.

## Decision

### Per-request agent-tool projection

The host-wide flat tool list is replaced by request-scoped projection: the host projects the set of tools visible to one concrete service request from trusted request context (request identity, blueprint id/revision, service, operation, subject, authority profile, and the authorization snapshot). Projection determines *visibility only*. It never authorizes a concrete call.

### One authorization decision point

A single policy decision point, `authorizeInvocation(invocation)`, is the sole authorizer for concrete service requests and projected agent-tool calls. It returns exactly one of three outcomes:

- `authorized` (optionally time-bounded);
- `rejected` with a reason; or
- `confirmation-required` with a reason and an optional **bounded** `requestIntent`.

The same evaluator is an enforcement point reused across service-request start, execution, and each projected agent-tool call — not an independent system per surface. Decision and snapshot values returned by a host policy are structurally validated; unknown or ambiguous shapes fail closed.

### Concrete tool-call authorization

Every projected tool is wrapped. After the agent supplies arguments and the concrete target is known, the wrapper calls `authorizeInvocation` and executes only if authorized. Tool visibility is never permission to operate on an arbitrary target accepted by the schema.

### Host-owned authority profiles

The host assigns a named, inspectable `InvocationAuthorityProfile` that decomposes authority into independent boundaries — `observation`, `planState`, `memory`, `producerArtifact`, and `domainEffects` — so unrelated grants are never bundled. A participant cannot select, modify, or widen its own profile. The kernel/service-host validates the profile's shape and carries it into the decision; boundary *semantics* are interpreted by the host policy (see Consequences).

### Request-scoped authorization snapshot and cost model

At service-request start the host builds one immutable `InvocationAuthorizationSnapshot` (resolved grants, authority-profile revision, policy revision, expiry, subject/participant identity, and cached scope inputs). Repeated in-request authorization is then local, bounded, deterministic, and approximately O(1). Independent of any host policy, `checkSnapshot` enforces fail-closed floors at every checkpoint — snapshot expiry, an idempotency-key requirement, and approved-target drift — and a **live kill switch** is read at every checkpoint. Remote policy or grant refresh happens out of band; before irreversible or high-impact application, the host performs fresh authoritative revalidation rather than trusting the cached decision.

The snapshot floors are a fast path, **not** a substitute for live reauthorization. A future optimization that caches grant decisions to skip live reauthorization must ship a revocation epoch in the same change; this is tracked as a deferred decision in issue #54.

### `invoke` and `request` remain distinct

A `confirmation-required` result on an `invoke` does **not** mutate it into a `request`. Instead the `invoke` returns a typed `confirmation-required` settlement; the Cell reacts and emits an authored `request`; the human answers later; the Cell retries the `invoke` under fresh authorization. When confirmation is encountered inside an agent tool call, the wrapper returns only a typed request intent — the agent cannot emit kernel effects — and the Cell validates the request type before emitting the actual `request` action. `confirmation-required` is never collapsed into a generic authorization error.

### Host-owned request routing and audience

Audience selection is host-owned. A participant supplies only a bounded `requestType` plus context; the host maps `requestType` to an audience. The agent must not supply recipients, addresses, usernames, role names, channels, or destinations. If a `requestType` has no host mapping, request creation fails closed as a configuration error (it is not sent to a default audience, silently discarded, inferred from agent text, or left indefinitely pending). No first-class `audience` field is added to `RequestControl` yet.

### Correlation propagation, not a new mechanism

The existing `correlationId`, `idempotencyKey`, `deadline`, and `actorId` fields are propagated end to end (participant → cycle → plan action → effect → service request → tool call → receipt → settlement → later observation). A request effect's triggering context is carried immutably to its settlement under a namespaced `requestContext` key so response data keeps its own top-level fields. No parallel correlation mechanism is introduced.

### Kill-switch coverage

When engaged, the kill switch blocks all participant activity that could produce or apply work, including approved-but-not-yet-applied operations, and a throwing or unavailable kill switch fails closed. Reactivation does not revive stale actions automatically; pending actions and approvals are revalidated.

## Consequences

- Tool exposure is scoped per request, and every concrete call is authorized against its actual target; schema-accepted targets are not implicitly permitted.
- Authorization is one evaluator with three outcomes reused at every enforcement point, so behavior is uniform and fail-closed by construction.
- The authority-profile decomposition is present and validated, but its practical value depends on a host policy that interprets the boundaries. The current reference hosts run allow-by-default / shadow, so the profile machinery is intentionally scaffolding ahead of its first enforcing policy (`gik-maintainer` phase M8).
- `invoke`/`request` stay separate effects, so Cells react to typed settlements and own request emission; agents never emit kernel effects.
- Human requests cannot be misrouted by an agent, and unmapped request types fail closed.
- The snapshot keeps in-request authorization cheap without weakening staleness handling, provided live reauthorization remains the source of truth (issue #54).

## Amendments

This ADR extends ADR-0040 (external services and QueueFace) with request-scoped tool projection and host-owned invocation authorization, complements ADR-0048 (agent lifecycle experiences and host-owned admission) at the service-host authorization boundary, and builds on ADR-0049 (stable event contracts and effect settlements) for the typed `request`/settlement contract and `requestContext` propagation.

## Alternatives considered

### Keep a host-wide tool list and treat visibility as permission

Rejected because a participant with a broadly useful tool could operate on targets far outside its intended authority; visibility and permission are different trust decisions.

### Mutate `invoke` into `request` on `confirmation-required`

Rejected because it conflates two distinct effects, hides the approval in the host, and forces Cells to parse untyped errors. A typed confirmation settlement plus an authored request keeps ownership explicit.

### Let the agent supply the request audience

Rejected because recipients, channels, and role names are governance decisions the host owns; unmapped types must fail closed rather than default or infer a recipient.

### Re-run the full policy (or a remote grant lookup) at every agent-tool call

Rejected as the default hot path: it is not bounded or deterministic. A request-scoped snapshot with fail-closed floors and a live kill switch gives O(1) checks, while fresh revalidation is required only before irreversible application.

### Add a mandatory revocation epoch to every snapshot now

Deferred (issue #54). No host caches grant decisions today, so live reauthorization already covers revocation; a mandatory epoch on every consumer would be speculative infrastructure.
