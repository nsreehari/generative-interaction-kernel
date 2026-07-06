// Headless smoke checks for the C# render adapter. Renders a hand-built document into a
// serializable RenderRecord tree (TView = RenderRecord) and drives the whole loop through
// the REAL kernel via GenUIController: render -> node-bound emit -> dispatch -> re-resolve
// -> re-render. Proves the adapter's contract (visibility drop, two fallback paths, emit
// node-id capture, controller patch/refresh) without any UI toolkit. Same console-runner
// style as the conformance runner: prints PASS/FAIL and returns a non-zero exit on failure.

using System.Text.Json.Nodes;
using GenUI.Kernel;
using GenUI.Render;
using GenKernel = GenUI.Kernel.Kernel;

const string ManifestJson = """
{
  "namespaces": ["ui"],
  "capabilities": { "board": {}, "label": {}, "button": {}, "badge": {} }
}
""";

// board root with: a static label, a label that reads ui.clicked, a button that assigns it,
// a badge (in manifest but with no registered view), an unknown capability (not in manifest),
// and a gated-off label. Exercises both fallback paths and the visibility drop.
const string DocumentJson = """
{
  "root": {
    "capability": "board",
    "id": "root",
    "edges": {
      "children": [
        { "capability": "label",  "id": "title",  "props": { "text": "Hello" } },
        { "capability": "label",  "id": "echo",   "edges": { "read": { "text": "ui.clicked" } } },
        { "capability": "button", "id": "go",
          "edges": { "on": { "click": [ { "do": "assign", "target": "ui.clicked", "args": { "value": true } } ] } } },
        { "capability": "badge",  "id": "b1" },
        { "capability": "mystery","id": "u1" },
        { "capability": "label",  "id": "hidden", "edges": { "gate": "false" } }
      ]
    }
  }
}
""";

var manifest = JsonNode.Parse(ManifestJson)!.AsObject();
var document = JsonNode.Parse(DocumentJson)!.AsObject();

var store = new InMemoryStateModel(new[] { "ui" });
var kernel = new GenKernel(manifest, document, store);
var controller = new GenUIController(kernel);

// A view factory that stamps the view name onto a RenderRecord.
static CapabilityView<RenderRecord> Named(string view) => props =>
    new RenderRecord(view, props.Node.Capability, props.Node.Id, props.Node.Props,
        props.Node.Fallback, props.Emit, props.Children);

// Note: "badge" is deliberately NOT mapped -> registered-but-no-view fallback path.
var registry = new ComponentRegistry<RenderRecord>(
    new Dictionary<string, CapabilityView<RenderRecord>>
    {
        ["board"] = Named("board"),
        ["label"] = Named("label"),
        ["button"] = Named("button"),
    },
    fallback: Named("fallback"));

// Wire the render loop: every resolved tree re-renders; the render's emit forwards to the
// controller (which dispatches and refreshes). Record emits to assert node-id capture.
var emitted = new List<(string Node, string Name)>();
RenderRecord? ui = null;
var refreshCount = 0;

EmitFn emit = (id, name, payload) =>
{
    emitted.Add((id, name));
    controller.Emit(id, name, payload);
};

controller.Subscribe(tree =>
{
    refreshCount++;
    ui = Renderer.Render(tree, registry, emit);
});

controller.Start();

var checker = new Checker();

checker.Assert(ui is not null, "root renders");
checker.Assert(ui!.View == "board" && ui.Capability == "board", "root uses the board view");
checker.Assert(ui.Children.Count == 5, $"gated child dropped (5 rendered, got {ui.Children.Count})");

var title = Child(ui, "title");
checker.Assert(title?.View == "label", "title uses the label view");
checker.Assert(title!.Props["text"]?.GetValue<string>() == "Hello", "title carries its declared prop");

var go = Child(ui, "go");
checker.Assert(go?.View == "button", "button uses the button view");

var badge = Child(ui, "b1");
checker.Assert(badge?.View == "fallback", "known-but-unregistered capability falls back");
checker.Assert(badge!.Fallback == false, "badge is not a kernel fallback (it is in the manifest)");

