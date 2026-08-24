# @gik/react

React renderer and Blueprint hosts for the **Generative Interaction Kernel**. Both hosts append
interaction and effect outcomes to a journal, render committed snapshots, and keep execution outside
React in a placement-neutral Blueprint worker.

```bash
npm install @gik/react react react-dom @fluentui/react-components
```

```tsx
import { BlueprintHost } from "@gik/react";

export const App = () => <BlueprintHost blueprint={blueprint} native={native} />;
```

The root host uses an ephemeral in-memory provider. `emit()` is asynchronous and returns the currently
committed tree; later commits arrive through the source subscription.

For persistent or remotely executed hosting:

```tsx
import { BlueprintHost, createNativeBlueprintWorker } from "@gik/react/durable";

const worker = createNativeBlueprintWorker({ blueprint, runtime, native });

export const App = () => (
	<BlueprintHost blueprint={blueprint} runtime={runtime} worker={worker} native={native} />
);
```

Omit `worker` when middleware, a backend, or an Azure Function owns execution. Existing
`@gik/blueprint-host` consumers should migrate to `BlueprintHost` from `@gik/react`.

## Multi-region hosting

`BlueprintHost` mounts a Blueprint's whole presentation at one React location. When an application
shell needs to place parts of one live Blueprint in different places, use `BlueprintProvider` plus one
`BlueprintRegion` per exported region:

```tsx
import { BlueprintProvider, BlueprintRegion } from "@gik/react";

export const App = () => (
	<BlueprintProvider blueprint={blueprint} native={native} externalContext={externalContext}>
		<AppShell>
			<AppShell.CommandBar><BlueprintRegion name="command-bar" /></AppShell.CommandBar>
			<AppShell.Sidebar><BlueprintRegion name="sidebar" /></AppShell.Sidebar>
			<AppShell.Main><BlueprintRegion name="primary" /></AppShell.Main>
		</AppShell>
	</BlueprintProvider>
);
```

A **slot** is internal Blueprint-owned topology; an **exported region** is the explicit contract a host
may address. The Blueprint owns which regions exist, what attaches to them, and which are `required`;
the host owns placement, layout, and whether it mounts an optional region at all. A host can never
address an arbitrary internal slot.

One provider runs exactly one Blueprint: every region below it shares the same materialization,
controller, state, journal, effects, and lifecycle, and every event a region emits is dispatched through
that shared controller. Mounting a region is placement only — it never instantiates a second host or
controller. `externalContext` therefore belongs on the provider, never on a region; changing it
re-materializes with the same semantics `BlueprintHost` already has and republishes the region set of
the newly selected terminal representation.

Rules the host can rely on:

- `useBlueprintRegions()` returns the exported regions (`name`, `slot`, `required`, `description`) of
  the currently materialized Blueprint.
- An unknown region name, a region mounted twice, or a region mounted outside a provider throws
  `BlueprintRegionError` with an actionable message.
- An optional region that is not mounted never instantiates its projection views.
- A `required` region left unmounted reports a development diagnostic — `console.warn` by default, or
  the provider's `onMissingRequiredRegions(regions, message)` callback when supplied.
- Nested hosted Blueprints keep their own presentation: a child renders entirely inside the parent
  region that hosts it and never contributes regions to the parent's exported set.

The durable entrypoint exports the same pair, so region semantics are identical over a durable runtime:

```tsx
import { BlueprintProvider, BlueprintRegion, createNativeBlueprintWorker } from "@gik/react/durable";
```

## Nested Blueprint hosting

Pass a `BlueprintHostRegistry` when a parent uses `host:hosted-blueprint`. The registry synchronously
resolves trusted artifacts for assembly and resolves the executable definition at mount, including
host-owned native projections, effects, and service composition. Browser-authored JSON never supplies
native code.

Each child mounts at its parent Cell position with a separate controller. The durable host derives a
stable child runtime ID and separate state, journal, and effects-queue references from the parent
instance and Cell identity, while reusing the configured durable provider.

## Peer dependencies

