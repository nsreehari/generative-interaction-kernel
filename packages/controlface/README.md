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
    `listServiceRequests()`, `probeService(serviceId, context?)`, and
    `testSmoke(effect, context?)`. They use the
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

Import `gik-controlface/services` for service infrastructure without the root
tool catalogs. It also exports `createIntervalTimerServiceKind`,
`createContextStoreServiceKind`, context-store schemas, contract constants,
and request/record types. The context-store kind dispatches to a host-supplied
executor; it does not choose a database or authorize a store merely from its
`storeRef` or `scope`.

`DefaultServiceHost.observe` applies service request transformation,
validation, and authorization to Sense establishment and deliveries. The host
must wire those observations through Blueprint reconciliation and durable
journal ingress; this is separate from bounded `invoke` calls.

### Probes And Smoke Tests

Kinds advertise `supports.probe` and `supports.testSmoke` independently.
`adapter.probe(context)` checks readiness without executing business operations.
An absent probe returns `{ ok: false, detail: { supported: false,
code: "not-supported" } }`, never a successful connection check.

`adapter.testSmoke(request, context)` exercises real provider behavior. For
example, a Gmail send smoke test sends an actual sample email supplied by the
caller. Hosts invoke `testSmoke(effect, context?)` explicitly from settings or
diagnostic tooling, using the normal declared service/operation and sample input.
This method does not run during discovery or setup inspection.

Smoke tests use the same request transformations, host authorization snapshots,
live execution checks, request store and cancellation as normal execution.
Authorization receives `request.purpose: "smoke-test"` and the actual sample input.
The host runs one immediate attempt, even for queued or Sense declarations.
It does not apply business-response settlements, transforms or guardrail retries
to diagnostic results. An unsupported adapter returns `ok: false` with
`detail.supported: false`; it never falls back to `execute()`.
Failures retain request status, error details (including uncertain-write codes)
and authorization decisions. Inspect request records to cancel in-flight work.
Providers return non-secret receipts in `detail`, not credentials or business
records. The method is a host API, not an automatically exposed agent tool.

- `QueueFace` is a thin wrapper over a supplied `ServiceHost`, with
  `submit(effect)`, `getRequest(id)`, `listRequests()`, and `cancel(id)`.
- `ServiceHost` is the host contract for service discovery, validation,
  invocation, queueing, request lookup, and cancellation.
- `DefaultServiceHost` is the default `ServiceHost` implementation exported by
  the package.
- `ServiceKindRegistry` registers service-kind factories, reports availability,
  validates declarations, describes per-service setup, and materializes adapters.
- `UnsatisfiedServiceDependencyError` reports a missing host-supplied
  dependency during service execution, optionally including a non-secret
  `dependencyStatus` with host-provided setup actions.
- Providers may implement `describeDependencies(declaration)`. Hosts supply
  `inspectDependency(requirement, identity)` as a synchronous readiness snapshot.
  `ServiceKindRegistry.describeSetup(identity, declaration)` and
  `DefaultServiceHost.describeServiceSetup(serviceId)` report requirements without
  creating adapters, resolving credentials, or starting interactive authorization.
  See [provider setup and host dependencies](../../docs/service-provider-setup.md)
  for browser and headless integration.
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
    `BlueprintServiceIdentity`, `ServiceDependencyRequirement`,
    `ServiceDependencyStatus`, `ServiceDependencyDescription`,
    `ServiceSetupAction`, `ServiceSetupReport`, `inspectServiceDependency`,
    `requireServiceDependency`, and `serviceConfig(declaration)`.

## Security boundary

`controlface` exposes the complete privileged control surface. Do not give an
untrusted agent direct access to it. Capability policy belongs to the
projection; transports only carry already-authorized calls.

## License

MIT
