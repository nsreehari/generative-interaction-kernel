// Headless checks for the unified host session (GenUISession). Proves the fan-out matrix a shared
// kernel must satisfy: an event from EITHER source (the in-process renderer via Emit, or a remote
// agent over an attached transport) fans out to BOTH sinks (the renderer re-resolves, AND every
// attached transport receives the patch). One kernel, one scheduler, driven from both ends.
//
// Same console-runner style as the other adapter checks: prints PASS/FAIL and returns non-zero on
// any failure. No UI toolkit — the renderer's effect is observed through GenUIController.Tree.

using System.Text.Json.Nodes;
using GenUI.Kernel;
using GenUI.Render;

const string ManifestJson = """
{
  "namespaces": ["ui"],
  "capabilities": { "board": {}, "label": {}, "button": {} }
}
""";

// echo reads ui.msg into its text; two buttons assign distinct values so a change is attributable to
// the exact source that drove it (UI vs agent).
const string DocumentJson = """
{
  "root": {
    "capability": "board",
    "id": "root",
    "edges": {
      "children": [
        { "capability": "label",  "id": "echo", "edges": { "read": { "text": "ui.msg" } } },
        { "capability": "button", "id": "hi",
          "edges": { "on": { "click": [ { "do": "assign", "target": "ui.msg", "args": { "value": "hello" } } ] } } },
        { "capability": "button", "id": "wo",
          "edges": { "on": { "click": [ { "do": "assign", "target": "ui.msg", "args": { "value": "world" } } ] } } }
      ]
    }
  }
}
""";

var manifest = JsonNode.Parse(ManifestJson)!.AsObject();
var document = JsonNode.Parse(DocumentJson)!.AsObject();
var bundle = new Bundle(manifest, document);

var pass = 0;
var fail = 0;
void Check(string label, bool ok)
{
    Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {label}");
    if (ok) pass++; else fail++;
}

// The resolved text of the echo label in the renderer's latest tree.
static string? EchoText(GenUISession session)
{
    ResolvedNode? Find(ResolvedNode? n)
    {
        if (n is null) return null;
        if (n.Id == "echo") return n;
        foreach (var c in n.Children) { var hit = Find(c); if (hit is not null) return hit; }
        return null;
    }
    return Find(session.Controller.Tree)?.Props["text"]?.GetValue<string>();
}

using var session = GenUISession.FromBundle(bundle);

// A subscriber count proves the renderer is notified, not just that Tree happens to be current.
var refreshes = 0;
using (session.Controller.Subscribe(_ => refreshes++))
{
    // --- Onboarding: the renderer resolved the initial tree, with ui.msg unset. ---
    Check("onboard: renderer has an initial tree", session.Controller.Tree is not null);
    Check("onboard: echo unset before any event", EchoText(session) is null);

    // --- UI-driven event refreshes the renderer. ---
    session.Emit("hi", "click");
    Check("ui event -> renderer re-resolved (echo=hello)", EchoText(session) == "hello");
    Check("ui event -> subscriber notified", refreshes >= 1);

    // --- Attach an agent; it is onboarded with manifest + document + snapshot patch. ---
    var (agent, agentPeer) = InMemoryTransport.CreatePair();
    var onboardTypes = new List<string?>();
    var agentPatches = 0;
    using var agentSub = agentPeer.Subscribe(m =>
    {
        var type = Gup.TypeOf(m);
        onboardTypes.Add(type);
        if (type == "patch") agentPatches++;
    });
    using var attachment = session.Attach(agent);
    Check("attach: agent onboarded manifest+document+patch",
        onboardTypes.Count == 3 && onboardTypes[0] == "manifest" && onboardTypes[1] == "document" && onboardTypes[2] == "patch");

    var patchesAfterOnboard = agentPatches;

    // --- Agent-driven event fans to BOTH sinks: the agent gets a patch AND the renderer re-resolves. ---
    agentPeer.Send(Gup.Message("event", new JsonObject { ["node"] = "wo", ["name"] = "click" }));
    Check("agent event -> agent received a patch", agentPatches == patchesAfterOnboard + 1);
    Check("agent event -> renderer re-resolved (echo=world)", EchoText(session) == "world");

    // --- UI-driven event also reaches the connected agent (not just the local renderer). ---
    var patchesBeforeUiEmit = agentPatches;
    session.Emit("hi", "click");
    Check("ui event -> connected agent received a patch", agentPatches == patchesBeforeUiEmit + 1);
    Check("ui event -> renderer re-resolved (echo=hello)", EchoText(session) == "hello");
}

Console.WriteLine();
Console.WriteLine($"{pass} passed, {fail} failed");
return fail == 0 ? 0 : 1;
