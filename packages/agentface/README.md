# @gik-ai/agentface

Agent-facing projection surface for the **Generative Interaction Kernel** — an allowlisted, agent-safe
projection over the shared face tool catalog. `agentface` is not a second engine; it applies the
agent-safe filter to that shared catalog and exposes authoring plus read-oriented tools (`getState` / `getTree`).

```bash
npm install @gik-ai/agentface
```

```ts
import { createAgentFaceDispatcher, createStatelessAgentFaceDispatcher } from "@gik-ai/agentface";

// Live, bounded surface over a running ControlFace:
const dispatch = createAgentFaceDispatcher(controlFace);

// Authoring/validation tools only, no runtime attached:
const authoringOnly = createStatelessAgentFaceDispatcher();
```

Mount the returned dispatcher over a transport selected by the host.

## Exported API

`@gik-ai/agentface` exports the following public surface from `packages/agentface/src/index.ts`.
The live helpers are declared with `face: RuntimeFace`; that type comes from
`@gik-ai/controlface` and is not re-exported from this package.

### Functions

- `agentFaceProjection(face): McpTool[]` returns the tools from the shared catalog whose
  `agentSafe` flag is `true`.
- `createAgentFaceDispatcher(face): McpDispatcher` builds an `McpDispatcher` over that
  filtered tool list and identifies itself as `{ name: "genui-agentface", version: "0.1" }`.
- `createStatelessAgentFaceDispatcher(extraTools?: McpTool[]): McpDispatcher` builds a
  dispatcher from the built-in pure authoring tools plus any supplied `extraTools`, then
  filters the combined list by `agentSafe`.

### Constants and types

- `AGENTFACE_ALLOWLIST` is a `ReadonlySet<string>` containing the built-in agent-safe tool
  names: `describeCatalog`, `namespaces`, `effects`, `validateDocument`, `lintDocument`,
  `authorProjectedProgram`, `validateCapability`, `getState`, `getTree`, and
  `describeServiceKinds`.
- `MCP_PROTOCOL_VERSION` is `"2025-06-18"`.
- `McpTool` describes one callable tool with `name`, `description`, `inputSchema`,
  `handler(args)`, and optional `agentSafe`.
- `McpDispatcher` exposes `tools`, `listTools()`, `callTool(name, args?)`, and
  `handleMcpMessage(message)`. Its JSON-RPC handler supports `initialize`, `tools/list`,
  and `tools/call`.
- `McpServerInfo` is the `{ name, version }` pair used in the `initialize` response.

## Security boundary

`agentface` exposes an allowlisted projection; it is not a transport-level
security mechanism. The host remains responsible for authentication,
authorization, endpoint policy, and credential handling.

## License

MIT
