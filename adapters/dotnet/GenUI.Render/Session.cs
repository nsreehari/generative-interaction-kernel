// The unified host session — ONE kernel driven by BOTH the in-process renderer AND remote agents.
//
// A standalone renderer (GenUIController) and a transport broker (KernelTransportHost) each drive a
// kernel; the single-owner IDispatchScheduler exists precisely so the SAME kernel can be shared by
// both without a data race. This session is the glue that stands that up: it builds one kernel, one
// scheduler, a controller, and a broker over them, then joins the renderer to the broker as an
// in-process transport connection. From there every event — a UI tap routed through Emit or an agent
// event arriving over an attached transport — funnels through the one broker/scheduler, and every
// resulting patch fans out to BOTH the renderer (which re-resolves) AND all transport connections
// (agents, SSE clients). It is the C# peer of what node-host.ts assembles by hand around
// KernelTransportHost, so a live WinUI surface and a remote agent can drive one kernel together.

using System.Text.Json.Nodes;
using GenUI.Kernel;
using GenKernel = GenUI.Kernel.Kernel;

namespace GenUI.Render;

/// <summary>A live GenUI host session: one shared kernel, driven by the in-process renderer and by
/// remote agents over transports, all serialized on one <see cref="IDispatchScheduler"/>.</summary>
public sealed class GenUISession : IDisposable
{
    private readonly KernelTransportHost _broker;
    private readonly ITransport _rendererLink;
    private readonly IDisposable _rendererSubscription;
    private readonly IDisposable _rendererAttachment;

    private GenUISession(
        GenUIController controller,
        InMemoryStateModel state,
        KernelTransportHost broker,
        ITransport rendererLink,
        IDisposable rendererSubscription,
        IDisposable rendererAttachment)
    {
        Controller = controller;
        State = state;
        _broker = broker;
        _rendererLink = rendererLink;
        _rendererSubscription = rendererSubscription;
        _rendererAttachment = rendererAttachment;
    }

    /// <summary>The renderer controller. Subscribe to it for resolved trees; it re-resolves on every
    /// dispatch, whether the event came from this session's <see cref="Emit"/> or an attached agent.</summary>
    public GenUIController Controller { get; }

    /// <summary>The session's state model — exposed for the rare host that must bridge bundles across
    /// kernel boundaries, mirroring <see cref="BundleRuntime"/>.</summary>
    public InMemoryStateModel State { get; }

    /// <summary>The broker every connection multiplexes through — the renderer and every agent. A
    /// transport server (HTTP/SSE, stdio) binds to this to onboard remote connections onto the same
    /// shared kernel; <see cref="Attach"/> is the in-process equivalent. Disposing a server bound to
    /// this broker stops it (detaching every connection, including the renderer), so give the server
    /// the session's lifetime.</summary>
    public KernelTransportHost Broker => _broker;

    /// <summary>Stand up a session for a bundle. Pass the UI dispatcher's scheduler (WinUI's
    /// <c>DispatcherQueueDispatchScheduler</c>) so UI-thread emits and background agent events share one
    /// owner; omit it for a headless/inline (lock) owner. Onboarding the renderer produces the first
    /// resolved tree, so subscribe to <see cref="Controller"/> before or immediately after this call.</summary>
    public static GenUISession FromBundle(Bundle bundle, IDispatchScheduler? scheduler = null)
    {
        var sched = scheduler ?? new InlineDispatchScheduler();
        var state = BundleLoader.SeedState(bundle.Manifest, bundle.State);
        var kernel = new GenKernel(bundle.Manifest, bundle.Document, state, bundle.Effects);
        var controller = new GenUIController(kernel, sched);
        var broker = new KernelTransportHost(bundle.Manifest, bundle.Document, kernel, scheduler: sched);

        // Join the renderer to the broker as an in-process connection: the broker end delivers every
        // patch to the renderer end, which re-resolves the controller. UI emits go the other way (see
        // Emit), so the renderer is a full peer of any agent connection rather than a side channel.
        var (brokerEnd, rendererEnd) = InMemoryTransport.CreatePair();
        var subscription = rendererEnd.Subscribe(message =>
        {
            // Only patches change state; the onboarding manifest/document carry nothing to re-resolve
            // for (the controller reads the shared kernel directly). The first snapshot patch, sent
            // during Attach below, is what produces the initial tree.
            if (Gup.TypeOf(message) == "patch") controller.Resync();
        });
        var attachment = broker.Attach(brokerEnd);

        return new GenUISession(controller, state, broker, rendererEnd, subscription, attachment);
    }

    /// <summary>Dispatch a UI-originated event. It is sent through the broker exactly like an agent
    /// event, so the resulting patch fans out to the renderer AND every attached transport — a UI tap
    /// is visible to connected agents, not just locally.</summary>
    public void Emit(string node, string name, JsonObject? payload = null) =>
        _rendererLink.Send(Gup.Message("event", new JsonObject
        {
            ["node"] = node,
            ["name"] = name,
            ["payload"] = payload?.DeepClone(),
        }));

    /// <summary>Attach a remote/agent transport connection (an SSE client, an in-process agent). It is
    /// onboarded with the full manifest/document/snapshot, then streamed every subsequent patch; its
    /// inbound events drive the same shared kernel. Returns a handle that detaches it.</summary>
    public IDisposable Attach(ITransport transport, int? fromRev = null) => _broker.Attach(transport, fromRev);

    /// <summary>Detach the renderer and every attached transport, ending the session.</summary>
    public void Dispose()
    {
        _rendererAttachment.Dispose();
        _rendererSubscription.Dispose();
        _broker.Stop();
    }
}
