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

The store must atomically deduplicate creation by proposal ID, returning the
canonical receipt for identical content and rejecting conflicting content.
Both supplied stores enforce this, including concurrent durable store instances
sharing a journal. Custom stores must provide the same atomic guarantee.
Receipt updates cannot change proposal identity or content.

The authority must make application idempotent by receipt ID for recovery and
concurrent applications of the same receipt. Receipt storage does not make
external business effects transactional. The authoritative application layer
must also enforce its business transaction identity across distinct proposals.
Distinct business transactions need distinct identities, even when their
payloads are identical.

`createInMemoryBlueprintProposalStore` supports tests and local composition.
`createDurableBlueprintProposalStore` and `createBlueprintProposalDurableTransitionAdapter` bind
the same receipt model to `gik-durable-runtime` journals and committed snapshots.
Creation is resolved within the committed transition, not by a snapshot
check followed by an unconditional write. Busy/conflicting transitions are retried
for up to 30 seconds; commit failures are surfaced to the caller.

The package is the Blueprint HBX implementation over neutral contracts from
`gik-agent-lifecycle-exp`. Agents still receive UBX, CBX, or ABX proposal tools; HBX remains a
trusted host surface.

## Senses and recurring observations

A Sense is an ongoing observation intent, not necessarily a live connection or
an always-running agent. A daily feed can use a scheduler to perform a short-lived
fetch and deliver each result as a discrete Signal. Its service contract owns
cadence, cursors, retry, and missed-occurrence behavior.

The proposal host does not schedule those jobs or maintain their connections.
Runtime hosting reconciles committed Sense bindings and journals Signals through
the existing Blueprint Sense machinery. Signals are observations, not agent
proposals, and do not enter `receive`/`authorize`/`admit` as receipts.

Proposals that change a Sense's configuration, activation inputs, or surrounding
Blueprint still use the ordinary proposal lifecycle:

- The authority supplies current, trusted Sense facts through `inspect`'s
  `snapshot.value`; JSONata policies already receive that snapshot.
- The authority's `validate` checks the proposed domain actions and resulting
  Blueprint, including service contracts and Signal-to-event routes.
- Only an admitted proposal reaches `authority.apply`. The runtime then
  reconciles the newly committed binding intent, not an agent-supplied schedule
  or callback.

For example, an authority may expose `{ senses: { dailyFeed: { enabled: true } } }`
in `snapshot.value`; a policy can read `snapshot.value.senses.dailyFeed.enabled`.
This is an application-defined facts shape, not a new required snapshot schema.
Agent-supplied action payloads must not be used as trusted runtime Sense facts.