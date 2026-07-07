// Headless, offline validation of the GenUI.AgentFace JSON->JSON surface: catalog projection,
// reference linting, dry-run document validation, and the author (commit) path. No transport,
// no network — mirrors the other check runners so `dotnet run` is a self-contained gate.

using System.Text.Json.Nodes;
using GenUI.AgentFace;

var failures = 0;
void Check(string name, bool ok)
{
    Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {name}");
    if (!ok) failures++;
}

static JsonObject Obj(string json) => (JsonObject)JsonNode.Parse(json)!;

var manifest = Obj("""
{
  "version": "0.1",
  "namespaces": ["ui", "data"],
  "capabilities": {
    "text": { "emits": ["submit"], "dataProp": "value" },
    "button": { "emits": ["click"] }
  },
  "externals": { "effects": ["saveItem"] }
}
""");

// --- Catalog projection ----------------------------------------------------
var catalog = Catalog.Describe(manifest);
var caps = catalog["capabilities"] as JsonArray;
Check("catalog: projects both capabilities", caps is { Count: 2 });
Check("catalog: capability carries id", caps?[0]?["id"]?.GetValue<string>() == "text");
Check("catalog: namespaces projected", (catalog["namespaces"] as JsonArray)?.Count == 2);
Check("catalog: effects projected", (catalog["effects"] as JsonArray)?.Count == 1);

// --- Lint: a clean document has no warnings --------------------------------
var cleanDoc = Obj("""
{
  "root": {
    "capability": "text", "id": "t1",
    "edges": {
      "read": { "value": "data.title" },
      "on": { "submit": [ { "do": "assign", "target": "ui.saved", "args": { "value": true } } ] }
    }
  }
}
""");
Check("lint: clean document has no warnings", DocumentAuthoring.Lint(manifest, cleanDoc).Count == 0);

// --- Lint: a dirty document flags every reference code ---------------------
var dirtyDoc = Obj("""
{
  "root": {
    "capability": "text", "id": "d1",
    "edges": {
      "read": { "value": "nope.title" },
      "on": { "hover": [ { "do": "invoke", "args": { "tool": "ghostEffect" } } ] },
      "children": [ { "capability": "mystery", "id": "d2" } ]
    }
  }
}
""");
var codes = (DocumentAuthoring.Lint(manifest, dirtyDoc))
    .Select(w => w?["code"]?.GetValue<string>() ?? "").ToHashSet();
Check("lint: flags unknown-capability", codes.Contains("unknown-capability"));
Check("lint: flags undeclared-namespace", codes.Contains("undeclared-namespace"));
Check("lint: flags undeclared-event", codes.Contains("undeclared-event"));
Check("lint: flags undeclared-effect", codes.Contains("undeclared-effect"));

// --- ValidateDocument (dry-run) -------------------------------------------
var report = DocumentAuthoring.ValidateDocument(manifest, cleanDoc);
Check("validate: clean document is ok", report["ok"]?.GetValue<bool>() == true);

var badDoc = Obj("""{ "root": { "capability": "text" } }"""); // missing id
var badReport = DocumentAuthoring.ValidateDocument(manifest, badDoc);
Check("validate: structural error -> not ok", badReport["ok"]?.GetValue<bool>() == false);
Check("validate: structural error surfaced", (badReport["errors"] as JsonArray)?.Count >= 1);

// --- AuthorDocument (commit path) -----------------------------------------
var authored = DocumentAuthoring.AuthorDocument(cleanDoc, manifest);
Check("author: valid document commits", authored["ok"]?.GetValue<bool>() == true);
Check("author: returns a wire message", authored["message"] is JsonObject);
Check("author: invalid document rejected", DocumentAuthoring.AuthorDocument(badDoc)["ok"]?.GetValue<bool>() == false);

Console.WriteLine();
Console.WriteLine(failures == 0 ? "All AgentFace checks passed." : $"{failures} AgentFace check(s) failed.");
return failures == 0 ? 0 : 1;
