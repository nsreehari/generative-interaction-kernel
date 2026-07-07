// The reference C# kernel: holds the store, applies the pure reducer, emits patches.
// One dispatch = one patch = one rev, even when ops is empty. Deferred effects
// (invoke/confirm/navigate) are routed through the Orchestrator seam and settled
// within the same dispatch. Mirrors kernel.ts.

using System.Text.Json.Nodes;

namespace GenUI.Kernel;

public sealed class Kernel
{
    private const int MaxSettleDepth = 32;

    // Structural equality for reaction `when` values, used to detect a genuine change.
    private static bool JsonEqual(JsonNode? a, JsonNode? b) =>
        (a?.ToJsonString() ?? "null") == (b?.ToJsonString() ?? "null");

    private readonly JsonObject _doc;
    private readonly IStateModel _store;
    private readonly ManifestRegistry _registry;
    private readonly IExpressionProvider _expr;
    private readonly IExpressionProvider _predicateExpr;
    private readonly IOrchestrator _orchestrator;
    // Last observed `when` value per reaction (keyed `${nodeId}#${index}`), so a reaction fires on a
    // genuine CHANGE, never on the initial seed. Seeded lazily from the pre-event snapshot (ADR-0034).
    private readonly Dictionary<string, JsonNode?> _reactionBaseline = new();
    private bool _reactionsSeeded;
    private int _rev;

    public Kernel(
        JsonObject manifestMessage,
        JsonObject documentMessage,
        IStateModel store,
        IOrchestrator? orchestrator = null,
        bool validate = true,
        // Shared *context* stores keyed by namespace (ADR-0034). A binding whose path targets one of
        // these namespaces reads/writes the shared store instead of local kernel state; passing the
        // same instance to several kernels is how they share one source of truth.
        IReadOnlyDictionary<string, IStateModel>? contexts = null)
    {
        if (validate) Validator.ValidateDocument(documentMessage);

        var manifest = Json.Unwrap(manifestMessage);
        _doc = Json.Unwrap(documentMessage);
        _store = contexts is { Count: > 0 } ? new CompositeStateModel(store, contexts) : store;
        _registry = ManifestRegistry.FromManifest(manifest);
        _expr = new JsonataExpressionProvider();
        // Predicate positions (gates + guards) are adversarial: default them to the safe subset.
        _predicateExpr = new JsonataExpressionProvider(safe: true);
        _orchestrator = orchestrator ?? new NullOrchestrator();
    }

    /// <summary>Seed machine states. Returns the baseline patch at rev 0.</summary>
    public Patch Init()
    {
        var ops = new List<PatchOp>();
        if (_doc["machines"] is JsonArray machines)
            foreach (var mn in machines)
            {
                var m = mn!.AsObject();
                ops.Add(new PatchOp("set", $"{m["context"]!.GetValue<string>()}.state", JsonValue.Create(m["initial"]!.GetValue<string>())));
            }
        _store.Apply(ops);
        return new Patch(_rev, ops);
    }

    /// <summary>Seed machine states (via <see cref="Init"/>) and return the FULL current state as a
    /// baseline patch (rev 0). Unlike <see cref="Init"/>, this carries every namespace, so a fresh
    /// remote client can reconstruct the complete state replica from one patch.</summary>
    public Patch Baseline()
    {
        Init();
        return SnapshotPatch();
    }

    /// <summary>The full current state as a patch at the CURRENT rev, without re-seeding machine
    /// states. Used to re-onboard a client mid-session (reconnect / late join) without clobbering
    /// live machine state the way <see cref="Init"/> would.</summary>
    public Patch SnapshotPatch()
    {
        var ops = new List<PatchOp>();
        foreach (var (ns, value) in _store.Snapshot())
            ops.Add(new PatchOp("set", ns, value?.DeepClone()));
        return new Patch(_rev, ops);
    }

    /// <summary>Reduce an event to a patch, run any resulting orchestrator effects (and the
    /// follow-up events they produce), apply everything, and advance the revision by one.
    /// One dispatch = one rev, regardless of how many effects/events it fans out to.</summary>
    public Patch Dispatch(GupEvent evt)
    {
        if (!_reactionsSeeded) SeedReactionBaseline();
        var acc = new List<PatchOp>();
        Settle(evt, acc, 0);
        _rev += 1;
        return new Patch(_rev, acc);
    }

