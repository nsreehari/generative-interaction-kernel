// The pure reducer: (document, store, event) -> ordered ops (+ deferred effects).
// It never mutates the store; the kernel applies the returned ops. Op emission order
// is contractual: node actions in edge order, then machines in document order, with
// emit fan-out settled via an in-dispatch queue. Mirrors reduce.ts.

using System.Text.Json;
using System.Text.Json.Nodes;

namespace GenUI.Kernel;

public static class Reducer
{
    public static (List<PatchOp> Ops, List<Effect> Effects) Reduce(
        JsonObject doc, IStateModel store, GupEvent evt, IExpressionProvider expr,
        // Predicate positions (action + machine transition guards) are agent-authored and
        // adversarial; the platform routes them through the safe subset. Falls back to the full
        // provider when a low-level caller does not distinguish the positions.
        IExpressionProvider? predicateExpr = null)
    {
        predicateExpr ??= expr;
        var ops = new List<PatchOp>();
        var effects = new List<Effect>();
        var data = store.Snapshot();
        var root = doc["root"]!.AsObject();
        var machines = doc["machines"] as JsonArray;

        var queue = new Queue<GupEvent>();
        queue.Enqueue(evt);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            var bindings = new Dictionary<string, JsonNode?>
            {
                ["event"] = (JsonNode?)(current.Payload?.DeepClone()) ?? new JsonObject(),
            };
            var emitted = new List<GupEvent>();

            var node = FindNode(root, current.Node);
            if (node?["edges"]?["on"]?[current.Name] is JsonArray actions)
            {
                foreach (var an in actions)
                {
                    var a = an!.AsObject();
                    if (a["guard"] is JsonNode g && !Json.Truthy(predicateExpr.Eval(g.GetValue<string>(), data, bindings)))
                        continue;
                    DispatchAction(a, current, data, bindings, expr, ops, effects, emitted);
                }
            }

            if (machines is not null)
                foreach (var mn in machines)
                    ReduceMachine(mn!.AsObject(), store, current, data, bindings, expr, predicateExpr, ops, effects, emitted);

            foreach (var e in emitted) queue.Enqueue(e);
        }

