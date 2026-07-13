# @gik/agentface

Agent-facing projection surface for the **Generative Interaction Kernel** — an allowlisted, agent-safe
subset of the control-plane tool catalog. `agentface` is not a second engine; it is `controlface`
filtered down to authoring plus read-oriented tools (`getState` / `getTree`).

```bash
npm install @gik/agentface
```

```ts
import { createAgentFaceDispatcher, createStatelessAgentFaceDispatcher } from "@gik/agentface";

// Live, bounded surface over a running ControlFace:
const dispatch = createAgentFaceDispatcher(controlFace);

// Authoring/validation tools only, no runtime attached:
const authoringOnly = createStatelessAgentFaceDispatcher();
```

Mount the returned dispatcher over a transport such as [`@gik/transport-mcp-http`](https://www.npmjs.com/package/@gik/transport-mcp-http).

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) and the
[project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
