# ADR-0030 — The bundle: one host runs any app; apps compose via an `embed` leaf

**Status:** Accepted — 2026-07-06

## Context

The kernel (ADR-0001) runs a single `document` against a `manifest` with providers. But a real
application — the profile console, a playground, the workbench chrome — is more than one document:
it is a `manifest` + a `document` + seed state + the native effect handlers its `invoke`s route to
(the Orchestrator seam, ADR-0009). Until now each app wired those together with bespoke React: its
own component registry, its own orchestrator glue, its own host component. "Adding an app" therefore
meant writing app-specific TypeScript, and one app could not contain another.

The product direction is **everything is JSON**: the only code is (1) the kernel/runtime, (2) a
fixed set of primitive capabilities (leaf components), and (3) a few named effect handlers.
Everything else — every app, tool, and surface — is data. That requires a unit that *packages* an
app, a single host that can run *any* such unit, and a way for one app to embed another.

## Decision

**The Bundle is the unit of an application, one generic host runs any bundle, and apps compose
through an `embed` leaf.**

- **Bundle shape.** `Bundle = { manifest, document, state?, effects?, components? }`. The JSON-only
  subset `SerializableBundle = { manifest, document, state? }` is safe to store in kernel state and
  move as data. `effects` (named native handlers, ADR-0009) and `components` (extra
  capability→component views, ADR-0031) are the code side and live only on the full `Bundle`.
- **One host.** `loadBundle(bundle)` seeds state from the manifest's namespaces, builds the effect
  dispatcher, constructs the kernel, and returns a controller; `BundleHost` renders that controller
  with the shared primitive registry. No app ships a bespoke host or orchestrator wiring — the
  console, preview, and playground are all bundles handed to the same host.
- **Composition via `embed`.** `embed` is a leaf *capability* that mounts a whole bundle as a nested
  runtime (its own kernel + state, rendered on the shared floor). It has two modes:
  - **inline** — a `SerializableBundle` read from state (`props`-bound), for runtime-built surfaces
    such as the console's live Preview/Playground, which are rebuilt from the draft as JSON;
  - **named app** — a name (`props.app`) resolved from an `AppRegistry` the host publishes via
    React context, for a *known* app that carries its native `effects`/`components`.
- **No privileged shell.** Because a named app is just a `Bundle`, the same app runs identically as
  the outermost mount (`BundleHost`) or as a leaf inside another bundle (`embed`). "Hosting an app"
  *is* "mounting its bundle."

## Alternatives considered

- **Per-app hosts / registries / orchestrators (the status quo).** Every app re-implements the same
  wiring; "adding an app" is code, not data; apps cannot compose. Directly contradicts the
  everything-is-JSON direction.
- **Embed apps only by inlining their JSON.** Sufficient for effect-free, runtime-built surfaces,
  but a known app's native effect handlers are *functions* and cannot travel through JSON state — so
  a real app could never be embedded *by reference*. The named-app registry closes exactly that gap
  while inline embedding stays available for the JSON-only case.
- **A dedicated "app shell" component distinct from the `embed` leaf.** Reintroduces a privileged
  top level and a second code path. The whole point is that the outermost mount and a nested mount
  are the same operation.
- **Naming the leaf `bundle`/`mount`/`host`.** `embed` reads as a verb in a document
  (`node("embed", { app: "playground" })`) and disambiguates from the root `BundleHost`.

## Consequences

- Adding an app = new JSON (plus any named effects it needs), handed to the one host. Preview is the
  playground bundle in a read-only mode; both are embedded per profile in the console.
- Bundles compose to arbitrary depth; each nested runtime is isolated (own kernel + state) yet
  renders on the shared floor, and can itself `embed` further bundles/apps.
- The Orchestrator seam (ADR-0009) is what each bundle's dispatcher fills; effects remain the only
  native behavior surface an app contributes.
- **First application (implemented):** the workbench's *chrome* and *inspect* columns are now **two
  bundles** — each `{ manifest: WORKBENCH_MANIFEST, document, state, components }` loaded by the floor
  host (via `loadBundleRuntime`, which exposes the state model for host wiring). The middle *guest*
  stays a distinct compiler surface (the Interaction→Presentation→UI output, ADR-0018), **not** a
  bundle; its three cross-kernel bridges remain **thin host wiring** (React effects), because running
  a compiler and forwarding events across kernel boundaries are irreducibly native — not expressible
  in the closed action grammar, and not single-kernel effect handlers either.
- This is an **adapter-layer** decision: it changes how whole apps are packaged and composed above
  the kernel; the kernel grammar, providers, and wire protocol are untouched.
