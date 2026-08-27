# @gik-ai/kernel

The embeddable **Generative Interaction Kernel**: it interprets a portable UI-intent document into a
running, reactive interface, delegating everything domain- and framework-specific to pluggable
providers. The kernel owns the invariants (grammar, validation, reduction) and is dependency-free.

```bash
npm install @gik-ai/kernel
```

```ts
import { Kernel, GIKClient, KernelTransportHost, InMemoryStateModel } from "@gik-ai/kernel";

// Own the runtime in process: one dispatch produces one revision.
const kernel = new Kernel(/* manifest, document */);
```

## When to use

- You want local runtime authority and deterministic execution in-process.
- You are connecting a remote renderer to an authoritative host over the GIK wire protocol
  (`GIKClient` + `KernelTransportHost`).

## Package boundary

The kernel owns document validation, state revisions, deterministic reduction,
effect declarations, snapshots, and compensation. Renderers, storage,
transports, domain components, and effect execution are supplied by other
packages or by the host application.

The TypeScript exports are the API authority. See the
[project documentation](https://github.com/nsreehari/generative-interaction-kernel/tree/master/docs)
for architecture, protocol, and compatibility contracts.

## Exported API

### Runtime classes

- `Kernel` is the main runtime class:
  - Constructor: `new Kernel(manifest: Enveloped<ExecutableVocabularyManifest>, document: Enveloped<ExecutableProgramDefinition>, opts?: KernelOptions)`
  - `KernelOptions` can supply custom `expression`, `predicateExpression`, `state`, `contexts`, `registry`, `orchestrator`, `sink`, `validate`, `admitProgramPatch`, and `executeGraphExtension`.
  - Core methods: `init()`, `dispatch(event)`, `syncExternal()`, `resolve()`, `whenIdle()`, `state()`, and `program()`.
  - Additional public methods: `hasProjection()`, `start()`, `publish()`, `publishSync()`, `mutate()`, `resume()`, `execution()`, `applyProgramPatch()`, `subscribePatches()`, `subscribeProgress()`, `cancelInvocation()`, `checkpoint()`, `restore()`, `effectsSince()`, `compensate()`, `baseline()`, and `snapshotPatch()`.
  - `resolve()` throws `ProjectionUnavailableError` when the current program has no `root`.
  - `publishSync()` requires `SyncJsonataExpressionProvider`.
- `GIKClient` is the renderer-side replica over a `TransportProvider`:
  - Constructor: `new GIKClient(transport: TransportProvider, options?: GIKClientOptions)`
  - Public methods: `start()`, `stop()`, `rebind()`, `getTree()`, `getRev()`, `get(path)`, `subscribe()`, `subscribeProgress()`, and `emit(node, name, payload?, actorId?)`.
- `KernelTransportHost` binds a `Kernel` to one or more `TransportProvider` connections:
  - Constructor: `new KernelTransportHost(manifest: Enveloped<ProjectedVocabularyManifest>, document: Enveloped<ExecutableProgramDefinition>, kernel: Kernel, defaultTransport?: TransportProvider)`
  - Public methods: `start()`, `attach()`, `detach()`, `stop()`, `dispatch()`, and `whenIdle()`.
- `TransportProvider` is the transport contract used by `GIKClient` and `KernelTransportHost`: `send(message)` and `subscribe(listener)`.
- `createInMemoryTransportPair()` returns a connected `[TransportProvider, TransportProvider]` pair for in-memory transport wiring.

### Program, vocabulary, and document contracts

- `ProgramDefinition` is the shared executable program shape. It can carry `vocabulary`, `graph`, `handlers`, `machines`, and `derivations`.
- `ExecutableProgramDefinition` is `ProjectedProgramDefinition | HeadlessProgramDefinition`.
  - `ProjectedProgramDefinition` adds `root: DocNode`.
  - `HeadlessProgramDefinition` has no `root`.
- `DocNode` is the authored projection node contract: `capability`, `id`, optional `props`, and optional `edges`.
- `ResolvedNode` is the resolved renderer-facing node contract: `capability`, `id`, `props`, `visible`, `fallback`, and `children`.
- `ExecutableVocabularyManifest` is `ProjectedVocabularyManifest | HeadlessVocabularyManifest`.
- `ProjectedVocabularyManifest` carries `version`, optional `expression`, `namespaces`, `contexts`, `actions`, a `capabilities` map, and optional `externals`.
- `CapabilityDescriptor` describes one capability's optional `propsSchema`, `emits`, `slots`, and `dataProp`.

### Validation and provider contracts

- `validateProgramMessage(message)` validates a program message and throws `ValidationError` on failure.
- `validateProgramDefinition(program, capabilities?)` validates authored node props against capability descriptors and throws `ValidationError` on failure.
- `ValidationError` extends `Error` and exposes the underlying `errors` value.
- `validateJsonValue(schema, value, label)` validates a value against a supplied JSON schema.
- `ExpressionProvider` defines `eval(expr, data, bindings?)`.
- `CapabilityRegistry` defines `has(type)` and `get(type)`.
- `VocabularyRegistry` implements `CapabilityRegistry` and also provides `VocabularyRegistry.fromVocabulary(manifest)`.
- `StateModel` defines `snapshot()`, `get(path)`, and `apply(ops)`. `InMemoryStateModel` and `CompositeStateModel` implement it.

### Authoring and protocol helpers

- Action authoring helpers: `assign`, `assignFrom`, `emit`, `invoke`, `route`, `request`, and `guarded`.
- Program authoring helpers: `node`, `projectedProgram`, `authorProjectedProgram`, `program`, `authorProgram`, `generateVocabulary`, and `lintVocabularyReferences`.
- Protocol helpers: `envelope(type, payload)` and `unwrap(message)`.

## License

MIT
