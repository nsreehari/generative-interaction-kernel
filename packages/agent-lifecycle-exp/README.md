# @gik/agent-lifecycle-exp

Transport-neutral lifecycle contracts and JSON tools for agents and trusted hosts.

The package defines a standard operation vocabulary:

```text
manifest -> discover -> describe -> inspect -> validate -> simulate -> preflight
		 -> read_in_progress_proposal -> set_in_progress_proposal
```

`manifest` is mandatory. Every profile explicitly selects a preset or operation list. `standard`
exposes the complete vocabulary; `static-authoring` exposes:

```text
manifest -> describe -> validate -> simulate
		 -> read_in_progress_proposal -> set_in_progress_proposal
```

Profiles may also declare an explicit custom subset. Operation meaning does not change with the
selection: `simulate` uses supplied or candidate-owned state, while `preflight` checks current host
state and policy. `set_in_progress_proposal` atomically replaces one complete, request-scoped draft;
`read_in_progress_proposal` returns the latest draft without mutation. There is no append operation.

A draft contains an ordered batch of typed domain actions and optional rationale. It contains no
proposal ID, receipt, target, actor, revision, or timestamp. On completion, the host creates that
authoritative metadata from its own request and target context, then authorizes, admits, and applies
the proposal. Provider or model output never supplies receipt authority.

The trusted host owns receipt, authorization, admission, application, rejection, and status. A
proposal never grants authoritative mutation merely because a host chooses to auto-admit it.

Blueprint integrations use cumulative experience projections:

```text
UBX (use) subset CBX (customize) subset ABX (author) subset HBX (host) subset-or-equal Control
```

Lifecycle profiles translate mechanically into schema-bearing JSON tools. For example,
`defineAgentLifecycleProfile("use_blueprint", ops)` generates the operations declared by that
profile's manifest. The package does not depend on Blueprint, Kernel, MCP, HTTP, Foundry, or another
agent provider.

Authored lifecycle material, operation schemas, manifests, and provider function definitions are
declarative. `blueprintUseFunctionTools` generates metadata directly without placeholder handlers.
`AgentLifecycleOps` and tool handlers are trusted execution ports used only when operations run;
they are not policy or product configuration.

`toAgentFunctionTools` projects a neutral catalog into strict OpenAI-compatible function metadata,
and `blueprintUseFunctionTools` derives provisionable UBX definitions from authored Blueprint
material. Provider transports carry calls and outputs; the host executes handlers from its local
request-scoped catalog.

`createCapabilityDescribeTool` exposes two operations through one transport-free `describe` tool:
`catalog-capabilities` for compact selection guidance and `multiple-capabilities` for one batched
detail lookup. The latter requires a non-empty, unique `capabilities` array and is the only detail
operation; no singular compatibility kind exists.

`AgentProvisioningTemplate` is the provider-neutral source for provisioned agent instructions,
reasoning, function metadata, response schemas, and host execution authority.
`toFoundryPromptDefinition` lowers it to a Foundry prompt definition, while
`toCopilotAgentMarkdown` renders the same contract as a GitHub Copilot custom agent.

`BLUEPRINT_AUTHORING_GUIDANCE_RESOURCE_URL` identifies the package-owned Markdown guidance for
agents that author Blueprint artifacts. Provisioning code may read this resource and append it to
the relevant provider-neutral templates without maintaining provider- or product-specific copies.

See `docs/sot/gik-public/agent-lifecycle-exp.yaml` and
`docs/decisions/ADR-0048-agent-lifecycle-experiences-and-host-admission.md` in the repository.
