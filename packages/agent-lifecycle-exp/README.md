# @gik/agent-lifecycle-exp

Transport-neutral lifecycle contracts and JSON tools for agents and trusted hosts.

An agent lifecycle profile exposes a standard capability flow:

```text
manifest -> discover -> describe -> inspect -> validate -> simulate -> preflight -> propose
```

The trusted host owns receipt, authorization, admission, application, rejection, and status. A
proposal never grants authoritative mutation merely because a host chooses to auto-admit it.

Blueprint integrations use cumulative experience projections:

```text
UBX (use) subset CBX (customize) subset ABX (author) subset HBX (host) subset-or-equal Control
```

Lifecycle profiles translate mechanically into schema-bearing JSON tools. For example,
`defineAgentLifecycleProfile("use_blueprint", ops)` generates `use_blueprint_manifest` through
`use_blueprint_propose`. The package does not depend on Blueprint, Kernel, MCP, HTTP, Foundry, or
another agent provider.

Authored lifecycle material, operation schemas, manifests, and provider function definitions are
declarative. `blueprintUseFunctionTools` generates metadata directly without placeholder handlers.
`AgentLifecycleOps` and tool handlers are trusted execution ports used only when operations run;
they are not policy or product configuration.

`toAgentFunctionTools` projects a neutral catalog into strict OpenAI-compatible function metadata,
and `blueprintUseFunctionTools` derives provisionable UBX definitions from authored Blueprint
material. Provider transports carry calls and outputs; the host executes handlers from its local
request-scoped catalog.

See `docs/sot/gik-public/agent-lifecycle-exp.yaml` and
`docs/decisions/ADR-0048-agent-lifecycle-experiences-and-host-admission.md` in the repository.
