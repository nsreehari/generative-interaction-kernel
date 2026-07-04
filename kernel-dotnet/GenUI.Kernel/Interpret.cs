// Interpreter: resolves a document node into a ResolvedNode tree.
// Order: gate -> capability -> props(read) -> children. Mirrors interpret.ts.

using System.Text.Json.Nodes;

namespace GenUI.Kernel;

public static class Interpreter
{
    public static ResolvedNode Resolve(JsonObject node, InMemoryStateModel store, ManifestRegistry registry, IExpressionProvider expr)
    {
        var data = store.Snapshot();
        var edges = node["edges"] as JsonObject;

        var visible = true;
        if (edges?["gate"] is JsonNode gate)
            visible = Json.Truthy(expr.Eval(gate.GetValue<string>(), data));

        var props = new JsonObject();
        if (node["props"] is JsonObject declared)
            foreach (var kv in declared)
                props[kv.Key] = kv.Value?.DeepClone();
        if (edges?["read"] is JsonObject read)
            foreach (var kv in read)
                props[kv.Key] = store.Get(kv.Value!.GetValue<string>());

        var capability = node["capability"]!.GetValue<string>();
        var fallback = !registry.Has(capability);

        var children = new List<ResolvedNode>();
        if (edges?["children"] is JsonArray kids)
            foreach (var child in kids)
                children.Add(Resolve(child!.AsObject(), store, registry, expr));

        return new ResolvedNode
        {
            Capability = capability,
            Id = node["id"]!.GetValue<string>(),
            Props = props,
            Visible = visible,
            Fallback = fallback,
            Children = children,
        };
    }
}
