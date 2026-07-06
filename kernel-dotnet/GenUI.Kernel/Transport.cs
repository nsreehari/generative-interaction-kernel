// The transport seam and the kernel broker — the C# mirror of kernel/src/transport.ts.
// A transport is a pair of one-way message pipes carrying enveloped GUP messages
// ({ gup, type, payload }). KernelTransportHost binds a kernel to one or more connections:
// it onboards each (full manifest/document/snapshot, or an incremental replay for a client
// resuming from a known rev), dispatches inbound `event`s serially (monotonic rev), and
// broadcasts every resulting patch to all connections. Reconnection is a transport concern
// handled here, below the closed five-message GUP protocol. Zero dependencies beyond
// System.Text.Json — the concrete wire (HTTP/SSE, stdio, sockets) plugs in from outside.

using System.Text.Json.Nodes;

namespace GenUI.Kernel;

/// <summary>GUP wire helpers: build/parse the enveloped messages that cross a transport.
/// The wire shape matches the TS reference exactly (<c>{ gup, type, payload }</c>; patch
/// payload <c>{ rev, ops:[{ op, path, value? }] }</c>; event payload <c>{ node, name, payload? }</c>)
/// so a C# host and a TS client interoperate over the same bytes.</summary>
public static class Gup
{
    public const string Version = "0.1";

    /// <summary>Wrap a payload in a GUP envelope. The payload is cloned so the message owns its tree.</summary>
    public static JsonObject Message(string type, JsonNode? payload) => new()
    {
        ["gup"] = Version,
        ["type"] = type,
        ["payload"] = payload?.DeepClone(),
    };

    /// <summary>Serialize a <see cref="Patch"/> to its wire payload.</summary>
    public static JsonObject PatchPayload(Patch patch)
    {
        var ops = new JsonArray();
        foreach (var op in patch.Ops)
        {
            var o = new JsonObject { ["op"] = op.Op, ["path"] = op.Path };
            // `remove` carries no value; set/merge always do (JSON null is a real value).
            if (op.Op != "remove") o["value"] = op.Value?.DeepClone();
            ops.Add(o);
        }
        return new JsonObject { ["rev"] = patch.Rev, ["ops"] = ops };
    }

    /// <summary>Read an <c>event</c> message's payload into a <see cref="GupEvent"/>.</summary>
    public static GupEvent ParseEvent(JsonObject payload) => new(
        payload["node"]!.GetValue<string>(),
        payload["name"]!.GetValue<string>(),
        payload["payload"] as JsonObject);

    /// <summary>The <c>type</c> field of an enveloped message, or null when absent.</summary>
    public static string? TypeOf(JsonObject message) => message["type"]?.GetValue<string>();
}

/// <summary>Receives an enveloped GUP message arriving on a transport.</summary>
public delegate void TransportListener(JsonObject message);

/// <summary>One end of a bidirectional GUP message pipe. <see cref="Send"/> pushes a message to the
/// peer; <see cref="Subscribe"/> registers a listener for messages arriving from the peer.</summary>
public interface ITransport
{
    void Send(JsonObject message);
    IDisposable Subscribe(TransportListener listener);
}

/// <summary>Disposes by invoking an action once (idempotent). Small shared helper for unsubscribes.</summary>
internal sealed class Unsubscribe(Action dispose) : IDisposable
{
    private Action? _dispose = dispose;
    public void Dispose()
    {
        var d = _dispose;
        _dispose = null;
        d?.Invoke();
    }
}

/// <summary>An in-process transport whose peer receives everything it sends. Use
/// <see cref="CreatePair"/> for two linked endpoints — the reference transport for tests and
/// same-process hosting, exactly like <c>createInMemoryTransportPair</c> on the TS side.</summary>
public sealed class InMemoryTransport : ITransport
{
    private readonly HashSet<TransportListener> _listeners = new();

    /// <summary>The endpoint that receives this endpoint's sends.</summary>
    public InMemoryTransport? Peer { get; set; }

    public void Send(JsonObject message)
    {
        if (Peer is null) return;
        foreach (var listener in Peer._listeners.ToArray())
            listener(message);
    }

    public IDisposable Subscribe(TransportListener listener)
    {
        _listeners.Add(listener);
        return new Unsubscribe(() => _listeners.Remove(listener));
    }

    /// <summary>Two linked endpoints; each delivers to the other's subscribers.</summary>
    public static (ITransport Left, ITransport Right) CreatePair()
    {
        var left = new InMemoryTransport();
        var right = new InMemoryTransport();
        left.Peer = right;
        right.Peer = left;
        return (left, right);
    }
}

