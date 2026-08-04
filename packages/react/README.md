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

## Peer dependencies

`react`, `react-dom`, and `@fluentui/react-components` are peer dependencies you provide.

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) and the
[project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
