# ADR-0049: Stable event contracts and effect settlements

**Status:** Accepted - 2026-08-13

## Context

Cell interaction maps coupled an event name to one fixed implementation, while the six-action grammar duplicated value computation (`derive`) and specialized one resolver (`confirm`). External effect fields also mixed host routing metadata with resolver input. Completion was inferred from patches even though internal actions and external settlements have different lifecycles.

## Decision

### Stable ingress, selectable handlers

A Cell declares accepted ingress under `events`, including a JSON Schema for each payload. The active implementation lives under `behavior.on`. Every handled event must be declared, and payload validation occurs before its handler is admitted. Tiers and lowering may replace handlers without changing the stable event contract.

### Five action families

The closed grammar is:

- `assign`: internal state assignment, including expression-valued assignment through `args.from`;
- `emit`: internal event re-entry;
- `invoke`: external tool or service execution;
- `route`: external destination handoff; and
- `request`: external resolver-neutral acquisition of a decision, clarification, or data.

`derive` is represented by `assign` from an expression. `confirm` is represented by a `request` whose `control.kind` is `decision`.

### Internal completion and external settlement

`assign` and `emit` complete within reduction and are reported in `completedWithinRun`. They are not effects.

`invoke`, `route`, and `request` produce effects. Every effect has a stable `effectId`. Host-facing routing and validation metadata is stored in `control`; opaque resolver input is stored in `data`.

A request control declares `kind`, optional policy, and a required `responseSchema`. A resolver returns an `EffectSettlement` containing the effect id, outcome, and data. Settlement data is validated against the response schema before it can re-enter the kernel as the addressed `resolved` or `rejected` event. Invalid, stale, or mismatched settlements are rejected.

Invocation source metadata, including source ids and transforms, belongs to `invoke.control`. Service request transforms consume `effect.data`.

## Consequences

- Event names and payloads are durable ingress contracts; handlers remain replaceable implementations.
- Internal completion is observable without manufacturing effects.
- Hosts can inspect `control` without interpreting application data, and resolvers receive only `data`.
- Decision UX is one resolver implementation rather than a Kernel action family.
- Continuation inputs must be carried explicitly in request data and settlement data; confirmation-specific implicit payload forwarding is removed.
- This ADR does not define ordering between multiple external effects such as save-then-route.

### Amendment: one durable effects lane and selective re-entry

All durable external effects leave a Blueprint transition through the existing effects queue. The
queue runner dispatches by effect kind; queue completion is transport completion, not application
settlement. Ordinary `invoke` and `route` effects are fire-and-forget from Blueprint state and do not
manufacture inbox receipts. Cell source effects return a source receipt, and `request` effects return
an `EffectSettlement` receipt. Those receipts re-enter through the durable inbox and are admitted by
the owning Kernel path, which validates source identity or request correlation and response schema
before graph activation or addressed outcome dispatch. Arbitrary queued operations and events are
not accepted as request settlement.

## Amendments

This ADR amends ADR-0002 and ADR-0009, supersedes ADR-0019, adopts the terminal settlement model proposed by ADR-0042 for all external effects, and replaces ADR-0045's confirmation-specific approval wording with resolver-neutral requests.

## Alternatives considered

### Keep six verbs

Rejected because `derive` duplicates expression-valued assignment and `confirm` hard-codes one resolver UX into the Kernel.

### Let handlers imply event contracts

Rejected because tiers could silently change accepted ingress and payload shape while replacing implementation.

### Put all effect fields in one payload

Rejected because host routing metadata and opaque resolver input have different ownership and trust boundaries.

### Treat internal actions as settled effects

Rejected because synchronous reducer completion has no external lifecycle and should not enter effect queues.
