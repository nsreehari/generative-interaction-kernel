using System;
using GenUI.Kernel;
using GenUI.Render;
using Microsoft.UI.Reactor;
using Microsoft.UI.Reactor.Core;
using static Microsoft.UI.Reactor.Factories;

namespace GenUI.Render.Reactor;

/// <summary>Props for <see cref="EmbeddedBundleComponent"/>: the inline bundle to host.</summary>
public sealed record EmbeddedBundleProps(Bundle Bundle);

/// <summary>
/// A SERVER-FREE child host for the <c>ui:embed</c> primitive — the lightweight peer of the React
/// floor's <c>Embed</c> (which hosts a bundle through <c>GenUIRoot</c>). Unlike
/// <see cref="BundleHostComponent"/>, it stands up NO transport endpoint: an embedded preview is a
/// leaf in some outer bundle's tree, not a top-level surface agents attach to, so it only loads its
/// bundle into a <see cref="GenUIController"/>, subscribes to resolved trees, and re-renders them
/// through <see cref="Renderer.Render{TView}"/> against the shared <see cref="GenUIReactorViews.Registry"/>.
/// It owns no imperative UI mutation — only state-driven re-render. Give each embed a stable key so
/// switching the hosted bundle remounts a fresh controller instead of reusing a stale one.
/// </summary>
public sealed class EmbeddedBundleComponent : Component<EmbeddedBundleProps>
{
    public override Element Render()
    {
        // One controller per bundle identity; memoized so re-renders reuse it, rebuilt only when a
        // different bundle instance is handed in (pair the call site with a key to force a remount).
        GenUIController controller = UseMemo(() => BundleLoader.LoadBundle(Props.Bundle), Props.Bundle);

        (ResolvedNode? tree, Action<ResolvedNode?> setTree) = UseState<ResolvedNode?>(null);

        EmitFn emit = (id, name, payload) => controller.Emit(id, name, payload);

        UseEffect(() =>
        {
            IDisposable subscription = controller.Subscribe(t => setTree(t));
            controller.Start();
            return () => subscription.Dispose();
        }, controller);

        if (tree is null)
        {
            return TextBlock("Loading\u2026").Margin(16);
        }

        return Renderer.Render(tree, GenUIReactorViews.Registry, emit)
            ?? (Element)TextBlock("(root not visible)").Margin(16);
    }
}
