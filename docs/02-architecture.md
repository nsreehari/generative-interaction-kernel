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
| **Action** (closed families) | `assign` · `derive` · `invoke` · `emit` · `route` · `confirm` |
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

## Kernel, face, projection, transport

One source of confusion was treating all outer layers as if they were the kernel. They are not.
The runtime stack has four distinct layers:

| Layer | Owns | Typical examples |
|---|---|---|
| **Kernel / engine** | execution semantics | `resolve`, `dispatch`, `checkpoint`, `restore`, `effectsSince`, `compensate` |
| **Face** | callable capability surface around the kernel and related helpers | `validateDocument`, `getState`, `emit` |
| **Projection** | a policy-shaped view of a face | full control-plane view vs filtered agent-safe view |
| **Transport** | how a chosen projection crosses a boundary | MCP over HTTP, SSE render stream |

### Kernel

The kernel is the **embeddable execution core**. It owns the runtime laws: interpreting the closed
grammar, reducing events, resolving the tree, emitting patches, and journaling effects. A product
that wants local authority over runtime semantics embeds the kernel.

### Face

A face is a **tool/API surface built around capabilities**. Some face operations are backed by an
embedded live kernel (`getState`, `getTree`, `emit`, `checkpoint`, `restore`, `effectsSince`, `compensate`); others are pure
library functions over JSON inputs (`describeCatalog`, `validateDocument`, `validatePresentation`).

That makes a pure/live split inside `face/` useful:

- **Pure face part** — authoring/validation tools that need no running kernel.
- **Live face part** — inspect/drive/time-travel tools that wrap a running kernel instance.

The current package already reflects this split logically: pure tool implementations and runtime
tool implementations are separate catalogs even though they share one face package.

### Projection

A projection is a **filtered view** of the full face. It implements no separate runtime logic. It
is policy over the face:

- **ControlFace projection** — full catalog.
- **AgentFace projection** — allowlisted subset.

So `agentface` is not a second engine and not a sibling runtime. It is `controlface` filtered.

### Transport

A transport carries a chosen projection across a boundary. It does **not** decide what the caller is
allowed to do. It owns framing, headers, routing, serialization, sockets/HTTP mechanics — nothing
about capability policy.

- **MCP transport** carries a request/response tool surface.
- **SSE transport** carries the live render stream and client events.

The transport is therefore downstream of the face boundary, not the owner of it.

### Sample hosts

Samples are the **outer composition** layer. They pick:

1. whether to embed a live kernel,
2. which face/projection to expose,
3. which transport to mount it on.

This is why the thin sample host is the right place to say things like "serve the agent-safe MCP
projection at `/mcp` and the full control projection at `/mcp-control` while the SSE render stream
is mounted at `/gik`."

### When to consume which layer

| Need | Consume |
|---|---|
| You want local runtime authority and deterministic execution in-process | **Kernel** |
| You want a bounded tool surface over a running runtime | **Face projection** |
| You need to cross a process/network boundary | **Transport carrying a projection** |

For a product such as `demo-boards-frontend`, "migrate to the GIK kernel" means deciding whether
the frontend becomes a **runtime authority** (embed the kernel) or merely a **runtime client**
(consume a face/projection over a transport). That is not a minor import choice; it is an ownership
choice about where execution semantics live.

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

## Kernel public API

The `Kernel` class is the in-process reference implementation of the closed core. Its whole public
surface is small and pure-ish — every method either seeds, advances, or reads state; none owns time
or domain knowledge. (This is the in-process API; the language-neutral **wire** contract is the five
GIK messages in [03-protocol](03-protocol.md).)

