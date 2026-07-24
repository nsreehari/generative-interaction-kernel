# @gik/controlface

Control-plane projection surface for the **Generative Interaction Kernel**. A `ControlFace` is a
host-side live object that wraps one kernel (plus its transport broker); `createControlFaceDispatcher`
exposes the control-plane projection over the shared face tool catalog (authoring + inspect + drive + time-travel).

```bash
npm install @gik/controlface
```

```ts
import { ControlFace, createControlFaceDispatcher } from "@gik/controlface";

const controlFace = new ControlFace(/* bundle */);
const dispatch = createControlFaceDispatcher(controlFace);
```

If you only need to lower a blueprint into vocabulary/program/state JSON, use the narrower subpath:

```ts
import { openBlueprint } from "@gik/controlface/blueprint";

const runtime = openBlueprint(blueprint);
```

Mount the returned dispatcher over a transport such as [`@gik/transport-mcp-http`](https://www.npmjs.com/package/@gik/transport-mcp-http),
or expose the agent-safe projection with [`@gik/agentface`](https://www.npmjs.com/package/@gik/agentface).

## Documentation

See [`docs/GIK-public-interface.html`](./docs/GIK-public-interface.html) and the
[project repository](https://github.com/nsreehari/generative-interaction-kernel).

## License

MIT