    private void Settle(GupEvent evt, List<PatchOp> acc, int depth)
    {
        if (depth > MaxSettleDepth)
            throw new InvalidOperationException("GenUI kernel: effect/event depth exceeded");

        var (ops, effects) = Reducer.Reduce(_doc, _store, evt, _expr, _predicateExpr);
        _store.Apply(ops);
        acc.AddRange(ops);

        RunEffects(effects, acc, depth);
        RunReactions(acc, depth);
    }

    private void RunEffects(IReadOnlyList<Effect> effects, List<PatchOp> acc, int depth)
    {
        foreach (var effect in effects)
        {
            var result = effect.Kind switch
            {
                "invoke" => _orchestrator.Invoke(effect),
                "confirm" => _orchestrator.Confirm(effect),
                _ => _orchestrator.Navigate(effect),
            };
            if (result is null) continue;

            if (result.Ops is { Count: > 0 })
            {
                _store.Apply(result.Ops);
                acc.AddRange(result.Ops);
            }
            foreach (var followUp in result.Events ?? Array.Empty<GupEvent>())
                Settle(followUp, acc, depth + 1);
        }
    }

    // Every reaction in the document, flattened with a stable key (`${nodeId}#${index}`).
    private IReadOnlyList<(string Key, string NodeId, JsonObject Reaction)> Reactions()
    {
        var found = new List<(string, string, JsonObject)>();
        void Walk(JsonObject n)
        {
            var nodeId = n["id"]!.GetValue<string>();
            if (n["edges"]?["react"] is JsonArray react)
                for (var i = 0; i < react.Count; i++)
                    found.Add(($"{nodeId}#{i}", nodeId, react[i]!.AsObject()));
            if (n["edges"]?["children"] is JsonArray children)
                foreach (var child in children) Walk(child!.AsObject());
        }
        Walk(_doc["root"]!.AsObject());
        return found;
    }

    // Record each reaction's current `when` value WITHOUT firing, so the first real change fires.
    private void SeedReactionBaseline()
    {
        var snapshot = _store.Snapshot();
        foreach (var (key, _, reaction) in Reactions())
            _reactionBaseline[key] = _expr.Eval(reaction["when"]!.GetValue<string>(), snapshot);
        _reactionsSeeded = true;
    }

    // Fire every reaction whose `when` value changed, cascading until the document quiesces. Shares the
    // same depth guard as effects, so a reaction that flips its own `when` cannot loop unbounded.
    private void RunReactions(List<PatchOp> acc, int depth)
    {
        if (depth > MaxSettleDepth)
            throw new InvalidOperationException("GenUI kernel: reaction depth exceeded");

        var fired = true;
        var sweeps = 0;
        while (fired)
        {
            if (sweeps++ > MaxSettleDepth)
                throw new InvalidOperationException("GenUI kernel: reaction depth exceeded");
            fired = false;
            foreach (var (key, nodeId, reaction) in Reactions())
            {
                var value = _expr.Eval(reaction["when"]!.GetValue<string>(), _store.Snapshot());
                if (!_reactionBaseline.ContainsKey(key))
                {
                    _reactionBaseline[key] = value;
                    continue;
                }
                if (JsonEqual(_reactionBaseline[key], value)) continue;
                _reactionBaseline[key] = value;
                fired = true;

                var run = reaction["run"] as JsonArray ?? new JsonArray();
                var bindings = new Dictionary<string, JsonNode?> { ["when"] = value?.DeepClone() };
                var (rOps, rEffects, rEmitted) =
                    Reducer.ReduceActions(_store, nodeId, run, _expr, _predicateExpr, bindings);
                _store.Apply(rOps);
                acc.AddRange(rOps);
                RunEffects(rEffects, acc, depth + 1);
                foreach (var ev in rEmitted) Settle(ev, acc, depth + 1);
            }
        }
    }

    public ResolvedNode Resolve() => Interpreter.Resolve(_doc["root"]!.AsObject(), _store, _registry, _expr, _predicateExpr);
}
