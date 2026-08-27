# gik

Batteries-included entry point for the **Generative Interaction Kernel (GIK)** — a generic platform
layer for generative, declarative UI. This meta-package has no code of its own; it re-exports the core
`@gik-ai/*` packages under stable namespaces so you can start from a single install.

```bash
npm install gik
```

```ts
import { kernel, react } from "gik";

const k = new kernel.Kernel(/* manifest, document */);
```

> For the leanest dependency graph in real projects, depend on the individual packages directly
> (`@gik-ai/kernel`, `@gik-ai/react`, `@gik-ai/agentface`, `@gik-ai/controlface`, `@gik-ai/transport-http-sse`,
> `@gik-ai/transport-mcp-http`).

## Re-exported namespaces

| Namespace | Package |
|---|---|
| `kernel` | `@gik-ai/kernel` |
| `react` | `@gik-ai/react` |
| `agentface` | `@gik-ai/agentface` |
| `controlface` | `@gik-ai/controlface` |
| `transportHttpSse` | `@gik-ai/transport-http-sse` |
| `transportMcpHttp` | `@gik-ai/transport-mcp-http` |

## Documentation

See the bundled consumer manual in [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html)
and the [project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
