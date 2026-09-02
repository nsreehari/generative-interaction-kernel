# gik-controlface

Control-plane projection surface for the **Generative Interaction Kernel**. A `ControlFace` is a
host-side live object that wraps one kernel (plus its transport broker); `createControlFaceDispatcher`
exposes the control-plane projection over the shared face tool catalog (authoring + inspect + drive + time-travel).

```bash
npm install gik-controlface
```

```ts
import { ControlFace, createControlFaceDispatcher } from "gik-controlface";

const controlFace = new ControlFace(/* bundle */);
const dispatch = createControlFaceDispatcher(controlFace);
```

If you only need to lower a blueprint into vocabulary/program/state JSON, use the narrower subpath:

```ts
import { openBlueprint } from "gik-controlface/blueprint";

const runtime = openBlueprint(blueprint);
```

Mount the returned dispatcher over a transport chosen by the host, or expose
the narrower agent-safe projection with `gik-agentface`.

## Exported API

### Live runtime

- `ControlFace` is the host-side live runtime class exported from the package
  root.
  - Constructor:
    `new ControlFace(vocabulary: Enveloped<ProjectedVocabularyManifest>, program: Enveloped<ExecutableProgramDefinition>, options?: ControlFaceOptions)`.
  - `ControlFaceOptions` may supply `state`, `orchestrator`, `sink`,
    `serviceHost`, `blueprint`, and `externalContext`.
  - Transport method: `attach(transport, fromRev?)`.
  - Runtime methods: `emit(event)`, `getState()`, `getTree()`,
    `checkpoint()`, `restore(checkpoint)`, `effectsSince(rev)`, and
    `compensate(effects)`.
  - Blueprint-related methods: `getBlueprint()`, `getProgram()`,
    `inspectBlueprintStructureChange(request)`, and
    `reconfigureBlueprint(patch)`. `reconfigureBlueprint(patch)` returns a
    `BlueprintReconfigurationResult` with the accepted `blueprint`, and
    includes `programPatch` and `transition` only when executable structure
    changed.
  - Service-host methods: `describeServiceKinds()`,
    `listServiceRequests()`, and `probeService(serviceId)`. They use the
    optional `serviceHost` from `ControlFaceOptions`.
- `RuntimeFace` is the structural subset of `ControlFace` consumed by the
  exported tool-catalog helpers.

### Tool catalog and dispatcher

- `fullCatalogTools(face: RuntimeFace): McpTool[]` returns the shared full
  tool catalog: the authoring tools plus the live runtime tools.
- `controlFaceTools(face: RuntimeFace): McpTool[]` returns that full catalog
  unchanged.
- `createControlFaceDispatcher(face: RuntimeFace): McpDispatcher` wraps that
  catalog in an MCP dispatcher whose advertised server info is
  `{ name: "genui-controlface", version: "0.1" }`.
- `MCP_PROTOCOL_VERSION` is `"2025-06-18"`.
- `McpTool` is the tool contract: `name`, `description`, `inputSchema`,
  `handler`, and optional `agentSafe`.
- `McpDispatcher` exposes `tools`, `listTools()`, `callTool(name, args?)`, and
  `handleMcpMessage(message)`.
- `McpServerInfo` is the `{ name, version }` metadata shape used during MCP
  initialization.

### Service-host exports

- `QueueFace` is a thin wrapper over a supplied `ServiceHost`, with
  `submit(effect)`, `getRequest(id)`, `listRequests()`, and `cancel(id)`.
- `ServiceHost` is the host contract for service discovery, validation,
  invocation, queueing, request lookup, and cancellation.
- `DefaultServiceHost` is the default `ServiceHost` implementation exported by
  the package.
- `ServiceKindRegistry` registers service-kind factories, reports availability,
  validates declarations, and materializes adapters.
- `UnsatisfiedServiceDependencyError` reports a missing host-supplied
  dependency during service execution.
- The package also exports the service request and service-kind contracts used
  by those classes, including:
  - queue/service contracts: `ContractAssurance`,
    `ServiceCapabilityDescriptor`, `ServiceProviderDescriptor`,
    `ServiceCatalogSnapshot`, `ServiceRequestInput`, `ServiceRequest`,
    `ServiceValidationReport`, `ServiceProbeResult`,
    `ServiceSimulationResult`, `ServiceExecutionResult`, `ServiceAgentTool`,
    `ServiceAdapterContext`, `ServiceAdapter`, `ServiceExecutionMode`,
    `ServiceRequestStatus`, `ServiceRequestRecord`, `ServiceRequestStore`,
    `InMemoryServiceRequestStore`, `DefaultServiceHostOptions`, and
    `BlueprintServiceResolver`.
  - service-kind contracts: `ServiceExecutionSubjectKind`,
    `ServiceKindManifest`, `ServiceKindContext`, `ServiceDependency`,
    `ServiceKindFactory`, `ServiceKindDescription`,
    `BlueprintServiceIdentity`, and `serviceConfig(declaration)`.

## Security boundary

`controlface` exposes the complete privileged control surface. Do not give an
untrusted agent direct access to it. Capability policy belongs to the
projection; transports only carry already-authorized calls.

## License

MIT