/// <summary>
/// Binds a kernel to one or more transport connections (a broker). It onboards each connection —
/// manifest/document/full-snapshot patch for a fresh client, or an incremental replay of missing
/// patches for a client resuming from a known rev — dispatches inbound <c>event</c>s serially
/// (monotonic rev), and broadcasts each patch to every connection. Reconnection is a transport
/// concern handled here, below the closed five-message GUP protocol. Mirrors KernelTransportHost.
/// </summary>
public sealed class KernelTransportHost
{
    private const int MaxLog = 256;

    private readonly JsonObject _manifest;
    private readonly JsonObject _document;
    private readonly Kernel _kernel;
    private readonly ITransport? _defaultTransport;

    private readonly HashSet<ITransport> _connections = new();
    private readonly Dictionary<ITransport, IDisposable> _unsubscribers = new();
    private readonly List<Patch> _log = new();
    private readonly object _dispatchGate = new();
    private bool _baselined;

    public KernelTransportHost(
        JsonObject manifest,
        JsonObject document,
        Kernel kernel,
        ITransport? defaultTransport = null)
    {
        _manifest = manifest;
        _document = document;
        _kernel = kernel;
        _defaultTransport = defaultTransport;
    }

    /// <summary>Convenience: attach the transport passed to the constructor.</summary>
    public void Start()
    {
        if (_defaultTransport is not null) Attach(_defaultTransport);
    }

    /// <summary>Register a connection and onboard it. Pass <paramref name="fromRev"/> to resume: if
    /// the host still holds the patches after that rev, only those deltas are replayed; otherwise the
    /// client is re-onboarded in full. Returns a handle that detaches the connection.</summary>
    public IDisposable Attach(ITransport transport, int? fromRev = null)
    {
        // Runs under the same gate as dispatch/broadcast so onboarding a new connection can't race
        // an in-flight event's AppendLog/Broadcast over the shared _log and _connections. The lock is
        // reentrant, so a Send that faults mid-broadcast and detaches on this thread is still safe.
        lock (_dispatchGate)
        {
            EnsureBaseline();
            _connections.Add(transport);
            var unsubscribe = transport.Subscribe(OnMessage);
            _unsubscribers[transport] = unsubscribe;
            Onboard(transport, fromRev);
        }
        return new Unsubscribe(() => Detach(transport));
    }

    public void Detach(ITransport transport)
    {
        lock (_dispatchGate)
        {
            if (_unsubscribers.Remove(transport, out var unsubscribe)) unsubscribe.Dispose();
            _connections.Remove(transport);
        }
    }

    /// <summary>Detach every connection.</summary>
    public void Stop()
    {
        ITransport[] snapshot;
        lock (_dispatchGate) snapshot = _connections.ToArray();
        foreach (var transport in snapshot) Detach(transport);
    }

    private void EnsureBaseline()
    {
        if (_baselined) return;
        _log.Add(_kernel.Baseline());
        _baselined = true;
    }

    private void Onboard(ITransport transport, int? fromRev)
    {
        var oldest = _log[0].Rev;
        var current = _log[^1].Rev;

        if (fromRev is int fr && fr >= oldest && fr <= current)
        {
            // Resume: the client already has manifest/document and state up to fromRev.
            foreach (var patch in _log)
                if (patch.Rev > fr)
                    transport.Send(Gup.Message("patch", Gup.PatchPayload(patch)));
            return;
        }

        // Full onboarding: vocabulary, structure, then the complete current state.
        transport.Send(Gup.Message("manifest", Json.Unwrap(_manifest)));
        transport.Send(Gup.Message("document", Json.Unwrap(_document)));
        transport.Send(Gup.Message("patch", Gup.PatchPayload(_kernel.SnapshotPatch())));
    }

    private void AppendLog(Patch patch)
    {
        _log.Add(patch);
        if (_log.Count > MaxLog) _log.RemoveAt(0);
    }

    private void Broadcast(JsonObject message)
    {
        foreach (var transport in _connections.ToArray())
            transport.Send(message);
    }

    // Only `event` messages drive the kernel; everything else is ignored (no echo loop). Dispatch is
    // serialized so revs stay monotonic even when events arrive concurrently from many connections.
    private void OnMessage(JsonObject message)
    {
        if (Gup.TypeOf(message) != "event") return;
        if (message["payload"] is not JsonObject payload) return;

        lock (_dispatchGate)
        {
            var patch = _kernel.Dispatch(Gup.ParseEvent(payload));
            AppendLog(patch);
            Broadcast(Gup.Message("patch", Gup.PatchPayload(patch)));
        }
    }
}
