// Server-side HTTP/SSE binding for the transport seam — the C# mirror of
// transports/http-sse/src/server.ts. Host -> client messages stream over an SSE response;
// client -> host `event`s arrive as POSTs correlated by a session id (returned as the
// `X-GUP-Session` header on the stream). Each SSE stream is one connection attached to the
// KernelTransportHost broker; a reconnecting client passes `?fromRev=N` to resume with an
// incremental replay instead of a full re-onboard. Built on System.Net.HttpListener (zero NuGet).

using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using GenUI.Kernel;

namespace GenUI.Transport.HttpSse;

public sealed class SseTransportServer : IDisposable
{
    private readonly KernelTransportHost _host;
    private readonly string _path;
    private readonly HttpListener _listener = new();
    private readonly Dictionary<string, SseServerEndpoint> _endpoints = new();
    private readonly Dictionary<string, IDisposable> _detachers = new();
    private readonly object _gate = new();
    private Task? _acceptLoop;

    /// <summary>Bind a server to the broker. <paramref name="uriPrefix"/> is an HttpListener prefix
    /// such as <c>http://localhost:8791/</c>; <paramref name="path"/> is the base the two GUP routes
    /// (<c>{path}/stream</c> and <c>{path}/event</c>) mount under.</summary>
    public SseTransportServer(KernelTransportHost host, string uriPrefix, string path = "/gup")
    {
        _host = host;
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
            catch (HttpListenerException)
            {
                break; // listener stopped
            }
            catch (ObjectDisposedException)
            {
                break;
            }

            _ = Task.Run(() => Handle(context));
        }
    }

    // Returns true for a matched GUP route; a 404 otherwise (the server owns the whole prefix here,
    // but the route shape mirrors the TS server so a host app could fall through to its own routing).
    private void Handle(HttpListenerContext context)
    {
        var request = context.Request;
        var response = context.Response;
        var pathName = request.Url?.AbsolutePath ?? "/";

        try
        {
            if (request.HttpMethod == "OPTIONS" && pathName == $"{_path}/event")
            {
                WriteCors(request, response);
                response.StatusCode = 204;
                response.Close();
                return;
            }
            if (request.HttpMethod == "GET" && pathName == $"{_path}/stream")
            {
                OpenStream(context);
                return;
            }
            if (request.HttpMethod == "POST" && pathName == $"{_path}/event")
            {
                ReceiveEvent(context);
                return;
            }

            WriteCors(request, response);
            response.StatusCode = 404;
            response.Close();
        }
        catch
        {
            try { response.Abort(); } catch { /* client already gone */ }
        }
    }

    private void OpenStream(HttpListenerContext context)
    {
        var request = context.Request;
        var response = context.Response;

        var sessionId = Guid.NewGuid().ToString("N");
        var fromRevRaw = request.QueryString["fromRev"];
        int? fromRev = int.TryParse(fromRevRaw, out var fr) ? fr : null;

        WriteCors(request, response);
        response.StatusCode = 200;
        response.ContentType = "text/event-stream";
        response.Headers["Cache-Control"] = "no-cache";
        response.Headers["X-GUP-Session"] = sessionId;
        response.SendChunked = true;
        response.KeepAlive = true;

        var endpoint = new SseServerEndpoint(response);
        endpoint.Faulted += () => Cleanup(sessionId);

        lock (_gate) _endpoints[sessionId] = endpoint;

        // Attach onboards synchronously (manifest/document/snapshot or a resume replay), writing the
        // first frames to the open stream right here. The response stays open; later patches are
        // written by the broker's broadcast as events arrive.
        var detach = _host.Attach(endpoint, fromRev);
        lock (_gate) _detachers[sessionId] = detach;
    }

    private void ReceiveEvent(HttpListenerContext context)
    {
        var request = context.Request;
        var response = context.Response;

        var sessionId = request.QueryString["session"]
            ?? (request.Headers["X-GUP-Session"] is { Length: > 0 } h ? h : null);

        SseServerEndpoint? endpoint = null;
        if (sessionId is not null)
            lock (_gate) _endpoints.TryGetValue(sessionId, out endpoint);

        string body;
        using (var reader = new StreamReader(request.InputStream, request.ContentEncoding))
            body = reader.ReadToEnd();

        WriteCors(request, response);
        if (endpoint is null || JsonNode.Parse(body) is not JsonObject message)
        {
            response.StatusCode = 404;
            response.Close();
            return;
        }

        endpoint.Deliver(message);
        response.StatusCode = 204;
        response.Close();
    }

    private void Cleanup(string sessionId)
    {
        IDisposable? detacher;
        SseServerEndpoint? endpoint;
        lock (_gate)
        {
            _detachers.Remove(sessionId, out detacher);
            _endpoints.Remove(sessionId, out endpoint);
        }
        detacher?.Dispose();
        endpoint?.Close();
    }

    private static void WriteCors(HttpListenerRequest request, HttpListenerResponse response)
    {
        var origin = request.Headers["Origin"] is { Length: > 0 } o ? o : "*";
        response.Headers["Access-Control-Allow-Origin"] = origin;
        response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
        response.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-GUP-Session";
        response.Headers["Access-Control-Expose-Headers"] = "X-GUP-Session";
        response.Headers["Vary"] = "Origin";
    }

    public void Dispose()
    {
        _host.Stop();

        string[] sessions;
        lock (_gate) sessions = _endpoints.Keys.ToArray();
        foreach (var session in sessions) Cleanup(session);

        if (_listener.IsListening) _listener.Stop();
        _listener.Close();

        try { _acceptLoop?.Wait(TimeSpan.FromSeconds(2)); } catch { /* best-effort shutdown */ }
    }
}

/// <summary>One SSE connection as a transport endpoint. <see cref="Send"/> writes a frame to the open
/// response; <see cref="Deliver"/> pushes a client-originated (POSTed) message up to the broker. A
/// failed write (client gone) raises <see cref="Faulted"/> so the server can detach and clean up.</summary>
internal sealed class SseServerEndpoint : ITransport
{
    private readonly HttpListenerResponse _response;
    private readonly object _writeLock = new();
    private TransportListener? _listener;
    private volatile bool _closed;

    public event Action? Faulted;

    public SseServerEndpoint(HttpListenerResponse response) => _response = response;

    public void Send(JsonObject message)
    {
        if (_closed) return;
        var bytes = Encoding.UTF8.GetBytes(Codec.EncodeSseFrame(message));
        lock (_writeLock)
        {
            if (_closed) return;
            try
            {
                _response.OutputStream.Write(bytes, 0, bytes.Length);
                _response.OutputStream.Flush();
            }
            catch
            {
                _closed = true;
                Faulted?.Invoke();
            }
        }
    }

    public IDisposable Subscribe(TransportListener listener)
    {
        _listener = listener;
        return new EndpointUnsubscribe(this, listener);
    }

    /// <summary>Deliver a client-originated message (a POSTed event) to the host.</summary>
    public void Deliver(JsonObject message) => _listener?.Invoke(message);

    public void Close()
    {
        _closed = true;
        lock (_writeLock)
        {
            try { _response.Close(); } catch { /* already closed */ }
        }
    }

    private void Unsubscribe(TransportListener listener)
    {
        if (_listener == listener) _listener = null;
    }

    private sealed class EndpointUnsubscribe(SseServerEndpoint endpoint, TransportListener listener) : IDisposable
    {
        public void Dispose() => endpoint.Unsubscribe(listener);
    }
}
