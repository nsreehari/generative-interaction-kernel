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

### Host Composition And Setup

`gik-controlface/services` also supplies:

- `createServiceOrchestrator({ host, declarations, state, fallback })`: routes
  declared service identities through the existing queued Cell source pipeline.
  Other effects use the explicitly supplied fallback, or fail when none exists.
- `createServiceSetupController({ blueprintId, blueprintRevision, declarations,
  registry, configurations?, actions? })`: reports native service configuration,
  provider schemas and dependency readiness without materializing adapters.
  `validate()` checks configurations; `action()` rechecks the current report,
  validates action input and invokes only a host-registered handler. Inspection
  never starts setup or acquires credentials.
- `openServiceSettings({ provider, refs, runtimeId, validate })`: stores bounded
  non-secret scalar configuration through native durable leases/transitions.
  `save(id, config, expectedGeneration)` stages; `apply(expectedGeneration)`
  explicitly activates all staged settings. Concurrent/stale changes fail.
  The required host validator admits known services/fields and provider schemas.
  It must reject secrets and fields the user is not allowed to edit.
- `configuredServiceDeclarations`: clones runtime declarations and overlays
  configuration without mutating the authored Blueprint.

An uncertain settings commit surfaces `SERVICE_SETTINGS_UNCERTAIN` and blocks
further changes in that store instance. `read()` inspects its receipt; a confirmed
receipt clears that latch. An absent receipt is not evidence that replay is safe.
Hosts must retain their cross-session uncertain-outcome handling, scope refs/runtime
identity to the authenticated workspace, and reconcile active configuration after
reconnection. Persisting Apply does not itself restart a runtime.

### Isolated Browser Capability Channels

`gik-controlface/browser` has no React dependency or network client:

- `createCapabilityChannel(port, handler, options?)`: bidirectional bounded JSON
  requests/results, cancellation, timeouts, explicit closure and configurable
  primitive error fields (`code` and `status` by default). Limits measure UTF-8
  wire-message bytes. It never retries operations.
- `openIsolatedCapabilityFrame(handler, { source, protocol, ...options })`: loads
  a hidden host-owned same-origin HTTP resource in an opaque-origin,
  `sandbox="allow-scripts"` frame and transfers one private MessagePort.
- `acceptCapabilityPort(event, { source, origin, protocol })`: checks the child
  handshake against trusted host-supplied identity. The child must accept once,
  bind cleanup to its lifetime, and reject later handshakes.

Hosts supply trusted URLs/protocols, strict CSP, action/operation allowlists,
credential handling, authorization and binding rechecks. Frame isolation does
not itself disable network access: the served child resource must carry the
appropriate CSP. Aborting a request stops waiting and signals the handler; it
does not undo a mutation or establish that a failed reply means nothing happened.
Inspect uncertain operations rather than retrying them. Do not forward secrets,
stack traces or financial payloads as error metadata.

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
