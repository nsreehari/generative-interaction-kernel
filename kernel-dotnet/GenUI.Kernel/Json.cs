// Namespace-rooted JSON store helpers, patch-op semantics, structural equality,
// and truthiness. Mirrors the reference kernel's providers.ts + reduce.ts helpers
// so both kernels produce byte-for-byte equivalent observable behavior.

using System.Text.Json;
using System.Text.Json.Nodes;

namespace GenUI.Kernel;

public static class Json
{
    /// <summary>Read a dotted path from a namespaced object. Returns the LIVE node
    /// (or null when absent / a non-object is traversed). Internal use only.</summary>
    public static JsonNode? GetPathRaw(JsonObject root, string path)
    {
        JsonNode? cur = root;
        foreach (var part in path.Split('.'))
        {
            if (cur is JsonObject o)
                cur = o.TryGetPropertyValue(part, out var next) ? next : null;
            else
                return null;
        }
        return cur;
    }

    /// <summary>Public read: a detached deep clone so callers never alias the store.</summary>
    public static JsonNode? GetPath(JsonObject root, string path) => GetPathRaw(root, path)?.DeepClone();

    private static void SetPath(JsonObject root, string path, JsonNode? value)
    {
        var parts = path.Split('.');
        var cur = root;
        for (var i = 0; i < parts.Length - 1; i++)
        {
            if (cur.TryGetPropertyValue(parts[i], out var next) && next is JsonObject o)
            {
                cur = o;
            }
            else
            {
                var created = new JsonObject();
                cur[parts[i]] = created; // overwrites null / array / scalar, matching setPath()
                cur = created;
            }
        }
        cur[parts[^1]] = value?.DeepClone();
    }

    private static void RemovePath(JsonObject root, string path)
    {
        var parts = path.Split('.');
        var cur = root;
        for (var i = 0; i < parts.Length - 1; i++)
        {
            if (cur.TryGetPropertyValue(parts[i], out var next) && next is JsonObject o)
                cur = o;
            else
                return;
        }
        cur.Remove(parts[^1]);
    }

    /// <summary>set = replace, merge = shallow key-combine, remove = delete leaf.</summary>
    public static void ApplyOp(JsonObject root, PatchOp op)
    {
        switch (op.Op)
        {
            case "remove":
                RemovePath(root, op.Path);
                break;
            case "merge":
            {
                var merged = new JsonObject();
                if (GetPathRaw(root, op.Path) is JsonObject existing)
                    foreach (var kv in existing)
                        merged[kv.Key] = kv.Value?.DeepClone();
                if (op.Value is JsonObject incoming)
                    foreach (var kv in incoming)
                        merged[kv.Key] = kv.Value?.DeepClone();
                SetPath(root, op.Path, merged);
                break;
            }
            default: // "set"
                SetPath(root, op.Path, op.Value);
                break;
        }
    }

    /// <summary>Structural equality with JSON-number semantics (1 == 1.0); arrays are
    /// order-sensitive, objects key-order-insensitive. Matches the runner contract.</summary>
    public static bool DeepEquals(JsonNode? a, JsonNode? b)
    {
        if (a is null || b is null) return a is null && b is null;

        var ka = a.GetValueKind();
        var kb = b.GetValueKind();
        if (ka != kb) return false;

        switch (ka)
        {
            case JsonValueKind.Number:
                return a.GetValue<double>() == b.GetValue<double>();
            case JsonValueKind.String:
                return a.GetValue<string>() == b.GetValue<string>();
            case JsonValueKind.True:
            case JsonValueKind.False:
            case JsonValueKind.Null:
                return true;
            case JsonValueKind.Array:
            {
                var xa = a.AsArray();
                var xb = b.AsArray();
                if (xa.Count != xb.Count) return false;
                for (var i = 0; i < xa.Count; i++)
                    if (!DeepEquals(xa[i], xb[i])) return false;
                return true;
            }
            case JsonValueKind.Object:
            {
                var oa = a.AsObject();
                var ob = b.AsObject();
                if (oa.Count != ob.Count) return false;
                foreach (var kv in oa)
                {
                    if (!ob.TryGetPropertyValue(kv.Key, out var bv)) return false;
                    if (!DeepEquals(kv.Value, bv)) return false;
                }
                return true;
            }
            default:
                return true;
        }
    }

    /// <summary>truthy(v): only JSON null and false are falsy (0 and "" are truthy).</summary>
    public static bool Truthy(JsonNode? v) => v is not null && v.GetValueKind() != JsonValueKind.False;

    /// <summary>Unwrap an enveloped GUP message ({gup,type,payload}) to its payload,
    /// or return the object unchanged if it is already a bare payload.</summary>
    public static JsonObject Unwrap(JsonObject message) =>
        message.TryGetPropertyValue("payload", out var p) && p is JsonObject payload ? payload : message;
}
