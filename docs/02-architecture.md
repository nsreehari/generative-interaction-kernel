# 02 — Architecture

The kernel is a **pure interpreter + pure reducer**. It holds no domain knowledge, no framework
knowledge, no time, and no memory. Statefulness is achieved by putting state in data and reducing
over it — never by the kernel holding it.

## The closed / open boundary

The single organizing principle:

- **Closed (kernel):** the *shape* of nodes, edges, actions, and machines. Fixed for every
  platform instance, interpreted identically everywhere.
- **Open (providers):** the *vocabulary* — which capabilities/events/actions/namespaces exist,
  which expression language, which framework, which model. Supplied per instance.

Providers extend **vocabulary**, never **shape**. This is what keeps documents portable and the
interpreter, validator, and tool-generator reusable.

## Generic object model (the closed core)

| Primitive | Definition |
|---|---|
| **Document** | a tree of Nodes, optional Machines, bound to a Store |
| **Node** | `{ capability, id, props, edges }` — a unit of UI intent |
| **Capability** | a registered type: `{ propsSchema, emits[events], renderAdapter }` |
| **Edge** (closed set) | `render` · `read` (store→prop) · `write` (→store) · `child` (→node) · `gate` (predicate→node) · `behavior` (event→[action]) |
| **Store** | addressable namespaces, path-addressed, reactive |
| **Action** (closed families) | `assign` · `derive` · `invoke` · `emit` · `navigate` · `confirm` |
| **Event** | a named trigger produced by a capability or a machine |
| **Machine** | `{ contextPath, initial, states }` — reduced by the kernel's pure reducer |

### Edges as a unified graph

Every relationship in a document is an **edge in one graph**:

| Edge | Direction | Role |
|---|---|---|
| `render` | (implicit via `capability`) | which component |
| `read` | store → node prop | data in |
| `write` | node/event → store | data out |
| `child` | node → node | structure |
| `gate` | predicate → node | conditional visibility |
| `behavior` | event → action → target | interaction |

Because behavior actions target the same Store that `read` binds against, **cross-node
interaction is emergent**: an action writes to a namespace path; another node already reads that
path; reactive propagation re-resolves it. The dataflow graph and the interaction graph are the
same graph. (See [ADR-0002](decisions/ADR-0002-interaction-as-edge.md).)

## State without a stateful kernel

Three tiers of "stateful," each at the correct layer:

| Tier | What | Where it lives | Mechanism |
|---|---|---|---|
| Ephemeral UI state | selection, drafts, open/closed | a namespace value | stateless `assign` |
| Bounded sequencing | wizard, approval, step-machine | a declared **Machine** (data); current state is a namespace value | kernel runs a pure `reduce(state, event) → state` |
| Durable / async | retries, timers, agent loops, awaits | the **Orchestrator** provider | kernel only `invoke`s out; result returns as event + patch |

A state machine is therefore **declarative data + a stateless reduce**, not an engine. Async is
modeled as *states* (`loading → success | error`), never as a kernel-side `await`; the actual
awaiting happens in the Orchestrator, whose completion re-enters the machine via an event.
(See [ADR-0003](decisions/ADR-0003-stateless-events-with-reducer.md).)

**Governing law:** the kernel is always a pure `(state, event) → state`. It never owns memory or
time. State is data in namespaces; durability is a provider.

## The three planes

Distinguishing these prevents the "meta-kernel" confusion:

| Plane | Owns | Example |
|---|---|---|
| **Kernel (closed grammar)** | the *shape* of nodes and edges | "an `on` maps event → action targeting a namespace path" |
| **Manifest (meta-DSL)** | the *vocabulary* — which capabilities/events/actions/namespaces | "capability `X` emits `submit`; action `createY` exists; namespace `Z`" |
| **Document (instance)** | a specific *use* of that vocabulary | a concrete node tree an agent emits |

The "one more declarative level" that behavior/interactions seem to demand is **not a second
kernel** — it is the **Manifest**. Interaction *shape* stays in the kernel; interaction
*vocabulary* is declared in the Manifest.

## Provider contracts (the platform's public surface)

