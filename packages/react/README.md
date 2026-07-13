# @gik/react

React renderer and `<BundleHost>` adapter for the **Generative Interaction Kernel**. It paints a
resolved node tree from a GIK bundle (manifest + document + state) and routes interaction events back
into the kernel loop.

```bash
npm install @gik/react react react-dom @fluentui/react-components
```

```tsx
import { BundleHost, bundleFromJson } from "@gik/react";

const bundle = bundleFromJson(json, native);
export const App = () => <BundleHost bundle={bundle} />;
```

## Peer dependencies

`react`, `react-dom`, and `@fluentui/react-components` are peer dependencies you provide.

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) and the
[project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
