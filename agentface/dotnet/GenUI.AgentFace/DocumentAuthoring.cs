// The document authoring surface: validate-before-commit (structural, throwing on the commit
// path) plus non-throwing reference linting against a manifest. JSON in, JSON out — the C#
// peer of kernel/src/authoring.ts's authorDocument + lintManifestReferences. Nothing is
// hardcoded per profile: every check is relative to the manifest handed in, so the same
// functions serve any onboarded vocabulary.

using System.Text.Json.Nodes;
using GenUI.Kernel;

namespace GenUI.AgentFace;

public static class DocumentAuthoring
{
    /// <summary>Dry-run a document against a manifest without committing. Never throws: returns
    /// <c>{ ok, errors:[{detail}], warnings:[{code,node?,detail}] }</c> where <c>errors</c> come from
    /// structural validate-before-commit and <c>warnings</c> from reference linting.</summary>
    public static JsonObject ValidateDocument(JsonObject manifest, JsonObject documentPayload)
    {
        var errors = new JsonArray();
        try
        {
            Validator.ValidateDocument(Gup.Message("document", documentPayload));
        }
        catch (ValidationException ex)
        {
            errors.Add(new JsonObject { ["detail"] = ex.Message });
        }

        return new JsonObject
        {
            ["ok"] = errors.Count == 0,
            ["errors"] = errors,
            ["warnings"] = Lint(manifest, documentPayload),
        };
    }

    /// <summary>Commit path: structural validate (throws inside), then return the wire message.
    /// Returns <c>{ ok:true, message, warnings }</c> on success, or <c>{ ok:false, error, warnings }</c>
    /// when the document is structurally invalid — the JSON expression of validate-before-commit.
    /// A manifest is optional; when supplied, reference warnings ride along.</summary>
    public static JsonObject AuthorDocument(JsonObject documentPayload, JsonObject? manifest = null)
    {
        var message = Gup.Message("document", documentPayload);
        var warnings = manifest is null ? new JsonArray() : Lint(manifest, documentPayload);
        try
        {
            Validator.ValidateDocument(message);
        }
        catch (ValidationException ex)
        {
            return new JsonObject { ["ok"] = false, ["error"] = ex.Message, ["warnings"] = warnings };
        }
        return new JsonObject { ["ok"] = true, ["message"] = message, ["warnings"] = warnings };
    }

    /// <summary>Reference lint (non-throwing): warnings for references that are structurally valid
    /// but not backed by the manifest vocabulary. Port of lintManifestReferences — codes:
    /// unknown-capability, undeclared-event, undeclared-namespace, undeclared-effect. Unknown
    /// capabilities are safe at runtime via graceful fallback, hence lint rather than error.</summary>
    public static JsonArray Lint(JsonObject manifest, JsonObject documentPayload)
    {
        var m = Catalog.Unwrap(manifest);
        var doc = Catalog.Unwrap(documentPayload);
        var warnings = new JsonArray();

        var capabilities = m["capabilities"] as JsonObject ?? new JsonObject();
        var namespaces = ToStringSet(m["namespaces"] as JsonArray);
        // Effects are linted only when the bundle opts in by declaring externals.effects; the
        // contract is authoritative once present, but unmigrated bundles are left alone.
        var declaredEffects = (m["externals"] as JsonObject)?["effects"] as JsonArray;
        var effectSet = ToStringSet(declaredEffects);

        void Warn(string code, string? node, string detail)
        {
            var w = new JsonObject { ["code"] = code, ["detail"] = detail };
            if (node is not null) w["node"] = node;
            warnings.Add(w);
        }

        void CheckNs(string path, string id, string where)
        {
            var ns = FirstSegment(path);
            if (namespaces.Count > 0 && !namespaces.Contains(ns))
                Warn("undeclared-namespace", id, $"{where} references undeclared namespace '{ns}' (path '{path}')");
        }

        void Walk(JsonObject n)
        {
            var id = AsString(n["id"]) ?? "";
            var capName = AsString(n["capability"]) ?? "";
            var cap = capabilities[capName] as JsonObject;
            if (!capabilities.ContainsKey(capName))
                Warn("unknown-capability", id, $"capability '{capName}' is not declared in the manifest");

            var edges = n["edges"] as JsonObject;

            if (edges?["read"] is JsonObject read)
                foreach (var kv in read)
                    if (AsString(kv.Value) is string path) CheckNs(path, id, "read");

            if (edges?["write"] is JsonObject write)
                foreach (var kv in write)
                    if (AsString((kv.Value as JsonObject)?["to"]) is string to) CheckNs(to, id, "write");

            if (edges?["on"] is JsonObject on)
            {
                var emits = ToStringSet(cap?["emits"] as JsonArray);
                foreach (var kv in on)
                {
                    var evt = kv.Key;
                    if (cap?["emits"] is JsonArray && !emits.Contains(evt))
                        Warn("undeclared-event", id, $"handles event '{evt}' not declared in capability '{capName}' emits");

                    if (kv.Value is JsonArray actions)
                        foreach (var a in actions)
                        {
                            if (a is not JsonObject action) continue;
                            var doName = AsString(action["do"]) ?? "";
                            if (AsString(action["target"]) is string target)
                                CheckNs(target, id, $"action '{doName}' target");
                            if (declaredEffects is not null && doName == "invoke")
                            {
                                var tool = AsString((action["args"] as JsonObject)?["tool"]);
                                if (tool is not null && !effectSet.Contains(tool))
                                    Warn("undeclared-effect", id, $"invokes effect '{tool}' not declared in manifest externals.effects");
                            }
                        }
                }
            }

            if (edges?["children"] is JsonArray children)
                foreach (var child in children)
                    if (child is JsonObject c) Walk(c);
        }

        if (doc["root"] is JsonObject root) Walk(root);
        return warnings;
    }

    private static string FirstSegment(string path)
    {
        var i = path.IndexOf('.');
        return i < 0 ? path : path[..i];
    }

    private static HashSet<string> ToStringSet(JsonArray? arr)
    {
        var set = new HashSet<string>();
        if (arr is not null)
            foreach (var item in arr)
                if (AsString(item) is string s) set.Add(s);
        return set;
    }

    private static string? AsString(JsonNode? n) =>
        n is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
}
