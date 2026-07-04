// Maps a capability id to a view factory, with a graceful fallback. This is the
// RenderAdapter's vocabulary side: which view draws each capability. Mirrors the React
// adapter's registry.ts, but generic over the target view type (TView) so the same core
// serves a React binding, a Reactor/WinUI binding, or a headless test binding.

using System.Text.Json.Nodes;
using GenUI.Kernel;

namespace GenUI.Render;

/// <summary>Emit a behavior event for a node whose id is already bound by the renderer.</summary>
public delegate void EmitBound(string name, JsonObject? payload = null);

/// <summary>What a capability view receives: the resolved node, a node-bound emit, and its
/// already-rendered children. The shape a toolkit binding maps onto a concrete control.</summary>
public sealed record CapabilityViewProps<TView>(
    ResolvedNode Node,
    EmitBound Emit,
    IReadOnlyList<TView> Children);

/// <summary>Draws one capability into the target view type.</summary>
public delegate TView CapabilityView<TView>(CapabilityViewProps<TView> props);

/// <summary>Capability -> view lookup, with a fallback for unknown/unmapped capabilities.</summary>
public interface IComponentRegistry<TView>
{
    CapabilityView<TView>? Get(string capability);
    CapabilityView<TView> Fallback { get; }
}

/// <summary>A dictionary-backed registry.</summary>
public sealed class ComponentRegistry<TView> : IComponentRegistry<TView>
{
    private readonly IReadOnlyDictionary<string, CapabilityView<TView>> _map;

    public ComponentRegistry(
        IReadOnlyDictionary<string, CapabilityView<TView>> map,
        CapabilityView<TView> fallback)
    {
        _map = map;
        Fallback = fallback;
    }

    public CapabilityView<TView> Fallback { get; }

    public CapabilityView<TView>? Get(string capability) =>
        _map.TryGetValue(capability, out var view) ? view : null;
}
