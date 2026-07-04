// Behavioral conformance runner for the C# kernel. Loads every language-neutral case
// under conformance/cases/ and executes it — seed -> init -> initial-resolve -> each
// event step's exact patch and resolved-tree assertions — proving reducer equivalence
// with the TypeScript reference kernel over the SAME JSON files.
//
// The semantics asserted here are the runner contract (conformance/README.md, ADR-0023).

using System.Runtime.CompilerServices;
using System.Text.Json.Nodes;
using GenUI.Kernel;

var casesDir = Path.GetFullPath(Path.Combine(ThisDir(), "..", "..", "conformance", "cases"));
if (!Directory.Exists(casesDir))
{
    Console.Error.WriteLine($"cases directory not found: {casesDir}");
    return 1;
}

var files = Directory.GetFiles(casesDir, "*.case.json").OrderBy(f => f, StringComparer.Ordinal).ToArray();
if (files.Length == 0)
{
    Console.Error.WriteLine("expected at least one conformance case");
    return 1;
}

Console.WriteLine("GenUI C# kernel — behavioral conformance matrix:");
var failures = 0;
foreach (var file in files)
{
    var name = Path.GetFileName(file);
    try
    {
        RunCase(file, casesDir);
        Console.WriteLine($"  PASS  case {name}");
    }
    catch (Exception ex)
    {
        failures++;
        Console.WriteLine($"  FAIL  case {name}");
        Console.WriteLine($"        {ex.Message}");
    }
}

Console.WriteLine();
Console.WriteLine(failures == 0
    ? $"OK: all {files.Length} conformance cases passed (C# kernel)."
    : $"FAILED: {failures} of {files.Length} case(s).");
return failures == 0 ? 0 : 1;

static void RunCase(string file, string casesDir)
{
    var c = JsonNode.Parse(File.ReadAllText(file))!.AsObject();

    var manifest = c["manifest"] as JsonObject ?? LoadRef(casesDir, file, c["manifestRef"]!.GetValue<string>());
    var document = c["document"] as JsonObject ?? LoadRef(casesDir, file, c["documentRef"]!.GetValue<string>());

    if (c["expectInvalid"]?.GetValue<bool>() == true)
    {
        var threw = false;
        try
        {
            var ns0 = Namespaces(manifest);
            _ = new Kernel(manifest, document, new InMemoryStateModel(ns0));
        }
        catch (ValidationException)
        {
            threw = true;
        }
        if (!threw) throw new Exception("expected construction to fail validation, but it succeeded");
        return;
    }

    var store = new InMemoryStateModel(Namespaces(manifest));
    if (c["seed"] is JsonArray seed)
        store.Apply(seed.Select(ToOp).ToList());

    var orchestrator = c["orchestrator"] is JsonArray script ? new ScriptedOrchestrator(script) : null;
    var kernel = new Kernel(manifest, document, store, orchestrator);
    kernel.Init();

    if (c["expectInitialResolve"] is JsonArray initial)
        AssertResolve(kernel.Resolve(), initial);

    if (c["steps"] is JsonArray steps)
        foreach (var sn in steps)
        {
            var step = sn!.AsObject();
            var ev = step["event"]!.AsObject();
            var patch = kernel.Dispatch(new GupEvent(
                ev["node"]!.GetValue<string>(),
                ev["name"]!.GetValue<string>(),
                ev["payload"] as JsonObject));

            if (step["expectPatch"] is JsonObject expectPatch) AssertPatch(expectPatch, patch);
            if (step["expectResolve"] is JsonArray expectResolve) AssertResolve(kernel.Resolve(), expectResolve);
        }
}

static JsonObject LoadRef(string casesDir, string caseFile, string reference)
{
    var path = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(caseFile)!, reference));
    return JsonNode.Parse(File.ReadAllText(path))!.AsObject();
}

static IEnumerable<string> Namespaces(JsonObject manifestMessage)
{
    var payload = Json.Unwrap(manifestMessage);
    return payload["namespaces"] is JsonArray ns
        ? ns.Select(n => n!.GetValue<string>())
        : Enumerable.Empty<string>();
}

static PatchOp ToOp(JsonNode? node)
{
    var o = node!.AsObject();
    var value = o.TryGetPropertyValue("value", out var v) ? v?.DeepClone() : null;
    return new PatchOp(o["op"]!.GetValue<string>(), o["path"]!.GetValue<string>(), value);
}

