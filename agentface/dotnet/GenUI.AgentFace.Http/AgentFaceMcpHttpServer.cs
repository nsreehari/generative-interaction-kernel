// The AgentFace MCP transport wrapper for the dotnet/WinUI host: a zero-NuGet HttpListener that
// mounts a single POST {path} route speaking JSON-RPC 2.0 over the pure McpServer dispatcher (one
// tool per method). Mirrors GenUI.Transport.HttpSse.SseTransportServer's HttpListener pattern and
// the node host's `/mcp` route. The WinUI host news one up and calls Start(); nothing about the
// authoring library depends on it.

using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using GenUI.AgentFace;

namespace GenUI.AgentFace.Http;

public sealed class AgentFaceMcpHttpServer : IDisposable
{
    private readonly HttpListener _listener = new();
    private readonly string _path;
    private Task? _acceptLoop;

    /// <summary>Bind the server. <paramref name="uriPrefix"/> is an HttpListener prefix such as
    /// <c>http://localhost:8791/</c>; <paramref name="path"/> is the route the MCP endpoint mounts at.</summary>
    public AgentFaceMcpHttpServer(string uriPrefix, string path = "/mcp")
    {
        _path = path;
        _listener.Prefixes.Add(uriPrefix);
    }

    public void Start()
    {
        _listener.Start();
        _acceptLoop = Task.Run(AcceptLoop);
    }

    private async Task AcceptLoop()
    {
        while (_listener.IsListening)
        {
            HttpListenerContext context;
            try
            {
                context = await _listener.GetContextAsync().ConfigureAwait(false);
            }
            catch (HttpListenerException) { break; }
            catch (ObjectDisposedException) { break; }
            _ = Task.Run(() => Handle(context));
        }
    }

    private void Handle(HttpListenerContext context)
    {
        var request = context.Request;
        var response = context.Response;
        try
        {
            WriteCors(response);
            if (request.Url?.AbsolutePath != _path)
            {
                response.StatusCode = 404;
                return;
            }

            switch (request.HttpMethod)
            {
                case "OPTIONS":
                    response.StatusCode = 204;
                    return;
                case "GET":
                    WriteJson(response, 200, new JsonObject
                    {
                        ["transport"] = "mcp/jsonrpc",
                        ["protocol"] = McpServer.ProtocolVersion,
                    });
                    return;
                case "POST":
                    break;
                default:
                    response.StatusCode = 405;
                    return;
            }

            string body;
            using (var reader = new StreamReader(request.InputStream, request.ContentEncoding ?? Encoding.UTF8))
                body = reader.ReadToEnd();

            JsonObject? message;
            try
            {
                message = JsonNode.Parse(body) as JsonObject;
            }
            catch
            {
                WriteJson(response, 400, ParseError());
                return;
            }
            if (message is null)
            {
                WriteJson(response, 400, ParseError());
                return;
            }

            var reply = McpServer.Handle(message);
            if (reply is null)
            {
                response.StatusCode = 204; // notification — no body
                return;
            }
            WriteJson(response, 200, reply);
        }
        finally
        {
            try { response.OutputStream.Close(); } catch { /* client gone */ }
        }
    }

    private static JsonObject ParseError() => new()
    {
        ["jsonrpc"] = "2.0",
        ["id"] = null,
        ["error"] = new JsonObject { ["code"] = -32700, ["message"] = "parse error" },
    };

    private static void WriteJson(HttpListenerResponse response, int status, JsonNode payload)
    {
        response.StatusCode = status;
        response.ContentType = "application/json";
        var bytes = Encoding.UTF8.GetBytes(payload.ToJsonString());
        response.ContentLength64 = bytes.Length;
        response.OutputStream.Write(bytes, 0, bytes.Length);
    }

    private static void WriteCors(HttpListenerResponse response)
    {
        response.Headers["Access-Control-Allow-Origin"] = "*";
        response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
        response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
    }

    public void Dispose()
    {
        try { _listener.Stop(); } catch { /* already stopped */ }
        try { _listener.Close(); } catch { /* already closed */ }
    }
}
