# gik

Private workspace namespace aggregator for the **Generative Interaction Kernel (GIK)** — a generic platform
layer for generative, declarative UI. This meta-package has no code of its own; it re-exports the core
`gik-*` packages under stable namespaces so you can start from a single install.

This package is not published by the core release workflow. The example below
is for workspace composition; public consumers should install individual
packages from the [package map](../../README.md#choose-a-package).

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
| `evaluators` | `gik-evaluators` |
| `react` | `gik-react` |
| `agentface` | `gik-agentface` |
| `controlface` | `gik-controlface` |
| `transportHttpSse` | `gik-transport-http-sse` |
| `transportMcpHttp` | `gik-transport-mcp-http` |

## Documentation

This namespace wrapper does not re-export `gik-blueprint`, the agent lifecycle,
or the Blueprint proposal host. Import those packages explicitly for DPP,
Sense reconciliation, and governed proposal workflows. There is no bundled
HTML manual; the owning package READMEs and [documentation guide](../../docs/README.md)
are the maintained references.

## License

MIT
