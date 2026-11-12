# gik-react

React renderer and Blueprint hosts for the **Generative Interaction Kernel**. Both hosts append
interaction and effect outcomes to a journal, render committed snapshots, and keep execution outside
React in a placement-neutral Blueprint worker.

```bash
npm install gik-react react react-dom @fluentui/react-components
```

```tsx
import { BlueprintHost } from "gik-react";

export const App = () => <BlueprintHost blueprint={blueprint} native={native} />;
```

The root host uses an ephemeral in-memory provider. `emit()` is asynchronous and returns the currently
committed tree; later commits arrive through the source subscription.

For persistent or remotely executed hosting:

```tsx
import { BlueprintHost, createNativeBlueprintWorker } from "gik-react/durable";

const worker = createNativeBlueprintWorker({ blueprint, runtime, native });

export const App = () => (
	<BlueprintHost blueprint={blueprint} runtime={runtime} worker={worker} native={native} />
);
```

Omit `worker` when middleware, a backend, or an Azure Function owns execution. Existing
`gik-blueprint-host` consumers should migrate to `BlueprintHost` from `gik-react`.

## Presentation-local effects and state

Component-internal interaction stays inside the component and requires no named effect. Host-local
state is useful when an interaction coordinates **different components** without changing application
semantics: hovering over a finding in a report sets attention on its corresponding file. A separate
file list projects that attention as highlighting. Leaving the finding or unmounting its source
clears the attention it owns. Neither interaction needs a named highlight effect or Blueprint transition.

For this example, the Blueprint's `report` and `files` Cells attach their `primary` views to the
`report` and `files` slots. Their capabilities are `ui:report` and `ui:files`, with
`runtime.externals.projectionViews.ui` importing `{ from: "self", use: ["report", "files"] }`.
The host supplies the two projection components and their coordination:

```tsx
import { useState } from "react";
import { BlueprintHost, PresentationHost, type ProjectionView } from "gik-react";

const files = [
  { id: "ledger", name: "ledger.csv" },
  { id: "receipts", name: "receipts.csv" },
];

const Report: ProjectionView = ({ emit }) => (
  <ul>
    {files.map((file) => (
      <li key={file.id}
        onMouseEnter={() => void emit("fileHover", { fileId: file.id })}
        onMouseLeave={() => void emit("fileLeave")}>
        Finding referencing {file.name}
      </li>
    ))}
  </ul>
);

const FileList: ProjectionView = ({ node }) => (
  <ul>
    {files.map((file) => (
      <li key={file.id}
        style={{ backgroundColor: node.props.highlightedFileId === file.id ? "yellow" : undefined }}>
        {file.name}
      </li>
    ))}
  </ul>
);

const native = { projectionViews: { report: Report, files: FileList } };

export function ReportWorkspace() {
  const [presentationHost] = useState(() => {
    return new PresentationHost({
      attention: ["related-file"],
      bindings: {
        "ui:report": {
          on: {
            fileHover: { attention: { channel: "related-file", set: { from: "fileId" } } },
            fileLeave: { attention: { channel: "related-file", clear: true } },
          },
        },
        "ui:files": {
          props: { highlightedFileId: { attention: "related-file" } },
        },
      },
    });
  });
  return <BlueprintHost blueprint={blueprint} native={native} presentationHost={presentationHost} />;
}
```

The report emits interaction intent; it never reaches into the file-list component. The rendering
host owns the attention channel. `set.from` selects an own field of the emitted JSON payload, not a
Kernel expression or state path. The file list chooses how to render its attention-bound prop; GIK
defines no report, file, or highlighting domain.

Create one presentation host per mounted Blueprint instance, never a server-process singleton.
Attention uses last-writer ownership: clearing or unmounting another source cannot clear the current
owner's value. Releasing the current owner clears the channel rather than restoring an earlier value.
Host code can also call `setAttention(channel, owner, value)`, `clearAttention(channel, owner)`, and
`release(owner)`; it owns cleanup for these non-component owners.

Use the same `presentationHost` prop on `BlueprintProvider` or on either host/provider from
`gik-react/durable`. It runs where the UI renders, even when an Azure Function or another remote
worker executes the Blueprint. No local UI effect is appended to the Blueprint journal or worker
effects queue. This is separate from `native.effectHandlers`, which execute semantic effects with
the Blueprint worker.

Bindings select capabilities, including their wrappers and multiple slot instances, rather than
generated node ids. Attention ownership still belongs to the individual source node. Every projection
view also receives an optional `hostState.attention` snapshot; changes rerender presentation without
changing the materialized program or Blueprint state. This is transient coordination, not an arbitrary
application-state bag, and is not automatically persisted. Other host application state stays with the
host's own state management.

