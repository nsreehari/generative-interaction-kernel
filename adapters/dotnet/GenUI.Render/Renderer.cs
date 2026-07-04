// Pure renderer: a ResolvedNode tree -> a TView tree, via a registry. Honors Visible
// (invisible nodes render nothing) and Fallback (a kernel-unknown capability, or a known
// one with no registered view, uses the fallback view). Mirrors the React adapter's
// render.tsx exactly — same walk, same fallback rule, same node-bound emit.

using System.Text.Json.Nodes;
using GenUI.Kernel;

namespace GenUI.Render;

/// <summary>Emit a behavior event for a node (the renderer supplies the node id).</summary>
public delegate void EmitFn(string nodeId, string name, JsonObject? payload);

public static class Renderer
{
    /// <summary>Render a node into <typeparamref name="TView"/>, or null when it is invisible
    /// (invisible children are dropped from their parent's child list).</summary>
    public static TView? Render<TView>(
        ResolvedNode node,
        IComponentRegistry<TView> registry,
        EmitFn emit)
        where TView : class
    {
        if (!node.Visible) return null;

        var view = (node.Fallback ? null : registry.Get(node.Capability)) ?? registry.Fallback;

        var children = new List<TView>(node.Children.Count);
        foreach (var child in node.Children)
            if (Render(child, registry, emit) is { } rendered)
                children.Add(rendered);

        EmitBound boundEmit = (name, payload) => emit(node.Id, name, payload);
        return view(new CapabilityViewProps<TView>(node, boundEmit, children));
    }
}
