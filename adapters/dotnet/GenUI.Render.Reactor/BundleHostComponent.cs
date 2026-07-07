using System;
using GenUI.Kernel;
using GenUI.Render;
using GenUI.Transport.HttpSse;
using Microsoft.UI.Reactor;
using Microsoft.UI.Reactor.Core;
using static Microsoft.UI.Reactor.Factories;

namespace GenUI.Render.Reactor;

/// <summary>Props for <see cref="BundleHostComponent"/>: the bundle to run, plus an optional
/// capability registry override (defaults to <see cref="GenUIReactorViews.Registry"/>).</summary>
public sealed record BundleHostProps(Bundle Bundle, IComponentRegistry<Element>? Registry = null);

/// <summary>
/// The EMBEDDABLE generic host — the C# mirror of the React floor's <c>host.tsx</c> component
/// (<c>&lt;BundleHost bundle={…} /&gt;</c>). Unlike the window-level <see cref="BundleHost.Run"/>,
/// this is an ordinary <see cref="Element"/> subtree: it loads its <see cref="BundleHostProps.Bundle"/>
/// once into a <see cref="GenUISession"/> — one shared kernel driven by BOTH this window and any
/// remote agent that attaches over the SSE endpoint below — subscribes to resolved trees, and
/// re-renders them through <see cref="Renderer.Render{TView}"/> (TView = <see cref="Element"/>). It
/// owns no imperative UI mutation — only state-driven re-render — so any surface (a shell, a tab, a
/// leaf) can drop a bundle into its tree and run it. Give each instance a stable <c>.WithKey(name)</c>
/// so switching bundles remounts a fresh session instead of reusing a stale one.
/// </summary>
public sealed class BundleHostComponent : Component<BundleHostProps>
{
    public override Element Render()
    {
        IComponentRegistry<Element> registry = Props.Registry ?? GenUIReactorViews.Registry;

        // One session per bundle identity: one kernel driven by BOTH this window (via Emit) and any
        // agent that attaches over the transport below, sharing the UI-thread dispatcher so background
        // agent events marshal onto the render thread. Memoized so re-renders reuse it; rebuilt (paired
        // with a keyed call site) only when a different bundle instance is handed in.
        GenUISession session = UseMemo(
            () => GenUISession.FromBundle(Props.Bundle, DispatcherQueueDispatchScheduler.ForCurrentThread()),
            Props.Bundle);

        (ResolvedNode? tree, Action<ResolvedNode?> setTree) = UseState<ResolvedNode?>(null);

        // Emits route through the session (broker), so a UI tap fans out to the renderer AND every
        // attached agent — the same path an agent's own event travels.
        EmitFn emit = (id, name, payload) => session.Emit(id, name, payload);

        UseEffect(() =>
        {
            IDisposable subscription = session.Controller.Subscribe(t => setTree(t));
            // Onboarding already produced the first tree while building the session; seed it now that
            // this subscription is live so the initial render paints without waiting for an event.
            setTree(session.Controller.Tree);

            // Expose the running bundle to remote agents over HTTP/SSE.
            IDisposable? server = TryServe(session);

            return () =>
            {
                server?.Dispose();
                subscription.Dispose();
                session.Dispose();
            };
        }, session);

        if (tree is null)
        {
            return TextBlock("Loading\u2026").Margin(16);
        }

        return Renderer.Render(tree, registry, emit)
            ?? (Element)TextBlock("(root not visible)").Margin(16);
    }

    // Bind an SSE transport server to the session's broker so remote agents attach to the same shared
    // kernel the window renders. Best-effort: a bind failure (port taken during a bundle switch, no
    // urlacl) returns null and must never stop the window from rendering — the endpoint is a bonus,
    // not a dependency. Endpoint prefix is env-configurable, mirroring the MCP wrapper.
    private static IDisposable? TryServe(GenUISession session)
    {
        string prefix = Environment.GetEnvironmentVariable("GENUI_GUP_SSE_PREFIX") ?? "http://localhost:8789/";
        try
        {
            var server = new SseTransportServer(session.Broker, prefix);
            server.Start();
            return server;
        }
        catch (Exception)
        {
            return null;
        }
    }
}