var unknown = Child(ui, "u1");
checker.Assert(unknown?.View == "fallback", "unknown capability falls back");
checker.Assert(unknown!.Fallback, "unknown capability is a kernel fallback");

checker.Assert(Child(ui, "hidden") is null, "gated node is absent from the render tree");

var echoBefore = Child(ui, "echo");
checker.Assert(echoBefore!.Props["text"] is null, "echo reads null before the click");

// Fire the node-bound emit captured on the button's RenderRecord — this is the real
// closure the renderer built, so it must dispatch as node "go".
go!.Emit("click");

checker.Assert(emitted.Contains(("go", "click")), "bound emit carries the node id");
checker.Assert(controller.LastPatch?.Rev == 1, $"one dispatch advanced to rev 1 (got {controller.LastPatch?.Rev})");
checker.Assert(controller.LastPatch!.Ops.Count == 1
    && controller.LastPatch.Ops[0] is { Op: "set", Path: "ui.clicked" }, "click assigns ui.clicked");
checker.Assert(refreshCount >= 2, "subscriber re-rendered after the dispatch");

var echoAfter = Child(ui!, "echo");
checker.Assert(echoAfter!.Props["text"]?.GetValue<bool>() == true, "echo reflects ui.clicked after the click");

// ---- Bundle loader (mirror of the React floor's bundle.ts) --------------------------------
// A bundle is { manifest, document, state }. FromJson builds it, LoadBundle seeds the store from
// the manifest namespaces + seed values and stands up a controller — the same unit the Reactor
// BundleHost runs. Seeding ui.clicked=true up front proves the read edge observes seeded state.
const string BundleJson = """
{
  "manifest": {
    "type": "manifest",
    "payload": { "namespaces": ["ui"], "capabilities": { "board": {}, "label": {} } }
  },
  "document": {
    "type": "document",
    "payload": {
      "root": {
        "capability": "board",
        "id": "root",
        "edges": { "children": [
          { "capability": "label", "id": "echo", "edges": { "read": { "text": "ui.clicked" } } }
        ] }
      }
    }
  },
  "state": { "ui": { "clicked": true } }
}
""";

var bundle = BundleLoader.FromJson(JsonNode.Parse(BundleJson)!.AsObject());
var bundleController = BundleLoader.LoadBundle(bundle);
RenderRecord? bundleUi = null;
bundleController.Subscribe(tree => bundleUi = Renderer.Render(tree, registry, emit));
bundleController.Start();

checker.Assert(bundleUi is not null && bundleUi.View == "board", "bundle root renders through the loader");
var bundleEcho = Child(bundleUi!, "echo");
checker.Assert(bundleEcho?.Props["text"]?.GetValue<bool>() == true, "bundle seed state is applied before first render");

var missingDocRejected = false;
try
{
    BundleLoader.FromJson(JsonNode.Parse("""{ "manifest": { "type": "manifest", "payload": {} } }""")!.AsObject());
}
catch (ArgumentException)
{
    missingDocRejected = true;
}

checker.Assert(missingDocRejected, "bundle without a document is rejected at the boundary");

return checker.Report();

static RenderRecord? Child(RenderRecord parent, string id)
{
    foreach (var c in parent.Children)
        if (c.Id == id) return c;
    return null;
}

sealed class Checker
{
    private int _failures;

    public void Assert(bool ok, string label)
    {
        Console.WriteLine(ok ? $"  PASS  {label}" : $"  FAIL  {label}");
        if (!ok) _failures++;
    }

    public int Report()
    {
        Console.WriteLine();
        Console.WriteLine(_failures == 0
            ? "OK: all render-adapter checks passed (C# adapter)."
            : $"FAILED: {_failures} render-adapter check(s).");
        return _failures == 0 ? 0 : 1;
    }
}

// A minimal serializable "view": records which view drew it, the node identity/props, the
// kernel-fallback flag, the node-bound emit (so a test can fire it), and rendered children.
sealed record RenderRecord(
    string View,
    string Capability,
    string Id,
    JsonObject Props,
    bool Fallback,
    EmitBound Emit,
    IReadOnlyList<RenderRecord> Children);
