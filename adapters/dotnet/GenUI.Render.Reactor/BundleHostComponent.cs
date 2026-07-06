using System;
using GenUI.Kernel;
using GenUI.Render;
using Microsoft.UI.Reactor;
using Microsoft.UI.Reactor.Core;
using static Microsoft.UI.Reactor.Factories;

namespace GenUI.Render.Reactor;

/// <summary>Props for <see cref="BundleHostComponent"/>: the bundle to run, plus an optional
/// capability registry override (defaults to <see cref="GenUIReactorViews.Registry"/>).</summary>
public sealed record BundleHostProps(Bundle Bundle, IComponentRegistry<Element>? Registry = null);

/// <summary>
/// The EMBEDDABLE generic host — the C# mirror of the React floor's <c>host.tsx</c> component
/// (<c>&lt;BundleHost bundle={…} /&gt;</c>). Unlike the window-level <see cref="BundleHost.Run"/>,
/// this is an ordinary <see cref="Element"/> subtree: it loads its <see cref="BundleHostProps.Bundle"/>
/// once into a <see cref="GenUIController"/>, subscribes to resolved trees, and re-renders them
/// through <see cref="Renderer.Render{TView}"/> (TView = <see cref="Element"/>). It owns no
/// imperative UI mutation — only state-driven re-render — so any surface (a shell, a tab, a leaf)
/// can drop a bundle into its tree and run it. Give each instance a stable <c>.WithKey(name)</c>
/// so switching bundles remounts a fresh controller instead of reusing a stale one.
/// </summary>
public sealed class BundleHostComponent : Component<BundleHostProps>
{
    public override Element Render()
    {
        IComponentRegistry<Element> registry = Props.Registry ?? GenUIReactorViews.Registry;

        // One controller per bundle identity: memoized so re-renders reuse it, rebuilt only when a
        // different bundle instance is handed in (paired with a keyed call site for a clean remount).
        GenUIController controller = UseMemo(() => BundleLoader.LoadBundle(Props.Bundle), Props.Bundle);

        (ResolvedNode? tree, Action<ResolvedNode?> setTree) = UseState<ResolvedNode?>(null);

        // The render's emit forwards to the controller, which dispatches and refreshes; the refresh
        // notifies the subscription below, which sets state and re-renders — the whole loop declarative.
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

        return Renderer.Render(tree, registry, emit)
            ?? (Element)TextBlock("(root not visible)").Margin(16);
    }
}
