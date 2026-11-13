# gik-controlface

## 0.6.0

### Minor Changes

- Add UI-independent service setup requirements, host readiness and setup-action descriptions, and explicit dependency checks for configured service kinds.

### Patch Changes

- Update published package inputs and exact workspace dependency pins.

## 0.5.0

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

## 0.4.0

### Minor Changes

- d093437: Add Cell Senses for ongoing service-backed observation. Reuse service contracts,
  provider configuration, transforms, and Cell events for timers, sensors,
  resources, feeds, and persistent agents. Include durable binding generations,
  bounded delivery deduplication, host lifecycle reconciliation, and an interval
  timer service provider.

## 0.3.0

### Minor Changes

- 21f16ab: Add fragment-aware Blueprint validation and deterministic assembly while preserving assembled Blueprints as the runtime contract.

## 0.2.0

### Minor Changes

- 1e2a7b6: Add host-owned invocation authorization snapshots and explicit durable request correlation context.

  Ambiguous service operation names now require an explicit service reference instead of selecting the first matching service.

## 0.1.5

### Patch Changes

- 1217a63: Prepare the supported public package set with package-owned consumer
  documentation and validated release metadata.
- a11cb3f: Republish the public packages with their declared build output. The previous
  prerelease tarballs were produced without a build of the release commit, so
  installed packages were missing the `dist` entry points declared by their
  package manifests.

## 0.1.5-next.1

### Patch Changes

- a11cb3f: Republish the public packages with their declared build output. The previous
  prerelease tarballs were produced without a build of the release commit, so
  installed packages were missing the `dist` entry points declared by their
  package manifests.

## 0.1.5-next.0

### Patch Changes

- 49ef851: Prepare the supported public package set with package-owned consumer
  documentation and validated release metadata.
