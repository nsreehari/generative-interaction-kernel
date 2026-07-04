// Bridges the native C# JSONata engine (GenUI.Jsonata) to the kernel's IExpressionProvider seam.
// The kernel speaks System.Text.Json.Nodes; the engine uses its own value model, so this adapter
// converts input/bindings in and the result out. A JSONata `undefined` result is normalized to null,
// matching the reducer/runner contract (truthy() reads absent paths as falsy).

using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using GenUI.Jsonata;

namespace GenUI.Kernel;

/// <summary>Full JSONata expression provider backed by the native <see cref="JsonataEngine"/> port.</summary>
public sealed class JsonataExpressionProvider : IExpressionProvider
{
    private readonly ConcurrentDictionary<string, JsonataEngine> _cache = new();

    public JsonNode? Eval(string expr, JsonObject data, IReadOnlyDictionary<string, JsonNode?>? bindings = null)
    {
        var engine = _cache.GetOrAdd(expr, JsonataEngine.Compile);

        Dictionary<string, object?>? boundValues = null;
        if (bindings is { Count: > 0 })
        {
            boundValues = new Dictionary<string, object?>(bindings.Count);
            foreach (var kv in bindings) boundValues[kv.Key] = FromNode(kv.Value);
        }

        var result = engine.Evaluate(FromNode(data), boundValues);
        return ToNode(result);
    }

    // ---- value-model conversions --------------------------------------------

    private static object? FromNode(JsonNode? node)
    {
        switch (node)
        {
            case null:
                return null;
            case JsonObject obj:
                {
                    var dict = new Dictionary<string, object?>(obj.Count);
                    foreach (var kv in obj) dict[kv.Key] = FromNode(kv.Value);
                    return dict;
                }
            case JsonArray arr:
                {
                    var list = new JArr();
                    foreach (var item in arr) list.Add(FromNode(item));
                    return list;
                }
            case JsonValue val:
                return val.GetValueKind() switch
                {
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    JsonValueKind.String => val.GetValue<string>(),
                    JsonValueKind.Number => val.GetValue<double>(),
                    _ => null,
                };
            default:
                return null;
        }
    }

    private static JsonNode? ToNode(object? value)
    {
        switch (value)
        {
            case null:
                return null;
            case bool b:
                return JsonValue.Create(b);
            case double d:
                return JsonValue.Create(d);
            case string s:
                return JsonValue.Create(s);
            case JArr arr:
                {
                    var jarr = new JsonArray();
                    foreach (var item in arr) jarr.Add(ToNode(item));
                    return jarr;
                }
            case Dictionary<string, object?> obj:
                {
                    var jobj = new JsonObject();
                    foreach (var kv in obj) jobj[kv.Key] = ToNode(kv.Value);
                    return jobj;
                }
            default:
                // JSONata undefined and function values normalize to null
                return null;
        }
    }
}
