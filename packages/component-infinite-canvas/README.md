# @gik/component-infinite-canvas

Infinite pan/zoom canvas React component (xyflow-based) for **Generative Interaction Kernel** React
surfaces. Renders node/graph layouts and is used internally by [`@gik/react`](https://www.npmjs.com/package/@gik/react).

```bash
npm install @gik/component-infinite-canvas react react-dom
```

```tsx
import { InfiniteCanvas, type InfiniteCanvasProps } from "@gik/component-infinite-canvas";

export const Board = (props: InfiniteCanvasProps) => <InfiniteCanvas {...props} />;
```

## Peer dependencies

`react` and `react-dom` are peer dependencies you provide.

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) and the
[project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
