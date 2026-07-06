// Interpreter: resolves a document node into a ResolvedNode tree.
// Order: gate -> capability -> props(read) -> children. Mirrors interpret.ts.

using System.Text.Json.Nodes;

namespace GenUI.Kernel;

public static class Interpreter
{
    public static ResolvedNode Resolve(JsonObject node, InMemoryStateModel store, ManifestRegistry registry, IExpressionProvider expr,
        // The visibility gate is an agent-authored predicate; the platform routes it through the
        // safe subset. Falls back to the full provider when a caller does not distinguish positions.
        IExpressionProvider? predicateExpr = null)
    {
        predicateExpr ??= expr;
        var data = store.Snapshot();
        var edges = node["edges"] as JsonObject;

        var visible = true;
        if (edges?["gate"] is JsonNode gate)
            visible = Json.Truthy(predicateExpr.Eval(gate.GetValue<string>(), data));

        var props = new JsonObject();
        if (node["props"] is JsonObject declared)
            foreach (var kv in declared)
                props[kv.Key] = kv.Value?.DeepClone();
        if (edges?["read"] is JsonObject read)
            foreach (var kv in read)
                props[kv.Key] = store.Get(kv.Value!.GetValue<string>());
        // Value position (shaped read): full provider, like derive / assign-from — NOT the safe
        // predicate subset the gate uses. Applied after `read`, so an expression may reshape a
        // plain-read prop of the same name. Mirrors interpret.ts.
        if (edges?["readExpr"] is JsonObject readExpr)
            foreach (var kv in readExpr)
                props[kv.Key] = expr.Eval(kv.Value!.GetValue<string>(), data);

        var capability = node["capability"]!.GetValue<string>();
        var fallback = !registry.Has(capability);

        var children = new List<ResolvedNode>();
        if (edges?["children"] is JsonArray kids)
            foreach (var child in kids)
                children.Add(Resolve(child!.AsObject(), store, registry, expr, predicateExpr));

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
