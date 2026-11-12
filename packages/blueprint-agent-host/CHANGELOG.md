# gik-blueprint-agent-host

## 0.2.1

### Patch Changes

- Atomically deduplicate proposal receipt creation in memory and committed durable
  transitions. Concurrent identical submissions share one receipt; conflicting
  content is rejected without poisoning journal replay. Custom stores must
  enforce proposal-ID uniqueness and immutable proposal content.

- Updated dependencies
  - gik-evaluators@0.4.0
  - gik-agent-lifecycle-exp@0.3.0

## 0.2.0

### Minor Changes

- 823bf75: Make agent lifecycle contracts and Blueprint proposal hosting available through
  the supported public npm release channel. Blueprint descriptions now include
  Cell Sense usages and Signal-to-event mappings without exposing provider
  configuration or requiring persistent agent connections.

  The proposal host delegates business idempotency to the authoritative application
  layer; receipt recovery does not guarantee exactly-once processing of concurrent
  submissions. Runtime providers continue to own recurring observations and scheduling.

### Patch Changes

- Updated dependencies [823bf75]
  - gik-agent-lifecycle-exp@0.2.0
