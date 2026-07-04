# GenUI render adapter (C#)

A **renderer-agnostic** render adapter for the C# kernel core ([kernel-dotnet](../../kernel-dotnet/)).
It is the C# analogue of [`adapters/react`](../react/): a pure walk of the kernel's resolved tree into
a view tree, generic over the target view type so one core serves any UI toolkit. See
[ADR-0026](../../docs/decisions/ADR-0026-second-render-adapter-dotnet.md).

Like the kernel island, this project uses **only `System.Text.Json`** — zero NuGet, builds offline,
`net10.0` (not `-windows`). A concrete **Reactor/WinUI** binding (`TView = Element`, plus a host
window) is a thin follow-on that lives *outside* this island, so the core stays portable.

## Layout

```
adapters/dotnet/
  Directory.Build.props/targets   ← empty: keep this adapter its own MSBuild island
  GenUI.Render/                   ← the renderer-agnostic core (references GenUI.Kernel)
    Registry.cs                     ← IComponentRegistry<TView> + ComponentRegistry<TView>, CapabilityView<TView>
    Renderer.cs                     ← Renderer.Render<TView>(node, registry, emit): the pure walk (visible + fallback)
    Controller.cs                   ← GenUIController: init -> resolve -> (emit) dispatch -> re-resolve -> notify
  GenUI.Render.Check/             ← headless smoke checks over the REAL kernel (npm run test:dotnet-render)
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
