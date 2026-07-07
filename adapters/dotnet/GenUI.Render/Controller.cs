// Framework-agnostic controller that runs the kernel's loop:
//   init -> resolve -> (on event) dispatch -> re-resolve -> notify.
// A Reactor/WinUI (or React) binding is a thin layer over this; the loop itself is
// testable headlessly. Mirrors the React adapter's controller.ts. The C# kernel is
// synchronous, so there is no async ceremony — the shape is otherwise identical.

using System.Text.Json.Nodes;
using GenUI.Kernel;
using GenKernel = GenUI.Kernel.Kernel;

namespace GenUI.Render;

/// <summary>Notified with the freshly resolved tree after start and after every dispatch.</summary>
public delegate void TreeListener(ResolvedNode tree);

public sealed class GenUIController
{
    private readonly GenKernel _kernel;
    private readonly IDispatchScheduler _scheduler;
    private readonly List<TreeListener> _listeners = new();

    /// <summary>Bind a controller to a kernel. Pass a shared <see cref="IDispatchScheduler"/> when the
    /// same kernel is also driven by a transport broker, so every dispatch — UI-originated or
    /// agent-originated — lands on one owner. Left null, the controller owns an inline (lock) scheduler,
    /// which is all a standalone in-process renderer needs.</summary>
    public GenUIController(GenKernel kernel, IDispatchScheduler? scheduler = null)
    {
        _kernel = kernel;
        _scheduler = scheduler ?? new InlineDispatchScheduler();
    }

    /// <summary>The most recently resolved tree, or null before <see cref="Start"/>.</summary>
    public ResolvedNode? Tree { get; private set; }

    /// <summary>The patch from the most recent dispatch, or null before the first emit.</summary>
    public Patch? LastPatch { get; private set; }

    /// <summary>Seed machine state and produce the first resolved tree.</summary>
    public ResolvedNode Start() => _scheduler.Invoke(() =>
    {
        _kernel.Init();
        return Refresh();
    });

    public IDisposable Subscribe(TreeListener listener)
    {
        _listeners.Add(listener);
        return new Subscription(_listeners, listener);
    }

    /// <summary>Dispatch a behavior event, then re-resolve and notify subscribers.</summary>
    public ResolvedNode Emit(string node, string name, JsonObject? payload = null) => _scheduler.Invoke(() =>
    {
        LastPatch = _kernel.Dispatch(new GupEvent(node, name, payload));
        return Refresh();
    });

    /// <summary>Re-resolve from the current kernel state and notify subscribers WITHOUT dispatching.
    /// For a shared kernel mutated by another owner on the same scheduler — a transport broker
    /// delivering an agent event — so the renderer reflects state it did not itself drive. Runs on the
    /// scheduler like every other kernel access; the scheduler is reentrant, so calling this from
    /// inside a broker broadcast (already on the owner) resolves inline.</summary>
    public ResolvedNode Resync() => _scheduler.Invoke(Refresh);

    private ResolvedNode Refresh()
    {
        var tree = _kernel.Resolve();
        Tree = tree;
        foreach (var listener in _listeners.ToArray()) listener(tree);
        return tree;
    }

    private sealed class Subscription(List<TreeListener> listeners, TreeListener listener) : IDisposable
    {
        public void Dispose() => listeners.Remove(listener);
    }
}
