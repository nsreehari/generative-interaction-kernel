# ADR-0029: WinUI/Reactor render binding — the toolkit edge on the C# adapter core

**Status:** Accepted

## Context

[ADR-0026](ADR-0026-second-render-adapter-dotnet.md) built the second render adapter as a
**renderer-agnostic C# core** (`adapters/dotnet/GenUI.Render`): a generic `Renderer.Render<TView>`
walk, a `ComponentRegistry<TView>`, and a `GenUIController` loop, proven headless with `TView =
RenderRecord`. It deliberately stopped at the core and named the remaining work: the concrete
**Reactor/WinUI binding** (`TView = Element` + a host window) and **cross-adapter render equivalence**.

That binding cannot live in the offline island. It needs the Windows App SDK, the
`Microsoft.UI.Reactor` package, a `net10.0-windows` target, and Windows-only tooling — everything the
zero-NuGet, OS-neutral kernel/adapter island exists to keep out ([ADR-0024](ADR-0024-second-kernel-csharp.md),
[ADR-0026](ADR-0026-second-render-adapter-dotnet.md)). So it must be a separate project outside the
island, consuming the core through the same `TView` seam a headless test uses.

## Decision

Add **`adapters/dotnet/GenUI.Render.Reactor`** — a `net10.0-windows10.0.26100.0`, `UseWinUI` project
with its own `nuget.config` (nuget.org for Reactor + Windows App SDK) — that binds
`TView = Microsoft.UI.Reactor.Core.Element` to the core. It project-references `GenUI.Render` only; it
never enters the island, and the island's empty `Directory.Build.props` still stops the MSBuild walk so
the offline projects are unaffected.

- **`GenUIReactorViews`** — a `ComponentRegistry<Element>` mapping live-cards capabilities to Reactor
  factory elements: `board` → titled `VStack` over the already-rendered children; `metric` → labelled
  value; `actions` → `Button` whose tap calls the node-bound `Emit`; `table` → a header row plus one
  tappable row per data item emitting `rowSelect`; plus a subtle fallback marker that still carries
  children. Each view reads `props.Node.Props` and uses `props.Emit`; **none** of them touch visibility,
  fallback selection, or emit-id capture — those already happened in the shared walk.
- **`GenUIHostComponent : Component`** — the Reactor root. On mount (`UseEffect`) it subscribes to the
  `GenUIController`, holds the latest `ResolvedNode` in `UseState`, calls `Start()`, and on every tree
  re-renders `Renderer.Render(tree, GenUIReactorViews.Registry, emit)`. Node-bound emits round-trip
  through the controller (dispatch → re-resolve → re-render), so the loop is fully declarative — the
  component owns no imperative UI mutation.
- **`ReactorHost.Run(controller, …)`** — opens a WinUI window via `ReactorApp.Run<GenUIHostComponent>`,
  handing the controller to the root through a static seam (because `ReactorApp.Run<TRoot>` constructs
  the root itself). A small `[STAThread]` `Program` builds a sample live-cards document, drives it
  through the real kernel, and hosts it — making the binding end-to-end runnable.

### How render equivalence across adapters is verified

Equivalence is anchored **by construction, not by a per-toolkit pixel test**. Every C# binding shares
the *identical* `Renderer.Render<TView>` traversal — the single owner of the three things that define
"the same render": which nodes appear (`Visible`), which view draws each node (registry vs. the two
fallback paths), and the node id each `emit` carries. A toolkit binding supplies only leaf/container
composition through `CapabilityView<TView>`; it is structurally incapable of changing visibility,
fallback routing, or emit identity. So the Reactor binding and the headless `RenderRecord` binding walk
the same tree the same way by definition.

That shared walk is pinned by the offline `GenUI.Render.Check` runner (`test:dotnet-render`), which
asserts the visibility drop, both fallback paths, node-id capture, and the controller's dispatch →
refresh on the **real** kernel with `TView = RenderRecord`. The Reactor binding is validated two ways:
it **compiles** against the real `Microsoft.UI.Reactor` surface, and — because Reactor `Element`s are
pure declarative records — a second offline runner, `GenUI.Render.Reactor.Check` (`test:dotnet-render-reactor`),
renders the same `ResolvedNode` tree through the actual `GenUIReactorViews` registry (`TView = Element`)
and **walks the resulting element tree structurally** with no UI thread, no window, and no control
materialization. It asserts the container/leaf shapes, the visibility drop, both fallback paths, and a
real `ButtonElement.OnClick` emit round-tripping through the kernel. The same runner then runs Reactor's
own `AccessibilityScanner.Scan` over that render tree — the framework's oracle that walks the exact
elements which materialize to WinUI controls — and enforces a **warning-clean** bar (info-level
heuristics, e.g. a bold numeric value read as a heading, are surfaced, not suppressed). This upgrades the
Reactor evidence from *compile-verified* to *structural + semantically scanned*.

Pixel-level verification remains out of scope — and that is the framework's own guidance, not just ours:
Reactor's testing docs state a rendered bitmap "depends on font rendering, DPI, and platform Composition
— none of which belong in a unit test," and prescribe asserting the element tree instead. So the render
tree, validated headlessly by Reactor's own scanner, is the correct paint-fidelity surface; the contract,
not the pixels, is what must match across adapters.

## Alternatives considered

- **Put the Reactor binding in the offline island.** Rejected for the same reason as ADR-0026: it drags
  the Windows App SDK and `Microsoft.UI.Reactor` into a project whose defining property is being
  offline and OS-neutral, making the core un-buildable without the Windows workload.
- **Re-implement the walk inside the Reactor component.** Rejected: it would fork the visibility/fallback
  rule per toolkit — exactly the divergence the generic core was built to prevent. Equivalence holds
  *because* there is one walk, not two that happen to agree.
- **Prove equivalence with a UI automation harness comparing React and Reactor output.** Rejected for
  now: a pixel/automation diff is expensive, flaky, and tests the toolkits more than the contract. The
  contract is guaranteed by the shared traversal and asserted headlessly — including a structural walk of
  the real Reactor element tree (`test:dotnet-render-reactor`); that is the durable evidence.
- **Inject the controller into the root via DI instead of a static seam.** Rejected: `ReactorApp.Run<TRoot>`
  owns root construction and takes no state, so a static hand-off is the minimal seam. A DI container
  would be ceremony for a single value.

## Consequences

- The concrete WinUI/Reactor binding exists and **compiles against the real Reactor + Windows App SDK**,
  closing the toolkit-edge half of ADR-0026's open item.
- Cross-adapter render equivalence is settled: it is a property of the shared `Renderer.Render` walk
  (asserted offline by `test:dotnet-render`), so a new toolkit binding inherits equivalence for free —
  it only writes leaf/container factories. The Reactor binding's own element tree is additionally pinned
  structurally by `test:dotnet-render-reactor`.
- The Reactor **structural check** runs headless in `npm test` (Reactor `Element`s are declarative records,
  so the walk needs no UI thread). The Reactor **window app** is still not wired into `npm test`: it targets
  `net10.0-windows` and opens a window, so only the structural check — not the painted window — is part of
  the offline suite.
- Precedent for the next toolkit (WPF, MAUI, another web renderer): add a project outside the island,
  bind `TView`, write a registry + a host component, and reuse the same walk and equivalence argument.
