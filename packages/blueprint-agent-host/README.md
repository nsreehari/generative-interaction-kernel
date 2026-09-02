# gik-blueprint-agent-host

Blueprint-specific trusted host lifecycle for agent proposals.

The package composes around a Blueprint authority implementation and provides:

```text
receive -> authorize -> admit -> apply
                    \-> reject
                         status
```

`BlueprintProposalHost` persists receipts through an injected `BlueprintProposalStore`, evaluates
a declarative `BlueprintJsonataPolicySet` for authorization, admission, and automatic versus
deferred application, and invokes an idempotent Blueprint authority only after admission. Policy
expressions use the platform safe JSONata subset; callback policy injection is not supported.
It does not depend on React or require BlueprintHost; browser hosts, backend
services, middleware, and workers can provide structurally compatible authority adapters.

`createInMemoryBlueprintProposalStore` supports tests and local composition.
`createDurableBlueprintProposalStore` and `createBlueprintProposalDurableTransitionAdapter` bind
the same receipt model to `gik-durable-runtime` journals and committed snapshots.

The package is the Blueprint HBX implementation over neutral contracts from
`gik-agent-lifecycle-exp`. Agents still receive UBX, CBX, or ABX proposal tools; HBX remains a
trusted host surface.