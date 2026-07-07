// Headless, offline round-trip for the AgentFace MCP HTTP wrapper: start the HttpListener server on
// a free loopback port, then drive initialize / tools/list / tools/call over a real HttpClient and
// assert the JSON-RPC replies. Proves the WinUI host's transport wrapper end-to-end without opening
// a window. Mirrors GenUI.Transport.HttpSse.Check's loopback pattern.

using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json.Nodes;
using GenUI.AgentFace.Http;

var failures = 0;
void Check(string name, bool ok)
{
    Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {name}");
    if (!ok) failures++;
}

var (prefix, baseUrl) = FindFreeLoopback();
using var server = new AgentFaceMcpHttpServer(prefix);
server.Start();

using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

async Task<JsonObject?> Post(string json)
{
    using var content = new StringContent(json, Encoding.UTF8, "application/json");
    using var res = await client.PostAsync($"{baseUrl}/mcp", content);
    var body = await res.Content.ReadAsStringAsync();
    return string.IsNullOrEmpty(body) ? null : JsonNode.Parse(body) as JsonObject;
}

try
{
    var init = await Post("""{ "jsonrpc": "2.0", "id": 1, "method": "initialize" }""");
    Check("http: initialize returns protocolVersion",
        init?["result"]?["protocolVersion"]?.GetValue<string>() == McpServerProtocol());

    var list = await Post("""{ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }""");
    Check("http: tools/list returns tools", (list?["result"]?["tools"] as JsonArray)?.Count >= 5);

    var call = await Post("""
    { "jsonrpc": "2.0", "id": 3, "method": "tools/call",
      "params": { "name": "validateCapability", "arguments": { "capability": { "id": "chart" } } } }
    """);
    Check("http: tools/call returns structuredContent",
        call?["result"]?["structuredContent"]?["ok"]?.GetValue<bool>() == true);

    var bad = await Post("""{ "jsonrpc": "2.0", "id": 4, "method": "bogus" }""");
    Check("http: unknown method -> JSON-RPC error", bad?["error"]?["code"]?.GetValue<int>() == -32601);

    using var getRes = await client.GetAsync($"{baseUrl}/mcp");
    var getBody = JsonNode.Parse(await getRes.Content.ReadAsStringAsync()) as JsonObject;
    Check("http: GET advertises the mcp transport", getBody?["transport"]?.GetValue<string>() == "mcp/jsonrpc");
}
catch (Exception e)
{
    Check($"http: round-trip threw: {e.Message}", false);
}

Console.WriteLine();
Console.WriteLine(failures == 0 ? "All AgentFace HTTP checks passed." : $"{failures} AgentFace HTTP check(s) failed.");
return failures == 0 ? 0 : 1;

static string McpServerProtocol() => GenUI.AgentFace.McpServer.ProtocolVersion;

static (string Prefix, string BaseUrl) FindFreeLoopback()
{
    for (var port = 8891; port < 8991; port++)
    {
        try
        {
            var probe = new TcpListener(IPAddress.Loopback, port);
            probe.Start();
            probe.Stop();
            return ($"http://localhost:{port}/", $"http://localhost:{port}");
        }
        catch (SocketException)
        {
            // port busy — try the next one
        }
    }
    throw new InvalidOperationException("no free loopback port for the AgentFace HTTP check");
}
