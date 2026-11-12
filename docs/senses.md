# Cell Senses

Senses give a Blueprint ongoing awareness. A Cell declares a Sense usage beside
its sources; the host maintains its binding and delivers discrete Signals into
declared Cell events. Each accepted event follows the normal state/event
reduction path.

Cells can have sources, Senses, both, or neither. Sources obtain bounded results.
Senses keep an observation relationship active across multiple deliveries.

## Authoring

Senses reuse `services`, operation contracts, provider-specific `config`,
JSONata transforms, validators, and Cell event contracts. There is no separate
Sense catalog or provider registry.

```json
{
  "services": {
    "clock": {
      "kind": "interval-timer",
      "version": "1",
      "operations": {
        "reviewCadence": {
          "operation": "interval",
          "contract": "review-clock/v1",
          "sense": {
            "kind": "timer",
            "signals": {
              "due": { "payloadSchema": { "type": "object" } }
            }
          },
          "settlement": { "transform": { "kind": "jsonata", "expr": "{}" } }
        }
      }
    }
  },
  "cells": {
    "review": {
      "id": "review",
      "inputs": [{ "token": "reviewSettings", "as": "settings" }],
      "senses": [{
        "id": "cadence",
        "service": "clock",
        "operation": "reviewCadence",
        "when": "inputs.settings.enabled",
        "input": {
          "kind": "jsonata",
          "expr": "{'intervalMs':inputs.settings.intervalMs}"
        },
        "on": { "due": "review-due" }
      }],
      "events": {
        "review-due": { "payloadSchema": { "type": "object" } }
      }
    }
  }
}
```

This is a fragment, to be composed into a complete Blueprint. The operation's
settlement remains part of the existing service declaration shape; observations
use Signal-to-event mappings rather than bounded result settlement.

`input` and `when` use the existing Cell evaluation context: declared `inputs`,
settled `fetched_sources`, `systemInputs`, and `computed` values (plus
`dpp.manifest` for a purpose-bearing Cell). Required unavailable
inputs leave the Sense inactive. Producer output tokens are resolved through the
running graph, not by guessing state paths.

An operation's optional `sense` contract defines its lifecycle kind and named
Signal payload schemas. A usage's `on` maps those names to its Cell's declared
events. Its optional `output` transform receives `response` and `signal`; the
operation's response transform and validators run before the usage transform.
Both the incoming Signal and resulting event payload are validated.

## Kinds and lifecycle

| Kind | Start | End |
| --- | --- | --- |
| `timer` | `schedule` | `cancel` |
| `sensor` | `monitor` | `stop-monitoring` |
| `resource` | `watch` | `unwatch` |
| `feed` | `subscribe` | `unsubscribe` |
| `agent` | `subscribe` | `unsubscribe` |

These are Sense kinds, distinct from executable service kinds such as
`interval-timer` or a provider-specific mail adapter. They determine lifecycle
verbs, not universal provider parameter shapes. Provider service kinds validate
their configuration and inputs and explicitly reject unsupported contracts.

Resource Senses observe changes to an existing thing; feed Senses observe
arriving items; agent Senses model contributions from an independent participant.
Polling, callbacks, webhooks, and streaming are implementation mechanisms.

A daily feed does not require a continuously connected agent. A provider can
register a recurring scheduler job, perform a bounded fetch on each occurrence,
and emit discrete Signals. The observation handle represents that registration;
closing it cancels future work. Calendar timing, catch-up, and cursor persistence
remain provider responsibilities, not guarantees of the included interval timer.

## Hosting

1. Construct `createBlueprintDurableTransitionAdapter` with a stable host-owned
   `instanceId`. The worker and React durable controller supply their runtime ID.
2. Register observation-capable adapters through `ServiceKindRegistry`.
3. Use `DefaultServiceHost.observe` to establish a usage's service operation.
   It reuses request transformation, validation, provider materialization, and
   authorization. Authorization is checked again for each delivery.
4. Reconcile **committed** `snapshot.spec.senses` through
   `BlueprintSenseReconciler` after initialization and committed transitions.
