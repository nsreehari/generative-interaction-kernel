# gik-agent-lifecycle-exp

## 0.3.0

### Minor Changes

- Add Cell-local durable purpose participants (DPPs) with full manifests,
  mandatory context query/ingest sources, optional context Senses, and the existing
  host-authorized effect/settlement lifecycle. Context declarations participate in
  lowering, descriptions, withdrawal, and reintroduction without a separate agent
  scheduler. Export a host-backed context-store service kind with validated query
  and ingest contracts.

  BREAKING: Cell expressions now read settled ordinary and context-source data
  through `fetched_sources`, replacing the former `sources` root without a
  compatibility alias. Migrate compute, predicates, transforms, output bindings,
  and view/behavior expressions; source configuration properties remain `sources`.
  Source and Sense IDs must be unique across all ordinary and context declarations
  within a Cell.

  Source output transforms receive immutable launch inputs, computations, fetched
  data, system inputs, and the DPP manifest alongside `response`, so older results
  retain their original correlation identity in immediate and queued execution.

## 0.2.0

### Minor Changes

- 823bf75: Make agent lifecycle contracts and Blueprint proposal hosting available through
  the supported public npm release channel. Blueprint descriptions now include
  Cell Sense usages and Signal-to-event mappings without exposing provider
  configuration or requiring persistent agent connections.

  The proposal host delegates business idempotency to the authoritative application
  layer; receipt recovery does not guarantee exactly-once processing of concurrent
  submissions. Runtime providers continue to own recurring observations and scheduling.

## 0.1.1
