# gik

Batteries-included entry point for the **Generative Interaction Kernel (GIK)** — a generic platform
layer for generative, declarative UI. This meta-package has no code of its own; it re-exports the core
`gik-*` packages under stable namespaces so you can start from a single install.

```bash
npm install gik
```

```ts
import { kernel, react } from "gik";

const k = new kernel.Kernel(/* manifest, document */);
```

> For the leanest dependency graph in real projects, depend on the individual packages directly
> (`gik-kernel`, `gik-react`, `gik-agentface`, `gik-controlface`, `gik-transport-http-sse`,
> `gik-transport-mcp-http`).

## Re-exported namespaces

| Namespace | Package |
|---|---|
| `kernel` | `gik-kernel` |
| `react` | `gik-react` |
| `agentface` | `gik-agentface` |
| `controlface` | `gik-controlface` |
| `transportHttpSse` | `gik-transport-http-sse` |
| `transportMcpHttp` | `gik-transport-mcp-http` |

## Documentation

See the bundled consumer manual in [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html)
and the [project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
