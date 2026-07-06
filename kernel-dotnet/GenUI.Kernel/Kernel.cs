// The reference C# kernel: holds the store, applies the pure reducer, emits patches.
// One dispatch = one patch = one rev, even when ops is empty. Deferred effects
// (invoke/confirm/navigate) are routed through the Orchestrator seam and settled
// within the same dispatch. Mirrors kernel.ts.

using System.Text.Json.Nodes;

namespace GenUI.Kernel;

public sealed class Kernel
{
    private const int MaxSettleDepth = 32;

    private readonly JsonObject _doc;
    private readonly InMemoryStateModel _store;
    private readonly ManifestRegistry _registry;
    private readonly IExpressionProvider _expr;
    private readonly IExpressionProvider _predicateExpr;
    private readonly IOrchestrator _orchestrator;
    private int _rev;

    public Kernel(
        JsonObject manifestMessage,
        JsonObject documentMessage,
        InMemoryStateModel store,
        IOrchestrator? orchestrator = null,
        bool validate = true)
    {
        if (validate) Validator.ValidateDocument(documentMessage);

        var manifest = Json.Unwrap(manifestMessage);
        _doc = Json.Unwrap(documentMessage);
        _store = store;
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

    public ResolvedNode Resolve() => Interpreter.Resolve(_doc["root"]!.AsObject(), _store, _registry, _expr, _predicateExpr);
}
