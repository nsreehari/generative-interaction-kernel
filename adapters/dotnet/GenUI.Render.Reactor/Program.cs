using System;
using System.Text.Json.Nodes;
using GenUI.AgentFace.Http;
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
        // The AgentFace MCP transport wrapper, started alongside the window (best-effort): the host
        // exposes the agent-authoring tools over HTTP at /mcp — the .NET peer of the node host's
        // route. A bind failure (port taken, no urlacl) must never stop the UI from opening.
        using var mcp = TryStartMcp();

        AppRegistry samples = new AppRegistry()
            .Register(SampleAppName, CreateSampleBundle);
        AppRegistry apps = new AppRegistry();

        ShellHost.Run(samples, apps, title: "GenUI \u00d7 Reactor", width: 1100, height: 720);
    }

    private static AgentFaceMcpHttpServer? TryStartMcp()
    {
        var prefix = Environment.GetEnvironmentVariable("GENUI_AGENTFACE_MCP_PREFIX") ?? "http://localhost:8788/";
        try
        {
            var server = new AgentFaceMcpHttpServer(prefix);
            server.Start();
            return server;
        }
        catch (Exception)
        {
            return null; // never block the window on a transport bind failure
        }
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
