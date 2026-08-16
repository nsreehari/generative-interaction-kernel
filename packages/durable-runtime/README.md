# @gik/durable-runtime

Provider-neutral durable state, journal, queue, and storage primitives for GIK
hosts.

```bash
npm install @gik/durable-runtime
```

The host supplies pure transitions and effect handlers. Durable providers own
persistence, leases, optimistic revision checks, journal access, queue
settlement, and snapshot synchronization.

```ts
import {
  createDurableQueueProcessor,
  createDurableRuntime,
} from "@gik/durable-runtime";
```

## Storage backends

| Import | Backend |
|---|---|
| `@gik/durable-runtime/storage/memory` | In-process memory |
| `@gik/durable-runtime/storage/indexed-db` | Browser IndexedDB |
| `@gik/durable-runtime/storage/filesystem` | Filesystem service |
| `@gik/durable-runtime/storage/cosmos` | Azure Cosmos DB |

Backend-specific library and API entry points are available below the
corresponding storage path. Azure packages are optional peer dependencies;
browser and filesystem consumers do not need to install them.

## Connectors

- `@gik/durable-runtime/connectors/browser-indexed-db`
- `@gik/durable-runtime/connectors/filesystem-mcp`
- `@gik/durable-runtime/connectors/azure-function`
- `@gik/durable-runtime/server/transports/http`

## Package boundary

This package does not interpret Blueprint or Kernel semantics. The caller owns
the transition model and passes opaque declarative specifications to the
runtime. A transition uses one durable provider for its state, journal, and
effect queue; it never spans provider kinds.

## License

MIT
