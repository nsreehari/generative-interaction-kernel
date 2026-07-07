// Discovery projection: turn a manifest (the profile's declared vocabulary) into a flat
// catalog an authoring agent can read — capabilities with their schemas/emits, the declared
// namespaces, and the external effect handlers. Pure JSON in, JSON out; nothing capability-
// specific is hardcoded — the manifest handed in is the single source of truth. This is the
// C# peer of agentface/ts's describeCatalog.

using System.Text.Json.Nodes;

namespace GenUI.AgentFace;

public static class Catalog
{
    /// <summary>Project a manifest payload (bare payload or enveloped message) into a catalog:
    /// <c>{ capabilities:[{ id, propsSchema?, emits?, slots?, dataProp? }], namespaces:[], effects:[] }</c>.</summary>
    public static JsonObject Describe(JsonObject manifest)
    {
        var payload = Unwrap(manifest);
        var capabilities = new JsonArray();

        if (payload["capabilities"] is JsonObject caps)
        {
            foreach (var (id, descriptor) in caps)
            {
                var entry = new JsonObject { ["id"] = id };
                if (descriptor is JsonObject d)
                    foreach (var field in new[] { "propsSchema", "emits", "slots", "dataProp" })
                        if (d[field] is JsonNode v)
                            entry[field] = v.DeepClone();
                capabilities.Add(entry);
            }
        }

        return new JsonObject
        {
            ["capabilities"] = capabilities,
            ["namespaces"] = CloneArray(payload["namespaces"]),
            ["effects"] = CloneArray((payload["externals"] as JsonObject)?["effects"]),
        };
    }

    /// <summary>The declared state namespaces — the roots every read/write/target path must use.</summary>
    public static JsonArray Namespaces(JsonObject manifest) => CloneArray(Unwrap(manifest)["namespaces"]);

    /// <summary>The external effect handlers (legal <c>invoke</c> targets) the host must supply.</summary>
    public static JsonArray Effects(JsonObject manifest) =>
        CloneArray((Unwrap(manifest)["externals"] as JsonObject)?["effects"]);

    /// <summary>Unwrap a GUP envelope <c>{ gup, type, payload }</c> to its payload; a bare payload passes through.</summary>
    internal static JsonObject Unwrap(JsonObject message) => message["payload"] as JsonObject ?? message;

    private static JsonArray CloneArray(JsonNode? node) =>
        node is JsonArray arr ? (JsonArray)arr.DeepClone() : new JsonArray();
}
