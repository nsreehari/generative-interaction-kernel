using System;
using System.Text.Json.Nodes;
using GenUI.Render;

namespace GenUI.Render.Reactor.Host;

/// <summary>
/// Runnable shell host. It authors a small live-cards bundle as JSON, registers it as a
/// <b>Sample</b>, and opens the WinUI/Reactor <see cref="ShellComponent"/> — the .NET peer of the
/// React web floor's app host (Samples / Apps / Host over <c>bundle.ts</c> + <c>host.tsx</c> +
/// <c>apps.tsx</c>). Nothing here hand-wires a kernel; the sample is just another hosted bundle, so
/// a profile app added to the Apps registry later mounts identically.
/// </summary>
public static class Program
{
    private const string SampleAppName = "sample";

    [STAThread]
    public static void Main()
    {
        AppRegistry samples = new AppRegistry()
            .Register(SampleAppName, CreateSampleBundle);
        AppRegistry apps = new AppRegistry();

        ShellHost.Run(samples, apps, title: "GenUI \u00d7 Reactor", width: 1100, height: 720);
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
