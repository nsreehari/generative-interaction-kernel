// Core value types shared across the C# kernel. Deliberately small — the wire
// contract is JSON, so these are thin records over System.Text.Json nodes.

using System.Text.Json.Nodes;

namespace GenUI.Kernel;

/// <summary>A single store mutation. Value is absent for "remove".</summary>
public sealed record PatchOp(string Op, string Path, JsonNode? Value);

/// <summary>The result of one dispatch (or the init baseline): a revision + ordered ops.</summary>
public sealed record Patch(int Rev, IReadOnlyList<PatchOp> Ops);

/// <summary>A stateless interaction event addressed to a node.</summary>
public sealed record GupEvent(string Node, string Name, JsonObject? Payload);

/// <summary>A deferred Orchestrator effect (invoke/confirm/navigate). Collected by the
/// reducer but only executed when an Orchestrator is present; the conformance runner
/// uses none, so effects never produce store ops (mirrors the reference kernel).</summary>
public sealed record Effect(string Kind, string Node);

/// <summary>A resolved, renderable node.</summary>
public sealed class ResolvedNode
{
    public required string Capability { get; init; }
    public required string Id { get; init; }
    public required JsonObject Props { get; init; }
    public required bool Visible { get; init; }
    public required bool Fallback { get; init; }
    public required IReadOnlyList<ResolvedNode> Children { get; init; }
}
