# @gik/blueprint

Canonical Blueprint artifacts, Cells, tiers, lowering recipes, and validated lowering into
`@gik/kernel` executable programs.

## External services

A Blueprint may declare concrete logical services in `payload.services`. The Blueprint owns each
service's kind, non-secret configuration, operation contract, request and response stages,
validation, violation behavior, settlement, and failure settlement. Cells may associate operations
through `sources`, and behavior invokes a declared operation through the existing `invoke` action.

The Blueprint does not execute services. An outer host admits trusted service-kind factories,
constructs `DefaultServiceHost`, supplies credentials and endpoint policy, and connects it through
the runtime Orchestrator. Literal credentials must never appear in Blueprint configuration or
runtime state.

See `docs/decisions/ADR-0040-external-services-and-queueface.md` for the normative ownership model.

## Worker hosting

`@gik/blueprint/worker` coordinates one journal/engine/effect cycle per wake. Connector-specific
factories are available from:

- `@gik/blueprint/worker/in-memory`
- `@gik/blueprint/worker/indexed-db`
- `@gik/blueprint/worker/filesystem-mcp`
- `@gik/blueprint/worker/azure`

Workers are asynchronous and placement-neutral. Wake notifications are hints, leases arbitrate
ownership, and effect outcomes return through the journal before changing Blueprint state.