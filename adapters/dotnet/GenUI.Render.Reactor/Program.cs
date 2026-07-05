using System;
using System.Text.Json.Nodes;
using GenUI.Kernel;
using GenUI.Render.Reactor;
using GenKernel = GenUI.Kernel.Kernel;

namespace GenUI.Render.Reactor.Host;

/// <summary>
/// Runnable demonstration host: builds a small live-cards document, drives it through the real
/// kernel, and opens a Reactor/WinUI window over the render binding. The same controller +
/// registry could be hosted by any WinUI entry point — this Program just supplies the
/// <c>[STAThread]</c> boot and a sample document so the binding is end-to-end runnable.
/// </summary>
public static class Program
{
    [STAThread]
    public static void Main()
    {
        JsonObject manifest = JsonNode.Parse(ManifestJson)!.AsObject();
        JsonObject document = JsonNode.Parse(DocumentJson)!.AsObject();

        var store = new InMemoryStateModel(new[] { "ui" });
        var kernel = new GenKernel(manifest, document, store);
        var controller = new GenUIController(kernel);

        ReactorHost.Run(controller, title: "GenUI \u00d7 Reactor", width: 900, height: 640);
    }

    private const string ManifestJson = """
    {
      "namespaces": ["ui"],
      "capabilities": { "board": {}, "metric": {}, "actions": {} }
    }
    """;

    // A board with a metric that reads ui.clicked and a button that assigns it — the same
    // proven assign/read shape the headless adapter check exercises, so the demo's runtime
    // semantics are guaranteed by an offline test even though the window can't be painted here.
    private const string DocumentJson = """
    {
      "root": {
        "capability": "board",
        "id": "root",
        "props": { "title": "GenUI \u00d7 Reactor" },
        "edges": {
          "children": [
            { "capability": "metric",  "id": "status", "props": { "label": "Clicked" },
              "edges": { "read": { "value": "ui.clicked" } } },
            { "capability": "actions", "id": "go", "props": { "label": "Click me" },
              "edges": { "on": { "tap": [ { "do": "assign", "target": "ui.clicked", "args": { "value": true } } ] } } }
          ]
        }
      }
    }
    """;
}