| Provider | Contract | Kernel uses it to… |
|---|---|---|
| **SchemaProvider** | supply document + per-capability schemas | validate before commit |
| **CapabilityRegistry** | `resolve(type) → {renderer, propsSchema, emits}` + fallback | resolve nodes, generate tool shapes |
| **StateModel** | namespaces, `resolve(path)`, reactivity, persistence | back `read`/`write`/machine context |
| **ExpressionProvider** | `eval(expr, scope) → value` | run `gate`, `derive`, read-paths |
| **RenderAdapter** | materialize a resolved node in a target framework | stay framework-agnostic |
| **Orchestrator** | invoke external actions; return event + delta | back `invoke`/`confirm`, durable async |
| **TransportProvider** | stream/batch documents + state deltas | ingest and propagate |
| **ObservabilitySink** | receive trace events | emit resolve/fallback/action/transition traces |

## Kernel invariants

1. **Closed grammar** — only the six edge types and six action families; providers extend
   vocabulary, never shape.
2. **Pure reducer law** — behavior/machines are `(state, event) → state`; the kernel owns no time
   or memory. Durability lives behind `Orchestrator`.
3. **Validate-before-commit** — no document mutates the Store until it passes structural +
   edge-integrity validation.
4. **Deterministic resolution order** — `gate → capability → props → read → children → render`.
5. **Graceful fallback** — an unknown capability resolves to a safe placeholder, never a crash.
6. **Unified graph** — data edges and behavior edges resolve against the same Store.
7. **Render purity** — the `RenderAdapter` consumes only *resolved nodes + patches* and emits only
   *events*; it has no knowledge of storage, persistence, or transport. Those are kernel-side
   providers. Co-location of an embedded kernel with a renderer is a deployment fact, not an API
   coupling. (See [ADR-0006](decisions/ADR-0006-render-adapter-infra-agnostic.md).)

## Runtime pipeline

```
ingest(document)                               ← TransportProvider
  → validate(document)                         ← SchemaProvider + edge integrity
  → for each Node:
       resolve capability                      ← CapabilityRegistry (fallback if unknown)
       resolve read/gate/derive edges          ← StateModel + ExpressionProvider
       materialize                             ← RenderAdapter
       recurse children
  → on Event:
       reduce(behavior edges + machines)       ← Kernel pure reducer
       dispatch actions:
         assign/derive → Store
         invoke/confirm → Orchestrator (async → returns Event + delta)
         emit → event bus
       Store deltas → re-resolve affected nodes
  → every step → ObservabilitySink
```

## Application composition — bundles and the generic host

The kernel runs one `document`; an *application* is more than one document, so the React adapter's
"floor" adds a thin packaging layer **above** the kernel (it changes no kernel grammar, provider, or
wire message). See [ADR-0030](decisions/ADR-0030-bundle-composition.md) and
[ADR-0031](decisions/ADR-0031-per-bundle-registries.md).

- **Bundle** — the unit of an app: `{ manifest, document, state?, effects?, components? }`. The
  JSON-only subset `{ manifest, document, state? }` (a **SerializableBundle**) is movable as data;
  `effects` (named Orchestrator handlers) and `components` (extra capability views) are the code side.
- **One host** — `loadBundle` seeds state, builds the effect dispatcher, constructs the kernel, and
  returns a controller; `BundleHost` renders it on the shared primitive registry. The console,
  preview, and playground are all just bundles handed to this host.
- **Composition** — `embed` is a leaf *capability* that mounts a whole bundle as a nested runtime,
  either **inline** (a SerializableBundle bound from state, for runtime-built surfaces) or as a
  **named app** (resolved from an `AppRegistry` the host publishes, carrying its native effects).
  The same bundle runs identically as the outermost mount or as a nested leaf — there is no
  privileged "app shell."
- **Per-bundle registries** — a bundle renders on the **shared floor plus its own additive
  overlay**: `overlayRegistry(floor, bundle.components)`, extras winning on collision, scoped to that
  bundle (a nested bundle inherits the floor, not the parent's custom vocabulary). This lets a
  custom-vocabulary app (e.g. the workbench chrome) be hosted anywhere while the floor stays
  universal. The manifest's `extraCapabilities` and the registry's `components` declare the same
  extra capability from the schema side and the drawing side.

Continue to [03-protocol.md](03-protocol.md).
