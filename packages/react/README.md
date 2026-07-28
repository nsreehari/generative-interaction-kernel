# @gik/react

React renderer and in-memory Blueprint host for the **Generative Interaction Kernel**. `BlueprintHost`
owns React-local state, routes interaction events through `@gik/blueprint` `runTransition`, and renders
the resulting Kernel program. Bundle APIs remain lower-level composition and compatibility primitives.

```bash
npm install @gik/react react react-dom @fluentui/react-components
```

```tsx
import { BlueprintHost } from "@gik/react";

export const App = () => <BlueprintHost blueprint={blueprint} native={native} />;
```

## Peer dependencies

`react`, `react-dom`, and `@fluentui/react-components` are peer dependencies you provide.

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) and the
[project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
