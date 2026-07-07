// The leaf/capability authoring track — a SEPARATE validator from document authoring. Document
// validation asks "does this document use capabilities correctly?"; this asks "is this capability
// definition well-formed?". Growing the vocabulary is a different, more privileged act than using
// it, so it gets its own entry point. JSON in, JSON out; nothing hardcoded per profile.
//
// Errors (malformed definition — would break the platform): missing id; propsSchema not an object;
// emits/slots not string arrays; dataProp not a string.
// Warnings (semantically suspect, non-fatal — graceful fallback covers them at runtime):
//   dataprop-not-in-schema, missing-render-binding, shadows-floor.

using System.Text.Json.Nodes;

namespace GenUI.AgentFace;

public static class CapabilityAuthoring
{
    /// <summary>Validate a capability descriptor (<c>{ id, propsSchema?, emits?, slots?, dataProp? }</c>)
    /// as a definition. An optional registry view (<c>{ bindings?:[], floor?:[] }</c>) enables the
    /// render-binding and floor-shadow warnings. Returns <c>{ ok, errors:[{detail}], warnings:[{code,node?,detail}] }</c>.</summary>
    public static JsonObject ValidateCapability(JsonObject capability, JsonObject? registryView = null)
    {
        var cap = Catalog.Unwrap(capability);
        var errors = new JsonArray();
        var warnings = new JsonArray();

        var id = AsString(cap["id"]);
        void Err(string detail) => errors.Add(new JsonObject { ["detail"] = detail });
        void Warn(string code, string detail)
        {
            var w = new JsonObject { ["code"] = code, ["detail"] = detail };
            if (id is not null) w["node"] = id;
            warnings.Add(w);
        }

        if (string.IsNullOrEmpty(id))
            Err("capability.id (non-empty string) is required");

        JsonObject? propsSchema = null;
        if (cap["propsSchema"] is JsonNode ps)
        {
            propsSchema = ps as JsonObject;
            if (propsSchema is null)
                Err("capability.propsSchema must be an object (JSON Schema)");
        }

        if (cap["emits"] is JsonNode em)
        {
            if (em is not JsonArray emArr) Err("capability.emits must be an array of strings");
            else foreach (var e in emArr) if (AsString(e) is null) { Err("capability.emits entries must be strings"); break; }
        }

        if (cap["slots"] is JsonNode sl)
        {
            if (sl is not JsonArray slArr) Err("capability.slots must be an array of strings");
            else foreach (var s in slArr) if (AsString(s) is null) { Err("capability.slots entries must be strings"); break; }
        }

        if (cap["dataProp"] is JsonNode dp)
        {
            var dataProp = AsString(dp);
            if (dataProp is null) Err("capability.dataProp must be a string");
            else if (propsSchema?["properties"] is JsonObject props && !props.ContainsKey(dataProp))
                Warn("dataprop-not-in-schema", $"dataProp '{dataProp}' is not a property of propsSchema");
        }

        if (registryView is not null && !string.IsNullOrEmpty(id))
        {
            var view = Catalog.Unwrap(registryView);
            var bindings = ToStringSet(view["bindings"] as JsonArray);
            var floor = ToStringSet(view["floor"] as JsonArray);
            if (bindings.Count > 0 && !bindings.Contains(id!))
                Warn("missing-render-binding", $"capability '{id}' has no render binding in the registry");
            if (floor.Contains(id!))
                Warn("shadows-floor", $"capability '{id}' shadows a shared-floor capability (additive overlay wins on collision)");
        }

        return new JsonObject
        {
            ["ok"] = errors.Count == 0,
            ["errors"] = errors,
            ["warnings"] = warnings,
        };
    }

    private static string? AsString(JsonNode? n) =>
        n is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;

    private static HashSet<string> ToStringSet(JsonArray? arr)
    {
        var set = new HashSet<string>();
        if (arr is not null)
            foreach (var item in arr)
                if (AsString(item) is string s) set.Add(s);
        return set;
    }
}