        return (ops, effects);
    }

    private static void DispatchAction(
        JsonObject a, GupEvent current, JsonObject data,
        IReadOnlyDictionary<string, JsonNode?> bindings, IExpressionProvider expr,
        List<PatchOp> ops, List<Effect> effects, List<GupEvent> emitted)
    {
        var kind = a["do"]!.GetValue<string>();
        var args = a["args"] as JsonObject;
        switch (kind)
        {
            case "assign":
                if (a["target"] is JsonNode assignTarget)
                    ops.Add(new PatchOp("set", assignTarget.GetValue<string>(), ResolveValue(args, data, bindings, expr)));
                break;

            case "derive":
                if (a["target"] is JsonNode deriveTarget)
                {
                    var value = args?["expr"] is JsonNode e ? expr.Eval(e.GetValue<string>(), data, bindings) : null;
                    ops.Add(new PatchOp("set", deriveTarget.GetValue<string>(), value));
                }
                break;

            case "emit":
                if (a["event"] is JsonNode ev)
                {
                    var payload = args?["payload"] as JsonObject ?? current.Payload;
                    emitted.Add(new GupEvent(current.Node, ev.GetValue<string>(), payload));
                }
                break;

            case "invoke":
                // Deferred effects cross the Orchestrator seam and never write state directly.
                effects.Add(new Effect("invoke", current.Node,
                    Tool: args?["tool"] is JsonNode t && t.GetValueKind() == JsonValueKind.String ? t.GetValue<string>() : null,
                    Args: args, Payload: current.Payload));
                break;

            case "navigate":
                effects.Add(new Effect("navigate", current.Node,
                    Args: args, To: args?["to"], Payload: current.Payload));
                break;

            case "confirm":
                effects.Add(new Effect("confirm", current.Node, Args: args, Payload: current.Payload));
                break;
        }
    }

    private static JsonNode? ResolveValue(JsonObject? args, JsonObject data,
        IReadOnlyDictionary<string, JsonNode?> bindings, IExpressionProvider expr)
    {
        if (args is null) return null;
        if (args.TryGetPropertyValue("value", out var v)) return v?.DeepClone();
        if (args["from"] is JsonNode from && from.GetValueKind() == JsonValueKind.String)
            return expr.Eval(from.GetValue<string>(), data, bindings);
        return null;
    }

    private static void ReduceMachine(
        JsonObject m, IStateModel store, GupEvent evt, JsonObject data,
        IReadOnlyDictionary<string, JsonNode?> bindings, IExpressionProvider expr, IExpressionProvider predicateExpr,
        List<PatchOp> ops, List<Effect> effects, List<GupEvent> emitted)
    {
        var context = m["context"]!.GetValue<string>();
        var initial = m["initial"]!.GetValue<string>();

        var stateNode = store.Get($"{context}.state");
        var current = stateNode is not null && stateNode.GetValueKind() == JsonValueKind.String
            ? stateNode.GetValue<string>()
            : initial;

        var transition = (m["states"] as JsonObject)?[current]?["on"]?[evt.Name];
        if (transition is null) return;

        string target;
        string? guard = null;
        JsonArray? actions = null;
        if (transition.GetValueKind() == JsonValueKind.String)
        {
            target = transition.GetValue<string>();
        }
        else
        {
            var t = transition.AsObject();
            target = t["target"]!.GetValue<string>();
            guard = (t["guard"] as JsonNode)?.GetValue<string>();
            actions = t["actions"] as JsonArray;
        }

        if (guard is not null && !Json.Truthy(predicateExpr.Eval(guard, data, bindings))) return;

        ops.Add(new PatchOp("set", $"{context}.state", JsonValue.Create(target)));

        if (actions is not null)
            foreach (var an in actions)
                DispatchAction(an!.AsObject(), evt, data, bindings, expr, ops, effects, emitted);
    }

    private static JsonObject? FindNode(JsonObject node, string id)
    {
        if (node["id"]?.GetValue<string>() == id) return node;
        if (node["edges"]?["children"] is JsonArray children)
            foreach (var child in children)
                if (FindNode(child!.AsObject(), id) is { } hit)
                    return hit;
        return null;
    }

    /// <summary>Run an ordered list of closed-grammar actions owned by a node, against the current
    /// store snapshot. The shared engine behind a reaction's `run` (ADR-0034): actions dispatch
    /// exactly as an event handler's would (guards honored, effects collected), but the trigger is a
    /// state change the kernel detected rather than an inbound event. <paramref name="extraBindings"/>
    /// is merged into the expression scope (e.g. `$when`). Mirrors reduceActions in reduce.ts.</summary>
    public static (List<PatchOp> Ops, List<Effect> Effects, List<GupEvent> Emitted) ReduceActions(
        IStateModel store, string ownerNodeId, JsonArray actions,
        IExpressionProvider expr, IExpressionProvider predicateExpr,
        IReadOnlyDictionary<string, JsonNode?>? extraBindings = null)
    {
        var ops = new List<PatchOp>();
        var effects = new List<Effect>();
        var emitted = new List<GupEvent>();
        var data = store.Snapshot();
        var bindings = new Dictionary<string, JsonNode?> { ["event"] = new JsonObject() };
        if (extraBindings is not null)
            foreach (var (k, v) in extraBindings) bindings[k] = v;

        var current = new GupEvent(ownerNodeId, "__react__", null);
        foreach (var an in actions)
        {
            var a = an!.AsObject();
            if (a["guard"] is JsonNode g && !Json.Truthy(predicateExpr.Eval(g.GetValue<string>(), data, bindings)))
                continue;
            DispatchAction(a, current, data, bindings, expr, ops, effects, emitted);
        }

        return (ops, effects, emitted);
    }
}
