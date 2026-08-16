# @gik/agentface

Agent-facing projection surface for the **Generative Interaction Kernel** — an allowlisted, agent-safe
projection over the shared face tool catalog. `agentface` is not a second engine; it applies the
agent-safe filter to that shared catalog and exposes authoring plus read-oriented tools (`getState` / `getTree`).

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

Mount the returned dispatcher over a transport selected by the host.

## Security boundary

`agentface` exposes an allowlisted projection; it is not a transport-level
security mechanism. The host remains responsible for authentication,
authorization, endpoint policy, and credential handling.

## License

MIT
