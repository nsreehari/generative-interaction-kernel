using System;
using System.Text.Json.Nodes;
using GenUI.Render;

namespace GenUI.Render.Reactor.Host;

/// <summary>
/// Runnable sample host. It authors a small live-cards bundle as JSON, registers it in an
/// <see cref="AppRegistry"/> under the name <c>"sample"</c>, and runs it through the generic
/// <see cref="BundleHost"/> — the same bundle/host/app-registry path the React web floor uses
/// (<c>bundle.ts</c> + <c>host.tsx</c> + <c>apps.tsx</c>). Nothing here hand-wires a kernel; the
/// sample is just another hosted bundle, so a profile app added later mounts identically.
/// </summary>
public static class Program
{
    private const string SampleAppName = "sample";

    [STAThread]
    public static void Main()
    {
        AppRegistry apps = new AppRegistry()
            .Register(SampleAppName, CreateSampleBundle);

        BundleHost.RunApp(apps, SampleAppName, title: "GenUI \u00d7 Reactor", width: 900, height: 640);
    }

    /// <summary>The sample as a JSON bundle, built through <see cref="BundleLoader.FromJson"/> so it
    /// travels the same "everything is JSON" path a real app profile would.</summary>
    private static Bundle CreateSampleBundle()
    {
        JsonObject bundleJson = JsonNode.Parse(SampleBundleJson)!.AsObject();
        return BundleLoader.FromJson(bundleJson);
    }

    // A board with a metric that reads ui.clicked and a button that assigns it — the same proven
    // assign/read shape the headless adapter check exercises, so the sample's runtime semantics are
    // guaranteed by an offline test even though this window can't be painted in the suite.
    private const string SampleBundleJson = """
    {
      "manifest": {
        "type": "manifest",
        "payload": {
          "namespaces": ["ui"],
          "capabilities": { "board": {}, "metric": {}, "actions": {} }
        }
      },
      "document": {
        "type": "document",
        "payload": {
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
      },
      "state": { "ui": {} }
    }
    """;
}
