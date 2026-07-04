// The reference C# kernel: holds the store, applies the pure reducer, emits patches.
// One dispatch = one patch = one rev, even when ops is empty. Mirrors kernel.ts
// (the conformance path: no Orchestrator, so deferred effects produce no ops).

using System.Text.Json.Nodes;

namespace GenUI.Kernel;

public sealed class Kernel
{
    private readonly JsonObject _doc;
    private readonly InMemoryStateModel _store;
    private readonly ManifestRegistry _registry;
    private readonly IExpressionProvider _expr;
    private int _rev;

    public Kernel(JsonObject manifestMessage, JsonObject documentMessage, InMemoryStateModel store, bool validate = true)
    {
        if (validate) Validator.ValidateDocument(documentMessage);

        var manifest = Json.Unwrap(manifestMessage);
        _doc = Json.Unwrap(documentMessage);
        _store = store;
        _registry = ManifestRegistry.FromManifest(manifest);
        _expr = new MiniJsonataProvider();
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

    /// <summary>Reduce an event to a patch, apply it, and advance the revision by one.</summary>
    public Patch Dispatch(GupEvent evt)
    {
        var (ops, _) = Reducer.Reduce(_doc, _store, evt, _expr);
        _store.Apply(ops);
        _rev += 1;
        return new Patch(_rev, ops);
    }

    public ResolvedNode Resolve() => Interpreter.Resolve(_doc["root"]!.AsObject(), _store, _registry, _expr);
}
