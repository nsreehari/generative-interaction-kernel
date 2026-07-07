// Provider seams and in-memory reference implementations: the namespaced store,
// the capability registry, and the expression provider interface.

using System.Text.Json.Nodes;

namespace GenUI.Kernel;

/// <summary>Evaluates a manifest-dialect expression against store data with optional
/// bound variables (e.g. $event). The seam that keeps the reducer pure.</summary>
public interface IExpressionProvider
{
    JsonNode? Eval(string expr, JsonObject data, IReadOnlyDictionary<string, JsonNode?>? bindings = null);
}

/// <summary>The store seam: a namespaced key/value model the reducer reads and the kernel writes.
/// Kept an interface so a document's local store can be overlaid with shared *context* stores
/// (see <see cref="CompositeStateModel"/>). Mirrors the StateModel interface in providers.ts.</summary>
public interface IStateModel
{
    JsonObject Snapshot();
    JsonNode? Get(string path);
    void Apply(IEnumerable<PatchOp> ops);
}

/// <summary>Mutable in-memory store keyed by namespace roots.</summary>
public sealed class InMemoryStateModel : IStateModel
{
    private readonly JsonObject _data = new();

    public InMemoryStateModel(IEnumerable<string> namespaces)
    {
        foreach (var ns in namespaces) _data[ns] = new JsonObject();
    }

    /// <summary>The live namespaced object (expression input root). Reads clone, so the
    /// store is never mutated by resolution or reduction — only by <see cref="Apply"/>.</summary>
    public JsonObject Snapshot() => _data;

    public JsonNode? Get(string path) => Json.GetPath(_data, path);

    public void Apply(IEnumerable<PatchOp> ops)
    {
        foreach (var op in ops) Json.ApplyOp(_data, op);
    }
}

/// <summary>Overlays one or more shared *context* namespaces on top of a document's local store
/// (ADR-0034). A binding's scope is simply the head segment of its path: if that namespace names a
/// context, reads and writes route to the shared store; otherwise they stay local. This is what makes
/// `context` a scope, not a new verb — read/assign/derive are unchanged; only which store their path
/// resolves against differs. Kernels sharing the same context <see cref="IStateModel"/> instance
/// thereby read and write one source of truth. Mirrors CompositeStateModel in providers.ts.</summary>
public sealed class CompositeStateModel : IStateModel
{
    private readonly IStateModel _local;
    // namespace -> the shared store that owns it (the same instance may own several namespaces).
    private readonly IReadOnlyDictionary<string, IStateModel> _contexts;

    public CompositeStateModel(IStateModel local, IReadOnlyDictionary<string, IStateModel> contexts)
    {
        _local = local;
        _contexts = contexts;
    }

    private static string HeadSegment(string path)
    {
        var dot = path.IndexOf('.');
        return dot == -1 ? path : path[..dot];
    }

    private IStateModel StoreFor(string path) =>
        _contexts.TryGetValue(HeadSegment(path), out var ctx) ? ctx : _local;

    public JsonObject Snapshot()
    {
        // A fresh merged object: JsonNodes cannot be reparented, so context/local values are cloned
        // in. Callers treat the snapshot as read-only (expression input), so cloning is safe.
        var merged = new JsonObject();
        foreach (var (ns, value) in _local.Snapshot())
            merged[ns] = value?.DeepClone();
        foreach (var (ns, store) in _contexts)
            merged[ns] = store.Snapshot()[ns]?.DeepClone();
        return merged;
    }

    public JsonNode? Get(string path) => StoreFor(path).Get(path);

    public void Apply(IEnumerable<PatchOp> ops)
    {
        foreach (var op in ops) StoreFor(op.Path).Apply(new[] { op });
    }
}

/// <summary>The seam where invoke/confirm/navigate actions reach out to do real work
/// (tool calls, HITL approval, routing). It owns time and side effects; the kernel and
/// reducer stay pure. Any method may return null to leave the effect unhandled.</summary>
public interface IOrchestrator
{
    OrchestratorResult? Invoke(Effect effect);
    OrchestratorResult? Confirm(Effect effect);
    OrchestratorResult? Navigate(Effect effect);
}

/// <summary>Default no-op orchestrator: effects are collected but perform nothing.</summary>
public sealed class NullOrchestrator : IOrchestrator
{
    public OrchestratorResult? Invoke(Effect effect) => null;
    public OrchestratorResult? Confirm(Effect effect) => null;
    public OrchestratorResult? Navigate(Effect effect) => null;
}

/// <summary>Capability lookup derived from the manifest.</summary>
public sealed class ManifestRegistry
{
    private readonly JsonObject _caps;

    private ManifestRegistry(JsonObject caps) => _caps = caps;

    public static ManifestRegistry FromManifest(JsonObject manifestPayload) =>
        new(manifestPayload["capabilities"] as JsonObject ?? new JsonObject());

    public bool Has(string type) => _caps.ContainsKey(type);
}
