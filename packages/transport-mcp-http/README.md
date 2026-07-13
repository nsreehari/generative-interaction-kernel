# @gik/transport-mcp-http

Model Context Protocol (MCP) over HTTP transport for **Generative Interaction Kernel** projections. It
carries a chosen projection's tool dispatcher (`controlface` or `agentface`) to MCP clients such as
agents and Copilot; it never decides capability policy.

```bash
npm install @gik/transport-mcp-http
```

```ts
import { McpHttpServer } from "@gik/transport-mcp-http";
import { createAgentFaceDispatcher } from "@gik/agentface";

const server = new McpHttpServer(createAgentFaceDispatcher(controlFace));
```

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) and the
[project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
