using System.Text.Json;
using GenUI.Jsonata;

// Conformance runner: evaluates every case in ../../conformance/jsonata/corpus.json through the
// native C# JSONata engine and compares to `expected`. Expected values are generated from the
// canonical vendored engine, so this is the behavioral arbiter for the port. Result semantics are
// provider-normalized: a JSONata `undefined` is treated as null (matching JsonataExpressionProvider).

string here = AppContext.BaseDirectory;
string corpusPath = Path.GetFullPath(Path.Combine(here, "..", "..", "..", "..", "..", "conformance", "jsonata", "corpus.json"));
if (!File.Exists(corpusPath))
{
    Console.Error.WriteLine($"corpus not found at {corpusPath}");
    return 2;
}

using var doc = JsonDocument.Parse(File.ReadAllText(corpusPath));
var cases = doc.RootElement.GetProperty("cases");

int pass = 0, fail = 0;
var failures = new List<string>();

foreach (var c in cases.EnumerateArray())
{
    string name = c.GetProperty("name").GetString()!;
    string expr = c.GetProperty("expr").GetString()!;

    object? data = c.TryGetProperty("data", out var d) ? Json.FromElement(d) : J.Undefined;

    IReadOnlyDictionary<string, object?>? bindings = null;
    if (c.TryGetProperty("bindings", out var b))
    {
        var map = new Dictionary<string, object?>();
        foreach (var prop in b.EnumerateObject()) map[prop.Name] = Json.FromElement(prop.Value);
        bindings = map;
    }

    object? expected = c.TryGetProperty("expected", out var e) ? Json.FromElement(e) : null;

    try
    {
        var engine = JsonataEngine.Compile(expr);
        var actual = Normalize(engine.Evaluate(data, bindings));

        if (DeepEqual(actual, expected))
        {
            pass++;
        }
        else
        {
            fail++;
            failures.Add($"  FAIL {name}: {expr}\n       expected {Json.Stringify(expected)}\n       actual   {Json.Stringify(actual)}");
        }
    }
    catch (Exception ex)
    {
        fail++;
        string msg = ex is JsonataException je ? je.Code : ex.GetType().Name + ": " + ex.Message;
        failures.Add($"  FAIL {name}: {expr}\n       expected {Json.Stringify(expected)}\n       threw    {msg}");
    }
}

foreach (var f in failures) Console.WriteLine(f);
Console.WriteLine($"\nJSONata conformance: {pass} passed, {fail} failed ({pass + fail} total)");
return fail == 0 ? 0 : 1;

// Convert engine output to the comparison model: undefined -> null (provider normalization).
static object? Normalize(object? value)
{
    if (J.IsUndef(value)) return null;
    if (value is JArr arr)
    {
        var outList = new JArr();
        foreach (var item in arr) outList.Add(Normalize(item));
        return outList;
    }
    if (value is Dictionary<string, object?> obj)
    {
        var outObj = new Dictionary<string, object?>();
        foreach (var kv in obj) outObj[kv.Key] = Normalize(kv.Value);
        return outObj;
    }
    return value;
}

static bool DeepEqual(object? a, object? b)
{
    if (a is null && b is null) return true;
    if (a is null || b is null) return false;
    if (a is double da && b is double db) return da == db;
    if (a is string sa && b is string sb) return sa == sb;
    if (a is bool ba && b is bool bb) return ba == bb;
    if (a is JArr la && b is JArr lb)
    {
        if (la.Count != lb.Count) return false;
        for (int i = 0; i < la.Count; i++) if (!DeepEqual(la[i], lb[i])) return false;
        return true;
    }
    if (a is Dictionary<string, object?> oa && b is Dictionary<string, object?> ob)
    {
        if (oa.Count != ob.Count) return false;
        foreach (var kv in oa)
        {
            if (!ob.TryGetValue(kv.Key, out var rv)) return false;
            if (!DeepEqual(kv.Value, rv)) return false;
        }
        return true;
    }
    return false;
}
