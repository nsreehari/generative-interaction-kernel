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

Mount the returned dispatcher over a transport chosen by the host, or expose
the narrower agent-safe projection with `@gik/agentface`.

## Security boundary

`controlface` exposes the complete privileged control surface. Do not give an
untrusted agent direct access to it. Capability policy belongs to the
projection; transports only carry already-authorized calls.

## License

MIT
