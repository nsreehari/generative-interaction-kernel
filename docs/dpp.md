# Purpose-bearing Cells

A Cell with a `dpp` section is a durable purpose participant (DPP). A Cell without
that section retains its ordinary behavior. There is no separate `kind`
discriminator, participant scheduler, or mandatory reasoning workflow.

## Authoring

`dpp.manifest` carries the complete participant reference frame:

- `manifest-version` and participant `stable-id` / `human-readable-name`;
- `durable-charter`: identity and viability, value creation and beneficiaries,
  participation relationships, authority and boundaries, and stewardship;
- `evolving-working-model`: currency hypotheses, tensions, strategy, rhythm,
  and learned-context references;
- `context-store.query` and `context-store.ingest`: descriptive relevance and
  evidence-recording guidance.

Relationships and initially unknown working-model collections may be empty.
Charter text is not an executable permission grant, and rhythm text does not
automatically create a timer. The host retains execution authority.

`dpp.context.sources` contains ordinary bounded source declarations. It must
include operations resolving to both `context-store.query/v1` and
`context-store.ingest/v1`. Optional `dpp.context.senses` contains ordinary Sense
declarations. Source and Sense IDs must be unique across the entire Cell,
including its ordinary declarations.

```yaml
id: portfolio-intelligence
dpp:
  manifest:
    # Full manifest; a purpose sentence alone is insufficient.
    # ...
  context:
    sources:
      - id: portfolio-history
        service: portfolio-context
        operation: query
        input:
          kind: jsonata
          expr: "{'scope':inputs.portfolioId,'requestKey':computed.reviewKey,'query':{'guidance':dpp.manifest.`context-store`.query},'limit':10}"
        output:
          kind: jsonata
          expr: response
      - id: remember-assessment
        service: portfolio-context
        operation: ingest
        when: computed.assessmentReady
        input:
          kind: jsonata
          expr: "{'scope':inputs.portfolioId,'records':[computed.assessmentRecord]}"
        output:
          kind: jsonata
          expr: response
    senses: []
```

The fragment illustrates operation wiring, not a complete Cell or service.
Inputs, computations, service declarations, and readiness conditions must be
declared by the complete Blueprint.

## Data participation

Expressions read the local manifest through `dpp.manifest`. Compute selects
relevant guidance and combines current input-port data with settled results.
Ordinary and context-source results share `fetched_sources.<source-id>`; IDs
containing punctuation use JSONata quoting, for example
``fetched_sources.`portfolio-history` ``.

This replaces the former Cell expression root `sources`. Migrate compute,
conditions, input transforms, output bindings, and expression-based views and
behavior to `fetched_sources`; there is no compatibility alias. Source
configuration properties remain named `sources`. Internal result storage remains
`blueprintRunState.cells[cellId].sourceValues`.

The manifest is bound during materialization, not fetched as an external source.
Compute runs against already-settled source data before eligible effects are
produced. Source input transforms receive that computed context. A context
Sense delivers declared events, not fetched-source records.

Source output transforms receive `response` plus the immutable launch context
(`inputs`, `computed`, `fetched_sources`, `systemInputs`, and a DPP's `dpp.manifest`).
Use the launch request key to correlate a response; do not attach the current
state's key to an older result. This works in immediate and queued execution.

All context I/O follows the existing effect/settlement path. The context store is
not the execution journal, and a query result is not the whole store. Select
what to ingest; retain record identity, provenance, uncertainty, and observation
times. Acknowledgment of ingestion is distinct from retrieved evidence.

Author queries against an explicit portfolio/review basis and reject stale
results before producing assessments. Use stable record IDs for ingestion
retries. Store changes do not inherently request another query or assessment;
that reactivity must be declared.

## Lowering and lifecycle

Service implementation programs may override `dpp.context.sources` and
`dpp.context.senses` while preserving source IDs/contracts and Sense signal/event
contracts, just as for ordinary declarations. They cannot replace the manifest.
Projection lowering does not own context behavior.

Removing a DPP Cell removes its contribution, not independent portfolio facts.
Consumers must tolerate its absence through ordinary optional inputs and
conditions. Cell removal also removes its service/projection recipe overrides.
Existing context Sense reconciliation retires withdrawn bindings.
Late source settlements for an absent declaration are not applied. Authorized
replacement or removal resets the actor's local fetched values and outstanding
request tracking while retaining the request-token watermark.

External records remain under host-managed retention and access policy; removal
does not delete them. Reintroduction can query the same authorized scope.
Withdrawing an actor cannot undo external work already performed by a provider.