### Host effect providers

Operations outside component-local interaction and attention coordination use declared providers.
The host explicitly admits a subset of a provider's effects. Parsing and authorization are mandatory
before its handler runs:

```tsx
import { definePresentationEffect, PresentationHost } from "gik-react";

const fileProvider = {
  id: "files",
  effects: {
    open: definePresentationEffect({
      parseInput(payload) {
        if (typeof payload.fileId !== "string") throw new Error("Expected fileId");
        return { fileId: payload.fileId };
      },
      authorize(context, input) {
        // Host policy must check real authority, not trust a caller-supplied actor id.
        return fileAccess.canOpen(context.actorId, input.fileId);
      },
      async handle(_context, input) {
        await fileAccess.open(input.fileId);
      },
    }),
  },
};

const presentationHost = new PresentationHost({
  effects: { files: ["open"] },
  bindings: { "ui:files": { on: { openRequested: { effect: "files:open" } } } },
});
const unregister = presentationHost.registerProvider(fileProvider);
// The provider owner calls unregister() at the end of its registration lifetime.
```

`fileAccess` above is supplied by the application, not GIK. Provider ids/effect names are declared by
trusted provider modules; no component/effect list is built into GIK. Registration rejects duplicate
providers and admissions for undeclared operations, and returns an idempotent unregister function.
Nothing is admitted by default. An unadmitted effect, missing provider, invalid input, denied
authorization, or handler failure rejects explicitly. Presentation handlers do not receive a Blueprint
store or semantic invocation/settlement context and cannot return semantic results. They are distinct
from the existing worker-side `EffectHandler` contract.

Explicitly forward a presentation event to an existing semantic ingress with
`on: { openFile: { event: { node: "files--primary--in-files", name: "selectFile" } } }`.
The original payload and actor identity are retained, and the receiving Cell's existing
event/payload validation still applies. Never use presentation state as evidence that semantic
approval or a request settlement has occurred.

Unbound events retain the existing controller route; wrappers do **not** inherit Cell handlers or
gain event ownership entries. Attention and host-effect bindings consume the interaction rather than
also dispatching it to a Cell. Only trusted host code supplies bindings, provider registrations,
admission, parsers, and authorization policy; none are Blueprint-authored executable handlers.

Each nested Blueprint host resets the presentation-host scope, even when no presentation host is
supplied. Companion organisms can supply their own `presentationHost`; they never inherit the primary
organism's bindings or state. All regions of one provider share its explicitly supplied instance.
For direct `GenUIRoot`/`renderNode` integration, wrap the tree in
`<PresentationHostProvider host={presentationHost}>`.

## Multi-region hosting

`BlueprintHost` mounts a Blueprint's whole presentation at one React location. When an application
shell needs to place parts of one live Blueprint in different places, use `BlueprintProvider` plus one
`BlueprintRegion` per exported region:

```tsx
import { BlueprintProvider, BlueprintRegion } from "gik-react";

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
controller, state, journal, effects, and lifecycle. Events not consumed by an explicit presentation-host
effect binding are dispatched through that shared controller. Mounting a region is placement only —
it never instantiates a second host or controller. `externalContext` therefore belongs on the provider,
never on a region; changing it
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
import { BlueprintProvider, BlueprintRegion, createNativeBlueprintWorker } from "gik-react/durable";
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

## Purpose and observation hosting

DPP Cells use the same hosts as ordinary Cells. React renders their committed
outputs; the manifest is not a React provider or a special component type.
Read Cell source values through `fetched_sources` in authored expressions.

Declaring a Sense or mounting `BlueprintHost` does not by itself establish an
observer. The execution host must reconcile committed bindings, use authorized
service adapters, journal observations, report failures, and close bindings.
See [Cell Senses](https://github.com/nsreehari/generative-interaction-kernel/blob/master/docs/senses.md)
and [Purpose-bearing Cells](https://github.com/nsreehari/generative-interaction-kernel/blob/master/docs/dpp.md).
Components remain presentation leaves; they do not own durable timers or
participant authority.

## Public entry points

| Import | Purpose |
|---|---|
| `gik-react` | React rendering and ephemeral in-memory Blueprint hosting |
| `gik-react/durable` | Durable or remotely executed Blueprint hosting |

## Exported API

### `gik-react`

`gik-react` exports the in-memory `BlueprintHost`, `BlueprintHostProps`, `BlueprintController`,
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

Registry and capability helpers exported from `gik-react`:

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

### `gik-react/durable`

`gik-react/durable` exports a durable `BlueprintHost`, its `BlueprintHostProps` type, a durable
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
