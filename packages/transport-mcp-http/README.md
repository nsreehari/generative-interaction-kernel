# gik-transport-mcp-http

Private workspace MCP/JSON-RPC over HTTP transport for **Generative Interaction Kernel** projections. It
carries a chosen projection's tool dispatcher (`controlface` or `agentface`) to MCP clients such as
agents and Copilot; it never decides capability policy.

This package is not published by the core release workflow. Use it within the
workspace; do not assume a same-named npm package is this implementation.

```ts
import { McpHttpServer } from "gik-transport-mcp-http";
import { createAgentFaceDispatcher } from "gik-agentface";

const dispatcher = createAgentFaceDispatcher(controlFace);
const server = new McpHttpServer({
  handler: (message) => dispatcher.handleMcpMessage(message),
});
```

## Documentation

`server.handle(req, res)` returns whether the request matched its route
(`/mcp` by default), allowing the host to fall through to other routes.
The host must supply authentication, origin/endpoint policy, and authorization
before exposing the handler. This thin JSON-RPC binding is not the samples'
stateful MCP SDK server or a Sense observation transport.

See the [AgentFace](../agentface/README.md) and
[ControlFace](../controlface/README.md) guides for projection selection, or the
[samples companion](https://github.com/nsreehari/gik-samples/tree/main/packages/mcp-server)
for the SDK-backed local server.

## License

MIT