static void AssertPatch(JsonObject expected, Patch actual)
{
    var rev = expected["rev"]!.GetValue<int>();
    if (actual.Rev != rev) throw new Exception($"rev: expected {rev}, got {actual.Rev}");

    var ops = expected["ops"]!.AsArray();
    if (ops.Count != actual.Ops.Count)
        throw new Exception($"ops count: expected {ops.Count}, got {actual.Ops.Count}");

    for (var i = 0; i < ops.Count; i++)
    {
        var e = ops[i]!.AsObject();
        var a = actual.Ops[i];
        if (e["op"]!.GetValue<string>() != a.Op) throw new Exception($"ops[{i}].op: expected {e["op"]}, got {a.Op}");
        if (e["path"]!.GetValue<string>() != a.Path) throw new Exception($"ops[{i}].path: expected {e["path"]}, got {a.Path}");
        var ev = e.TryGetPropertyValue("value", out var vv) ? vv : null;
        if (!Json.DeepEquals(ev, a.Value)) throw new Exception($"ops[{i}].value mismatch at {a.Path}");
    }
}

static void AssertResolve(ResolvedNode tree, JsonArray expects)
{
    foreach (var en in expects)
    {
        var e = en!.AsObject();
        var id = e["id"]!.GetValue<string>();
        var n = Find(tree, id) ?? throw new Exception($"expected node '{id}' in resolved tree");

        if (e.TryGetPropertyValue("visible", out var vis) && n.Visible != vis!.GetValue<bool>())
            throw new Exception($"{id}.visible: expected {vis}, got {n.Visible}");
        if (e.TryGetPropertyValue("fallback", out var fb) && n.Fallback != fb!.GetValue<bool>())
            throw new Exception($"{id}.fallback: expected {fb}, got {n.Fallback}");
        if (e.TryGetPropertyValue("capability", out var cap) && n.Capability != cap!.GetValue<string>())
            throw new Exception($"{id}.capability: expected {cap}, got {n.Capability}");
        if (e["props"] is JsonObject props)
            foreach (var kv in props)
            {
                var got = n.Props.TryGetPropertyValue(kv.Key, out var pv) ? pv : null;
                if (!Json.DeepEquals(got, kv.Value)) throw new Exception($"{id}.props.{kv.Key} mismatch");
            }
    }
}

static ResolvedNode? Find(ResolvedNode node, string id)
{
    if (node.Id == id) return node;
    foreach (var child in node.Children)
        if (Find(child, id) is { } hit)
            return hit;
    return null;
}

static string ThisDir([CallerFilePath] string path = "") => Path.GetDirectoryName(path)!;

// A deterministic, canned Orchestrator built from a case's `orchestrator` script: each
// entry matches an effect (kind + optional node/tool) and returns fixed ops/events,
// settled inside the same dispatch. No clock, no IO — safe for the conformance contract.
sealed class ScriptedOrchestrator(JsonArray script) : IOrchestrator
{
    public OrchestratorResult? Invoke(Effect effect) => Match("invoke", effect);
    public OrchestratorResult? Confirm(Effect effect) => Match("confirm", effect);
    public OrchestratorResult? Navigate(Effect effect) => Match("navigate", effect);

    private OrchestratorResult? Match(string kind, Effect effect)
    {
        foreach (var sn in script)
        {
            var on = sn!["on"]!.AsObject();
            if (on["kind"]!.GetValue<string>() != kind) continue;
            if (on["node"] is JsonNode node && node.GetValue<string>() != effect.Node) continue;
            if (on["tool"] is JsonNode tool && tool.GetValue<string>() != effect.Tool) continue;
            return ToResult(sn["result"]!.AsObject());
        }
        return null;
    }

    private static OrchestratorResult ToResult(JsonObject result)
    {
        List<PatchOp>? ops = null;
        if (result["ops"] is JsonArray opsArr)
            ops = opsArr.Select(n =>
            {
                var o = n!.AsObject();
                var value = o.TryGetPropertyValue("value", out var v) ? v?.DeepClone() : null;
                return new PatchOp(o["op"]!.GetValue<string>(), o["path"]!.GetValue<string>(), value);
            }).ToList();

        List<GupEvent>? events = null;
        if (result["events"] is JsonArray evArr)
            events = evArr.Select(n =>
            {
                var ev = n!.AsObject();
                return new GupEvent(
                    ev["node"]!.GetValue<string>(),
                    ev["name"]!.GetValue<string>(),
                    ev["payload"]?.DeepClone()?.AsObject());
            }).ToList();

        return new OrchestratorResult(ops, events);
    }
}
