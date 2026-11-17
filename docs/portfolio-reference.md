# Durable advisory portfolio reference

[`portfolio.blueprint.json`](../blueprint/references/portfolio.blueprint.json) is an
ordinary, headless, fixed-structure Blueprint. Its operations, progress, strategy,
and plan Cells are reactive organs, not persistent participants. The reference
has no services, sources, tools, request effects, or domain-mutation capability.
Every output is advisory; nothing can trade or change an external portfolio.

## Durable state

The host supplies the initial `runtime.state`. The example's purpose and measures
are illustrative, not a universal participant schema.

| State | Owner and meaning |
| --- | --- |
| `charter.purpose` | Host-defined durable purpose. No Cell handler writes the charter. |
| `charter.successMeasures` | Host-defined success criteria, not inferred from task counts. |
| `charter.constraints` | Host-defined invariants that strategy and plan revisions cannot replace. |
| `strategy` | Mutable approach and priorities, with a monotonically increasing revision. |
| `planActions` | Stable action IDs with mutable descriptions and `pending`, `blocked`, or `complete` status. |
| `requestCondition` | Host-synchronized request-lifecycle projection, retained independently of heartbeat delivery. |
| `operationalPulse`, `progressPulse`, `strategyPulse` | Last accepted host sequence for each cadence; zero means not yet exercised. |
| `*Advisory` and `blueprintRunState` | Derived outputs and ordinary runtime bookkeeping, persisted with the rest of the snapshot. |

After each transition, commit the **entire returned state**, including
`blueprintRunState`. Reconstruct the next execution from that committed state and
the Blueprint, not from its initial seed. No Kernel instance, LLM conversation,
participant session, or process-local cache must survive.

The reference request-condition fixture is
`{requestId, status, desiredOutcome}`. `requestId` is opaque, `desiredOutcome` is
the host's requested result, and `status` is `pending`, `fulfilled`, or `cancelled`.
Only `pending` makes the operational advisory's `requestPending` true. This is a
local projection for composition, **not a new public lifecycle or correlation
contract**. The request-lifecycle delivery owns admission, authorization,
correlation, terminal status, and mapping its authoritative records into this
projection. It must synchronize an authorized projection into committed state
before the next transition. The Cells neither create nor settle requests and
never infer request fulfillment from action counts. Transport and lifecycle
integration remain outside this reference.

## Host heartbeat inputs

The host decides when a cadence is due and delivers an ordinary event:

```json
{"node":"operations","name":"heartbeat","payload":{"sequence":1}}
```

Use node `operations`, `progress`, or `strategy` for the operational, progress, or
strategy cadence respectively. Each cadence has an independent positive integer
sequence. Gaps are allowed; duplicate or older sequences do not change state.
A later heartbeat advances only its own pulse. Frequency, wall-clock scheduling,
catch-up policy, and delivery belong to the host; there is no timer primitive.
An empty transition does not advance any cadence.

Once its pulse is positive, a Cell publishes its advisory reactively from current
inputs. Before that, its advisory state is `null`. The sequence identifies the
last accepted heartbeat, not an immutable historical report: a later plan or
strategy revision can refresh an advisory at that same sequence. Persist
historical reports separately if needed.

| Output | Deterministic contribution |
| --- | --- |
| `operationalAdvisory` | Request identity/pending condition and pending action IDs. Blocked actions are not candidates. |
| `progressAdvisory` | Completed/total action counts and the host's success measures; counts do not prove success. |
| `strategyAdvisory` | Purpose, constraints, and current strategy for a judgment-based review. |

## Revisions and judgment boundaries

The host may deliver an admitted strategy revision:

```json
{"node":"strategy","name":"revise","payload":{"approach":"Discuss evidence gaps.","priorities":["Explain uncertainty"]}}
```

Or update an existing plan action:

```json
{"node":"plan","name":"revise","payload":{"actionId":"collect-evidence","description":"Evidence gaps documented.","status":"complete"}}
```

Strategy revisions increment `strategy.revision`. Plan revisions select by ID,
not array position, and preserve the ID, ordering, and all other actions.
The example's closed action IDs are also enumerated in its event schema; an
embedding author changing the initial plan must align that schema. These events
cannot insert, remove, or rename actions or replace charter fields. Additional
payload properties and unknown action IDs fail ordinary event validation.
These are already-admitted update inputs, not service outputs or authorization
proofs; event schemas enforce shape, while the host retains admission authority.

Filtering, counting, cadence replay handling, revision numbering, and identity
preservation are declarative. Choosing an approach, interpreting success,
assessing evidence quality, or deciding an action is complete requires judgment.
Progress and strategy advisories explicitly mark `requiresJudgment`; they do not
silently promote counts or proposals to decisions. Later composition may obtain
proposals from bounded typed services and validate/admit them through the host
before delivering these events. No judgment service, unrestricted effect, live
trading tool, or authorization/correlation implementation is introduced here.

The focused regression is `blueprint/test/portfolio-reference.test.ts`. It
serializes state and rematerializes the Blueprint between transitions, covering
independent cadences, replay, host-defined charter preservation, revisions,
stable action identity, and pending/terminal request conditions without effects.
This reference contributes to #46; it does not complete the parent composition.
