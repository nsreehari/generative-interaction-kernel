# @gik-ai/durable-runtime

Provider-neutral durable state, journal, queue, and storage primitives for GIK
hosts.

```bash
npm install @gik-ai/durable-runtime
```

The host supplies pure transitions and effect handlers. Durable providers own
persistence, leases, optimistic revision checks, journal access, queue
settlement, and snapshot synchronization.

```ts
import {
  createDurableQueueProcessor,
  createDurableRuntime,
} from "@gik-ai/durable-runtime";
```

## Storage backends

| Import | Backend |
|---|---|
| `@gik-ai/durable-runtime/storage/memory` | In-process memory |
| `@gik-ai/durable-runtime/storage/indexed-db` | Browser IndexedDB |
| `@gik-ai/durable-runtime/storage/filesystem` | Filesystem service |
| `@gik-ai/durable-runtime/storage/cosmos` | Azure Cosmos DB |

Backend-specific library and API entry points are available below the
corresponding storage path. Azure packages are optional peer dependencies;
browser and filesystem consumers do not need to install them.

## Connectors

- `@gik-ai/durable-runtime/connectors/browser-indexed-db`
- `@gik-ai/durable-runtime/connectors/filesystem-mcp`
- `@gik-ai/durable-runtime/connectors/azure-function`
- `@gik-ai/durable-runtime/server/transports/http`

## Exported API

### Root entry point

`@gik-ai/durable-runtime` exports `createDurableRuntime` (also aliased as
`createBrowserDurableRuntime`) and `createConfiguredBrowserDurableRuntime`.

`createDurableRuntime({ runtimeId, providers, transitionAdapter,
effectHandlers?, effectFailureHandler? })` returns a runtime with these public
methods:

| Method | Verified behavior |
|---|---|
| `initializeRuntime(refs)` | Calls `transitionAdapter.initialState()` and `transitionAdapter.initialSpec()`, creates durable state/spec if absent, and returns `{ created, revision }`. |
| `appendJournal({ ...refs, entry })` | Appends one journal entry through the selected provider and requests an engine wake. |
| `readSnapshot(refs)` | Reads the committed `{ state, spec, revision }` snapshot without acquiring a transition lease. |
| `readSnapshotChanges({ ...refs, afterRevision })` | Returns `unchanged`, `changes`, or `reset` results for committed state/spec changes after a revision. |
| `subscribe(refs, listener, options?)` | Polls `readSnapshotChanges`, optionally listens for provider invalidations, suppresses `unchanged` notifications, and returns an unsubscribe function. |
| `runEngine({ ...transitionRefs, leaseMs? })` | Acquires one transition lease, reads pending journal entries after the persisted cursor, runs `transitionAdapter.transition`, applies `transitionAdapter.applySpecUpdates`, and commits state, spec, cursor, and effects. |
| `processEngineWake({ ...transitionRefs, leaseMs? })` | Reads the durable wake marker and only runs engine work when a wake is pending. |
| `processQueueLaneItem({ stateRef, effectsQueueRef, effectsLane?, journalRef, visibilityMs?, maxAttempts?, signal? })` | Leases at most one queued effect, runs the matching local effect handler, appends any returned events, then acknowledges or negatively acknowledges the queue item. |

When `effectHandlers` are configured, `createDurableRuntime` also requires an
`effectFailureHandler` for terminal queue failures.

`createConfiguredBrowserDurableRuntime(...)` is an async wrapper that builds
the `providers` map from `config.indexedDb`, `config.filesystem`, and/or
`config.azure`, registering the `indexed-db`, `fs-path`, and `stores-proxy`
kinds that those configs enable.

### Queue processor helpers

- `createDurableQueueProcessor({ processNext, subscribe, onError? })` returns a
  processor with `start()`, `notify()`, `stop()`, and `isRunning`. It
  subscribes once on start, does no queue read until notified, runs at most one
  processing cycle at a time, and coalesces duplicate notifications.
- `createBrowserRuntimeQueueProcessor({ runtime, request, subscribe, onError?
  })` adapts a runtime's `processQueueLaneItem(...)` method to that processor
  contract.

### Core contracts and helpers

The root entry point also exports the runtime contracts and value types used by
those calls, including `DurableTransitionAdapter`, `DurableEffectHandler`,
`DurableEffectFailureHandler`, `DurableProvider`, `RuntimeRefs`,
`TransitionRefs`, `JournalEntry`, `RuntimeSnapshot`,
`RuntimeSnapshotChanges`, `TransitionSnapshot`, `TransitionCommit`,
`TransitionCommitResult`, `InitializeRuntimeResult`, `EngineWakeState`,
`QueueLeasedMessage`, `QueueProcessResult`,
`QueueNotificationSubscription`, `RuntimeSnapshotInvalidation`,
`applyRuntimeSnapshotChanges`, `parseRef`, `assertSameRefKind`, and
`createStorageRef`.

### Storage and transport subpaths

| Import | Verified exports |
|---|---|
| `@gik-ai/durable-runtime/storage/memory` | `createMemoryStorage`, `createMemoryStorageApi`, and `createMemoryStorageRef`. |
| `@gik-ai/durable-runtime/storage/indexed-db` | `createIndexedDbStorage` / `createIndexedDbProvider`, `createIndexedDbStorageApi`, `createIndexedDbStorageRef`, and the IndexedDB option types; this subpath also re-exports its `library` and `api` entry points. |
| `@gik-ai/durable-runtime/storage/filesystem` | `createFilesystemDurableStorage`, `FilesystemDurableStoragePrimitives`, and the filesystem library/API exports, including `createFilesystemStorageDispatcher` and `createFilesystemRef`. |
| `@gik-ai/durable-runtime/storage/cosmos` | Azure-side storage exports including `createCosmosTransitionStorage`, `createCosmosEffectsQueue`, `createCosmosEngineWakeStorage`, `createCosmosStorageLibrary`, and the `api`/`library` entry points used for remote storage and HTTP dispatch. |
| `@gik-ai/durable-runtime/connectors/browser-indexed-db` | `createBrowserIndexedDbConnector`, plus `createIndexedDbProvider` and the IndexedDB option types. |
| `@gik-ai/durable-runtime/connectors/filesystem-mcp` | `createFilesystemMcpConnector` / `createFilesystemMcpProvider`, `createFilesystemMcpSnapshotInvalidationSubscription`, and the MCP connector types/constants. |
| `@gik-ai/durable-runtime/connectors/azure-function` | `createAzureFunctionConnector` / `createAzureFunctionsProvider`, `createAzureSignalRSnapshotInvalidationSubscription`, and the Azure connector types/constants. |
| `@gik-ai/durable-runtime/server/transports/http` | `DurableRuntimeServerDependencies` plus the HTTP dispatch helpers for initialize, snapshot reads, transition acquire/commit/abort, journal append, engine wake reads/updates, and effect lease/ack/nack. |

## Package boundary

This package does not interpret Blueprint or Kernel semantics. The caller owns
the transition model and passes opaque declarative specifications to the
runtime. A transition uses one durable provider for its state, journal, and
effect queue; it never spans provider kinds.

## License

MIT