5. In `open`, construct an invoke effect with the binding's service, operation,
   Cell ID, and `input`; pass its Signals to the reconciler's `emit` callback.
   Forward the callback's second argument as well: the host supplies the actual
   transformed request input there so response validators and replay retain the
   same request context. This context is not taken from provider-authored Signal
   payloads.
6. Supply `append` to durably append the generated event to that same runtime's
   journal and wake its worker. Do not expose this privileged ingress as an
   arbitrary browser event endpoint.
7. Supply explicit error reporting and await `reconciler.stop()` on shutdown.

Observation is optional on an existing `ServiceAdapter`. Its `observe` method
receives the normal service request, an abort signal, the kind-specific start
action, an awaited `emit`, and `onError`. It returns a handle whose `close`
receives the corresponding end action. Establishment returns promptly; the
observation is not an indefinitely running effect-queue item. The adapter owns
transport-specific reconnect/resume behavior and reports failures explicitly.

The reconciler serializes lifecycle changes, retains unchanged bindings, and
closes replaced or removed usages. Cleanup failures are reported and reject the
lifecycle operation. Providers must release resources on close and honor abort.
Hosts must supervise reported provider failures; recovery is not silently
retried by the reconciler.
Observation establishment and provider failures are recorded as failed service
requests before error notification. Cleanup preserves failed, rejected, and
cancelled outcomes instead of replacing them with a successful-looking status.

One observer Cell can publish interpreted facts through output tokens for
multiple consumers. Distinct scopes or activation policies can use distinct
usages. Sharing an underlying transport must preserve each usage's semantics.

## Durability and delivery guarantees

Desired bindings, monotonically allocated generations, and recent delivery IDs
are persisted in the durable Blueprint specification. Scheduler registrations,
pollers, or live connections remain host-owned and are reconciled from committed
intent after restart. A durable external scheduler may resume an existing job;
reconciliation must not create duplicate jobs for the same binding.

Signal envelopes identify the Blueprint instance, Cell/usage binding, generation,
and producer delivery ID. Cross-instance deliveries fail. Retired-generation
deliveries are deliberately ignored, including when a preceding event in the
same journal batch disables or reconfigures the usage.

An accepted delivery is recorded in a per-binding window of the most recent
256 IDs. Repeated IDs within that window do not reduce again or issue effects.
IDs must be stable across retries and between 1 and 200 characters. Once an ID
expires from the window it can be accepted again; this is bounded duplicate
suppression, not indefinite exactly-once processing. Applications with stronger
business deduplication requirements should retain their own domain identities.

An acknowledgment means durable journal admission, not completion of downstream
business work. Accepted observations replay from the journal without contacting
producers. Live transport ordering, resumable cursors, backpressure, and gap
handling belong to each provider contract; GIK does not invent guarantees the
producer cannot fulfill. Invalid deliveries fail explicitly.

## Included timer provider

`createIntervalTimerServiceKind`, exported by `gik-controlface/services`, supplies
the `interval-timer` service kind. Its provider-specific `interval` operation
accepts an integer `intervalMs` between 1 and 2147483647 and emits `due` Signals
with `occurredAt` and `occurrence`.

It uses fixed-delay timing: each interval begins after the previous delivery
finishes, so deliveries do not overlap. On restart it begins a fresh interval;
missed occurrences are skipped. It does not claim calendar scheduling,
catch-up, or durable deadline semantics. Other service kinds can implement those
policies using their own schedule formats without changing the Cell mechanism.

Agent providers follow the same model. Their findings, questions, and
contributions arrive as Signals; outbound assignments remain ordinary effects.
Closing an observation binding need not terminate the independent agent.

## DPP context observations

Purpose-bearing Cells may declare ordinary Senses under `dpp.context.senses`.
They use the same service contracts, event mappings, authorization, generation
tracking, and withdrawal behavior as Cell-level Senses. Their IDs share the
Cell-wide ID space with every ordinary/context source and Sense. See
[Purpose-bearing Cells](./dpp.md) for context dataflow and source-result access.
