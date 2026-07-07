// The MCP tool surface for the dotnet AgentFace: one tool per method, plus a PURE JSON-RPC
// dispatcher. Transport-free — it turns a JSON-RPC message (JsonObject) into a reply (JsonObject)
// and knows nothing about HTTP. The WinUI host (or any caller) feeds messages in via a thin shell;
// the HttpListener wrapper lives in GenUI.AgentFace.Http. Mirrors agentface/ts/src/mcp.ts. The
// dotnet AgentFace owns the kernel (UI-DSL) tracks — catalog, document, capability — so those are
// the tools here (the L3/L4 interaction/presentation/intent tracks are TS-only).

using System.Text.Json.Nodes;

namespace GenUI.AgentFace;

public static class McpServer
{
    /// <summary>The MCP revision this surface advertises.</summary>
    public const string ProtocolVersion = "2025-06-18";

    private sealed record Tool(string Name, string Description, JsonObject InputSchema, Func<JsonObject, JsonNode?> Handler);

    private static JsonObject Schema(params (string Name, bool Required)[] fields)
    {
        var props = new JsonObject();
        var required = new JsonArray();
        foreach (var (name, req) in fields)
        {
            props[name] = new JsonObject { ["type"] = "object" };
            if (req) required.Add(name);
        }
        return new JsonObject
        {
            ["type"] = "object",
            ["properties"] = props,
            ["required"] = required,
            ["additionalProperties"] = false,
        };
    }

    // Deep-clone an argument out of the JSON-RPC params so it carries no parent — the library
    // functions clone internally, but detaching keeps the surface robust to reuse.
    private static JsonObject? Arg(JsonObject args, string name) =>
        (args[name]?.DeepClone()) as JsonObject;

    private static readonly List<Tool> Tools = new()
    {
        new("describeCatalog", "Project a manifest into a discovery catalog (capabilities, namespaces, effects).",
            Schema(("manifest", true)), a => Catalog.Describe(Arg(a, "manifest")!)),
        new("namespaces", "List the state namespaces a manifest declares.",
            Schema(("manifest", true)), a => Catalog.Namespaces(Arg(a, "manifest")!)),
        new("effects", "List the external effect handlers a manifest declares.",
            Schema(("manifest", true)), a => Catalog.Effects(Arg(a, "manifest")!)),
        new("validateDocument", "Dry-run validate a UI document against a manifest (structure + reference lint).",
            Schema(("manifest", true), ("document", true)),
            a => DocumentAuthoring.ValidateDocument(Arg(a, "manifest")!, Arg(a, "document")!)),
        new("lintDocument", "Lint a UI document's references against a manifest (non-throwing warnings only).",
            Schema(("manifest", true), ("document", true)),
            a => DocumentAuthoring.Lint(Arg(a, "manifest")!, Arg(a, "document")!)),
        new("authorDocument", "Validate then commit a UI document, returning a wire message or a shaped error.",
            Schema(("document", true), ("manifest", false)),
            a => DocumentAuthoring.AuthorDocument(Arg(a, "document")!, Arg(a, "manifest"))),
        new("validateCapability", "Validate a capability DEFINITION (leaf track); optional registry view enables render/floor checks.",
            Schema(("capability", true), ("registryView", false)),
            a => CapabilityAuthoring.ValidateCapability(Arg(a, "capability")!, Arg(a, "registryView"))),
    };

    private static readonly Dictionary<string, Tool> ByName =
        Tools.ToDictionary(t => t.Name, t => t);

    /// <summary>Tool metadata for <c>tools/list</c> (drops the handler).</summary>
    public static JsonArray ListTools()
    {
        var arr = new JsonArray();
        foreach (var t in Tools)
        {
            arr.Add(new JsonObject
            {
                ["name"] = t.Name,
                ["description"] = t.Description,
                ["inputSchema"] = t.InputSchema.DeepClone(),
            });
        }
        return arr;
    }

    /// <summary>Invoke one tool by name. Throws <see cref="KeyNotFoundException"/> for an unknown tool.</summary>
    public static JsonNode? CallTool(string name, JsonObject args)
    {
        if (!ByName.TryGetValue(name, out var tool))
            throw new KeyNotFoundException($"unknown tool: {name}");
        return tool.Handler(args);
    }

    // --- JSON-RPC 2.0 (the MCP wire contract), pure and transport-free -----

    private static JsonObject Result(JsonNode? id, JsonNode? result) =>
        new() { ["jsonrpc"] = "2.0", ["id"] = id?.DeepClone(), ["result"] = result };

    private static JsonObject Error(JsonNode? id, int code, string message) =>
        new()
        {
            ["jsonrpc"] = "2.0",
            ["id"] = id?.DeepClone(),
            ["error"] = new JsonObject { ["code"] = code, ["message"] = message },
        };

    /// <summary>Handle one MCP JSON-RPC message and return the reply, or <c>null</c> for a
    /// notification (a request with no <c>id</c>). Supports initialize, tools/list, tools/call.</summary>
    public static JsonObject? Handle(JsonObject request)
    {
        var isNotification = !request.ContainsKey("id");
        var id = request["id"];
        var method = request["method"]?.GetValue<string>();

        switch (method)
        {
            case "initialize":
                return Result(id, new JsonObject
                {
                    ["protocolVersion"] = ProtocolVersion,
                    ["capabilities"] = new JsonObject { ["tools"] = new JsonObject() },
                    ["serverInfo"] = new JsonObject { ["name"] = "genui-agentface", ["version"] = "0.1" },
                });
            case "notifications/initialized":
                return null;
            case "tools/list":
                return Result(id, new JsonObject { ["tools"] = ListTools() });
            case "tools/call":
            {
                var prms = request["params"] as JsonObject;
                var name = prms?["name"]?.GetValue<string>();
                var args = prms?["arguments"] as JsonObject ?? new JsonObject();
                if (name is null || !ByName.ContainsKey(name))
                    return isNotification ? null : Error(id, -32602, $"unknown tool: {name}");
                try
                {
                    var result = CallTool(name, (JsonObject)args.DeepClone());
                    return Result(id, new JsonObject
                    {
                        ["content"] = new JsonArray(new JsonObject
                        {
                            ["type"] = "text",
                            ["text"] = result?.ToJsonString() ?? "null",
                        }),
                        ["structuredContent"] = result,
                    });
                }
                catch (Exception e)
                {
                    return Result(id, new JsonObject
                    {
                        ["content"] = new JsonArray(new JsonObject { ["type"] = "text", ["text"] = e.Message }),
                        ["isError"] = true,
                    });
                }
            }
            default:
                return isNotification ? null : Error(id, -32601, $"method not found: {method}");
        }
    }
}