`react`, `react-dom`, and `@fluentui/react-components` are peer dependencies you provide.

## Public entry points

| Import | Purpose |
|---|---|
| `@gik/react` | React rendering and ephemeral in-memory Blueprint hosting |
| `@gik/react/durable` | Durable or remotely executed Blueprint hosting |

## Exported API

### `@gik/react`

`@gik/react` exports the in-memory `BlueprintHost`, `BlueprintHostProps`, `BlueprintController`,
`BlueprintControllerOptions`, and the registry helpers used to resolve imported projection views and
capability descriptors.
The root entrypoint also re-exports the package's broader rendering and composition modules; the
items below are the Blueprint-hosting and capability-resolution exports most consumers import
directly.

`BlueprintHostProps` includes:

- required: `blueprint`
- optional composition inputs: `resolveLeavesProvider`, `resolveCapabilityDescriptors`, `native`,
  `companions`, `contexts`, `fileServices`, `primaryBridge`, `primaryInstanceId`, `className`,
  `style`, `externalContext`
- optional host-specific inputs: `context` (deprecated initial-state seed compatibility),
  `onTransition`, `blueprintRegistry`, `renderHostedBlueprintLoading`

`BlueprintProvider` accepts every `BlueprintHostProps` input except the single-root-only `className`,
`style`, and `companions`, and adds `children` plus optional `onMissingRequiredRegions`. `BlueprintRegion`
takes one prop, `name`; it deliberately accepts no `externalContext` of its own. `useBlueprintRegions()`
returns `readonly ExportedPresentationRegion[]`, and `BlueprintRegionError` is the error class thrown for
unknown names, duplicate mounts, and mounts placed outside a provider.

`BlueprintController` is constructed as `new BlueprintController(blueprint, options?)`. The exported
`BlueprintControllerOptions` type includes `externalContext`, `materializedBlueprint`, `context`
(deprecated), `contexts`, `native`, `onTransition`, and `resolveCapabilityDescriptors`. The class
exposes a readonly `worker` plus `getTree()`, `getState()`, `subscribe()`, `start()`, `emit()`,
`resync()`, `settle()`, and `stop()`.

Registry and capability helpers exported from `@gik/react`:

- `splitCapabilityRef(ref)` parses an `alias:name` capability reference and returns `{ alias, name }`
  or `null`
- `buildRegistryFromImports(imports, resolveProvider, fallback)` builds a `ComponentRegistry` from
  imported projection-view providers and respects import `use` allowlists
- `buildCapabilityCatalogFromImports(imports, resolveDescriptors)` builds a flat
  `alias:name -> CapabilityDescriptor` catalog from imported projection-view descriptors
- `buildCapabilityCatalogFromExternals(externals, resolveDescriptors)` does the same starting from
  `runtime.externals.projectionViews`
- `ProviderResolver` resolves a provider name to a projection-view map
- `CapabilityDescriptorResolver` resolves a provider name to a capability-descriptor map

### `@gik/react/durable`

`@gik/react/durable` exports a durable `BlueprintHost`, its `BlueprintHostProps` type, a durable
`BlueprintProvider` with its `BlueprintProviderProps` type, and `createNativeBlueprintWorker`.
`BlueprintRegion` and `useBlueprintRegions` are shared with the root entrypoint and work identically
under either provider.

The durable `BlueprintHostProps` type extends the root host props and adds:

- required: `runtime`
- optional: `worker`, `materializedBlueprint`

`runtime` is a `DurableBlueprintRuntimeOptions` value with `runtimeId`, `providers`, and `refs`.
`worker` is optional; when present, the durable host starts it on mount and stops it on unmount.

`createNativeBlueprintWorker({ blueprint, runtime, native, ... })` creates a `BlueprintWorker` for
the durable entrypoint. Its options also accept `externalContext`, `materializedBlueprint`,
`contexts`, `subscribe`, and `onError`.

See the [project documentation](https://github.com/nsreehari/generative-interaction-kernel/tree/master/docs)
for architecture and protocol contracts.

## License

MIT
