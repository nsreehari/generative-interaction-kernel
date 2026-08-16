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

See the [project documentation](https://github.com/nsreehari/generative-interaction-kernel/tree/master/docs)
for architecture and protocol contracts.

## License

MIT
