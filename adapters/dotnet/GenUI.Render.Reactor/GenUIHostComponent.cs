using System;
using GenUI.Kernel;
using GenUI.Render;
using Microsoft.UI.Reactor;
using Microsoft.UI.Reactor.Core;
using static Microsoft.UI.Reactor.Factories;

namespace GenUI.Render.Reactor;

/// <summary>
/// Reactor root that binds a <see cref="GenUIController"/> to the render adapter. On mount it
/// subscribes to resolved trees, holds the latest in state, and re-renders it through
/// <see cref="Renderer.Render{TView}"/> with TView = <see cref="Element"/>. Node-bound emits
/// round-trip through the controller (dispatch → re-resolve → re-render), so the whole loop is
/// declarative: this component owns no imperative UI mutation, only state-driven re-render.
/// </summary>
public sealed class GenUIHostComponent : Component
{
    public override Element Render()
    {
        GenUIController controller = ReactorHost.CurrentController
            ?? throw new InvalidOperationException(
                "No GenUIController is set. Start the host via ReactorHost.Run(controller, ...).");

        (ResolvedNode? tree, Action<ResolvedNode?> setTree) = UseState<ResolvedNode?>(null);

        // The render's emit forwards to the controller, which dispatches and refreshes; the
        // refresh notifies the subscription below, which sets state and re-renders.
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
