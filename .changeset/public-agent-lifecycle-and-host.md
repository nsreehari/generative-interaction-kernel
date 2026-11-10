---
"gik-agent-lifecycle-exp": minor
"gik-blueprint-agent-host": minor
---

Make agent lifecycle contracts and Blueprint proposal hosting available through
the supported public npm release channel. Blueprint descriptions now include
Cell Sense usages and Signal-to-event mappings without exposing provider
configuration or requiring persistent agent connections.

The proposal host delegates business idempotency to the authoritative application
layer; receipt recovery does not guarantee exactly-once processing of concurrent
submissions. Runtime providers continue to own recurring observations and scheduling.