| Method | Returns | Purpose |
|---|---|---|
| `new Kernel(manifest, document, opts?)` | — | Construct over a manifest + document. Validates document + per-capability props unless `opts.validate === false`. Providers (`expression`, `state`, `contexts`, `registry`, `orchestrator`, `sink`) are injected here. |
| `init()` | `Patch` | Seed machine initial states. Returns the rev-0 baseline patch (machine ops only). |
| `baseline()` | `Patch` | `init()` **plus** the full current state as one rev-0 patch — a fresh remote client reconstructs the complete replica from it ([ADR-0011](decisions/ADR-0011-client-runtime.md)). |
| `snapshotPatch()` | `Patch` | The full current state as a patch at the *current* rev, **without** re-seeding machines — re-onboards a reconnecting client mid-session ([ADR-0012](decisions/ADR-0012-reconnection.md)). |
| `dispatch(event)` | `Patch` | Reduce one event, run any orchestrator effects and the follow-up events they produce, apply everything, fire reactions. **One dispatch = one rev**, regardless of fan-out ([ADR-0009](decisions/ADR-0009-orchestrator-effects.md)). |
| `resolve()` | `ResolvedNode` | Resolve the current document into a renderable tree (gate → capability → props → read → children). |
| `state()` | `Record<string, Json>` | The live state snapshot (by reference — read-only; do not mutate). |
| `checkpoint()` | `Checkpoint` | Capture an **immutable, rev-keyed** snapshot of pure state for time-travel (see below). |
| `restore(cp)` | `Patch` | Set state to a checkpoint — backward (undo) or forward (redo). **Pure state only**; effects are reported separately, so a host with its own rollback substrate can ignore them. |
| `effectsSince(rev)` | `RecordedEffect[]` | The effects journaled after a rev, in **causal order**, each tagged `{ rev, seq }`. The host decides: ignore, replay forward, or reverse for compensation. |
| `compensate(effects)` | `Patch` | Route the given effects through the Orchestrator's `compensate` seam, **in the order supplied** (pass reversed for LIFO undo). |

### Time-travel — checkpoint, restore, compensate

Because state is pure JSON and the reducer is deterministic (invariant 2), point-in-time capture and
restore of **state** fall out for free — they add no domain knowledge. Reversing an **effect's**
real-world consequence does not, so it stays on the Orchestrator seam. The split:

- **Kernel owns pure-state rollback.** It is *closed and total*: state is a `Record<string, Json>`,
  so a rollback is just overwriting each namespace with its prior value — one new rev, replay-safe as
  a full patch.
- **Host owns the inverse of an effect.** The kernel keeps no inverse of a fired `charge`; the
  host's `Orchestrator.compensate` maps it to a real `refund`, a no-op, or a refusal.

**`Checkpoint` is a value, not a named slot.** `checkpoint()` returns `{ rev, state }` — a deep-cloned,
immutable value that *the host holds*. The kernel keeps **no checkpoint stack and no registry**
(consistent with "owns no memory beyond the rev"). Deep-cloning matters: the live `StateModel`
returns its backing object by reference, so a naive snapshot would be mutated by the next `apply()`.

**The effect journal is a separate, optional query.** `checkpoint`/`restore` move *state* and nothing
else. Fired effects are reported by `effectsSince(rev)` in **causal order (oldest-first)**, each tagged
`{ rev, seq }` — the kernel owns no wall-clock time, so ordering is the rev counter plus a monotonic
issue sequence, **never a timestamp**. The kernel attaches **no meaning**: it hands back facts. A host
with its own rollback substrate — a git rev, a DB transaction, an event store — uses checkpoint/restore
alone and ignores the journal entirely.

**Rolling back *n* checkpoints.** Because the host holds the values, keep an array `[cp0, cp1, …]` and
`restore(cpᵢ)` jumps **directly** to any one — it is *"set state to this value,"* not a one-step pop.
`effectsSince(cpᵢ.rev)` then returns every effect fired since that point for the host to act on.
`restore` also works *forward*: to redo, hold the "after" checkpoint and `restore` to it.

**Playing it both ways.**

- **State is bidirectional and free.** `restore(before)` / `restore(after)` ping-pong freely; state
  returns *exactly* each time — the git-style usage above.
- **Effects are the host's to direct.** `effectsSince` gives you the raw array; *you* choose the
  direction and order. Reverse it and feed `compensate(effects)` for LIFO undo (`charge → refund`);
  replay the original effects forward to redo (re-dispatch the event, or run them forward yourself).
  Crucially, **effects are not idempotent in the world**: `charge → refund → charge` is three real
  transactions, not a return to zero. Only *state* round-trips to the same value; each effect flip is
  a new rev **and** a real-world action, each recorded in the trace stream (the `ObservabilitySink`;
  see [ADR-0009](decisions/ADR-0009-orchestrator-effects.md)). An unhandled or refused compensation is
  **traced, never silently pretended-away**.

```ts
const cp = kernel.checkpoint();                    // hold this value
await kernel.dispatch(chargeEvent);                // state advances; a `charge` effect fires
kernel.restore(cp);                                // pure-state rollback — nothing else touched
const fired = kernel.effectsSince(cp.rev);         // the host inspects what happened, in causal order
await kernel.compensate(fired.map((e) => e.effect).reverse());  // host chooses LIFO reversal → refund
```

> Note — retention, direction, and redo are **host policy**, deliberately outside the kernel: how many
> checkpoints to hold, when to trim the journal, and whether to replay forward or reverse. The kernel
> reports ordered facts and moves state; it never decides what a fired effect *means*.

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
