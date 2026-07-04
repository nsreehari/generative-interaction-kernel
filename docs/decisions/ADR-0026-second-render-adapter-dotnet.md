# ADR-0026: Second render adapter — a renderer-agnostic C# adapter core

**Status:** Accepted

## Context

React is the first render adapter ([ADR-0008](ADR-0008-first-render-adapter-react.md)), and a render
adapter is deliberately infrastructure-agnostic ([ADR-0006](ADR-0006-render-adapter-infra-agnostic.md)):
its whole job is to walk the kernel's resolved tree and map each capability to a view, honoring
`visible` and `fallback`, and to wire a node-bound `emit` back into the kernel's dispatch loop. The
platform thesis ([ADR-0017](ADR-0017-platform-boundary.md)) is that the renderer is commodity
infrastructure — the Interaction and Presentation layers are the moat — so a *second* renderer is the
proof that the same resolved-tree contract drives more than one UI toolkit.

A second kernel core now exists in C# ([ADR-0024](ADR-0024-second-kernel-csharp.md)): a `net10.0`,
`System.Text.Json`-only, zero-NuGet island that builds offline. Open item 2 asked for the
WinUI/Reactor adapter that would sit on it. But a real WinUI/Reactor binding needs the Windows App SDK
and the `Microsoft.UI.Reactor` packages, a `net10.0-windows` target, and Windows-only tooling — none of
which belong inside the portable, offline kernel island. Bolting them on would make the C# core
Windows-only and break its "builds offline, zero NuGet" guarantee.

The React adapter already shows the shape of the answer: its core (`render.tsx`, `registry.ts`,
`controller.ts`) is **pure and headless** — a `ResolvedNode → view` walk over a capability registry plus
a framework-agnostic controller loop — and React elements are only the thin edge. The same split
applies in C#.

## Decision

Build the second render adapter as a **renderer-agnostic C# adapter core** (`adapters/dotnet/`),
generic over the target view type `TView`, mirroring the React adapter one-for-one. The concrete
toolkit binding (Reactor/WinUI) is a thin, separate edge that supplies `TView` from the outside and is
**not** part of this core.

- **`GenUI.Render`** — a `net10.0`, `System.Text.Json`-only project (its own island, its own empty
  `Directory.Build.props`/`targets`) that references only `GenUI.Kernel`:
  - `Renderer.Render<TView>(node, registry, emit)` — the pure walk. Honors `Visible` (invisible nodes
    render nothing and are dropped from their parent's child list) and `Fallback` (a kernel-unknown
    capability, or a known one with no registered view, uses the fallback view). Byte-for-byte the same
    rule as `render.tsx`.
  - `IComponentRegistry<TView>` / `ComponentRegistry<TView>` — capability → view lookup with a
    fallback, the `registry.ts` analogue.
  - `GenUIController` — the `controller.ts` analogue: `Start()` (init → resolve), `Emit()` (dispatch →
    re-resolve → notify), `Subscribe()`, and `Tree`/`LastPatch`. Synchronous, because the C# kernel is
    synchronous; otherwise identical in shape.
- **`GenUI.Render.Check`** — a headless console runner (the same style as `GenUI.Conformance`,
  zero test-framework dependencies) that renders a hand-built document into a serializable
  `RenderRecord` tree (`TView = RenderRecord`) and drives the whole loop through the **real** kernel:
  render → node-bound `emit` → dispatch → re-resolve → re-render. It asserts the visibility drop, both
  fallback paths (known-but-unregistered vs. kernel-unknown), node-id capture on the bound emit, and the
  controller's one-rev patch + refresh. Wired into `npm test` as `test:dotnet-render`.

The actual Reactor/WinUI binding (`TView = Microsoft.UI.Reactor.Element`, a capability→factory registry,
and a host window) is the natural follow-on; it lives outside this offline island so the core stays
portable.

## Alternatives considered

- **Put a WinUI/Reactor adapter directly on the kernel island.** Rejected: it drags the Windows App SDK
  and `Microsoft.UI.Reactor` into a project whose defining property is being offline, zero-NuGet, and
  OS-neutral. It would make the C# core Windows-only and un-buildable in CI without the Windows
  workload — the opposite of a portable protocol core.
- **Skip the pure core; write the Reactor binding as the "adapter".** Rejected: it would leave the
  genuinely reusable, testable part (the walk + fallback rule + controller loop) entangled with a UI
  toolkit, exactly the mistake the React adapter avoids. The reusable seam is the core; the toolkit is
  the edge.
- **Make `Render` non-generic, returning some concrete node type.** Rejected: the whole point is that
  one walk serves many toolkits. A generic `TView` lets a Reactor binding, a headless test binding, and
  any future toolkit share the identical traversal and fallback semantics.
- **Verify the adapter with a UI test harness.** Rejected for now: a headless `RenderRecord` check
  proves the adapter's *contract* (which view, which fallback, which emit, which refresh) deterministically
  and offline. Pixel/interaction-level verification belongs to the toolkit binding, not the core.

## Consequences

- The second render adapter's reusable core exists, builds offline, and is proven by a headless check
  on the real kernel — without importing any UI toolkit.
- The Reactor/WinUI binding is now a small, well-scoped edge: implement `CapabilityView<Element>`
  factories and a registry, hand the controller an `emit` that dispatches, and re-render on each tree.
- Open item 2 narrows to exactly that toolkit edge plus **cross-adapter render equivalence** (proving
  the React and Reactor bindings draw the same resolved tree the same way) — the traversal contract
  itself is no longer in question.
- A precedent is set: additional adapters (WPF, another web toolkit) reuse this same generic core rather
  than reinventing the walk.
