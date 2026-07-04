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

/// <summary>Mutable in-memory store keyed by namespace roots.</summary>
public sealed class InMemoryStateModel
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
