# GenUI render adapter (C#)

A **renderer-agnostic** render adapter for the C# kernel core ([kernel-dotnet](../../kernel-dotnet/)).
It is the C# analogue of [`adapters/react`](../react/): a pure walk of the kernel's resolved tree into
a view tree, generic over the target view type so one core serves any UI toolkit. See
[ADR-0026](../../docs/decisions/ADR-0026-second-render-adapter-dotnet.md).

Like the kernel island, this project uses **only `System.Text.Json`** — zero NuGet, builds offline,
`net10.0` (not `-windows`). The concrete **Reactor/WinUI** binding (`TView = Element`, plus a host
window) lives in [`GenUI.Render.Reactor`](GenUI.Render.Reactor/) *outside* this island, so the core
stays portable. See [ADR-0029](../../docs/decisions/ADR-0029-winui-reactor-binding.md).

## Layout

```
adapters/dotnet/
  Directory.Build.props/targets   ← empty: keep this adapter its own MSBuild island
  GenUI.Render/                   ← the renderer-agnostic core (references GenUI.Kernel)
    Registry.cs                     ← IComponentRegistry<TView> + ComponentRegistry<TView>, CapabilityView<TView>
    Renderer.cs                     ← Renderer.Render<TView>(node, registry, emit): the pure walk (visible + fallback)
    Controller.cs                   ← GenUIController: init -> resolve -> (emit) dispatch -> re-resolve -> notify
  GenUI.Render.Check/             ← headless smoke checks over the REAL kernel (npm run test:dotnet-render)
  GenUI.Render.Reactor/           ← the WinUI/Reactor binding (TView = Element) + host window — OUTSIDE the island
    GenUIReactorViews.cs            ← ComponentRegistry<Element>: board/metric/table/actions + fallback
    GenUIHostComponent.cs           ← Reactor root: subscribes to GenUIController, re-renders each resolved tree
    ReactorHost.cs / Program.cs      ← ReactorApp.Run<...> host window + a runnable live-cards demo
```

## Contract (mirrors `adapters/react`)

- **`Renderer.Render<TView>`** honors `Visible` (invisible nodes render nothing, dropped from their
  parent) and `Fallback` (kernel-unknown capability, or a known one with no registered view, uses the
  fallback view) — the same rule as `render.tsx`.
- **`IComponentRegistry<TView>`** maps a capability id to a `CapabilityView<TView>`, with a fallback.
- **`GenUIController`** runs the kernel loop and notifies subscribers with each freshly resolved tree;
  a toolkit binding re-renders on notification and routes its `emit` back through `Emit`.

## Run the checks

```
dotnet run --project adapters/dotnet/GenUI.Render.Check     # or: npm run test:dotnet-render
```

The check renders a hand-built document into a serializable `RenderRecord` tree and drives the full
loop through the real kernel (render → node-bound emit → dispatch → re-resolve → re-render), asserting
the visibility drop, both fallback paths, node-id capture, and the controller's one-rev patch/refresh.

## Reactor/WinUI binding

`GenUI.Render.Reactor` binds `TView = Microsoft.UI.Reactor.Core.Element` to the core: a
`ComponentRegistry<Element>` (`GenUIReactorViews`), a Reactor root that subscribes to a
`GenUIController` and re-renders each resolved tree (`GenUIHostComponent`), and a `ReactorHost.Run`
helper + demo `Program`. It targets `net10.0-windows`, pulls Reactor + Windows App SDK from nuget.org
(its own `nuget.config`), and is **not** part of the offline suite — its guarantee is compile-time
plus the shared headless walk. Cross-adapter render equivalence is anchored by that single shared
`Renderer.Render` walk, not a per-toolkit pixel test. See
[ADR-0029](../../docs/decisions/ADR-0029-winui-reactor-binding.md).

```
dotnet build adapters/dotnet/GenUI.Render.Reactor    # compiles the binding against real Reactor + WinUI
```
