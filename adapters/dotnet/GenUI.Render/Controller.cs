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
    private readonly List<TreeListener> _listeners = new();

    public GenUIController(GenKernel kernel) => _kernel = kernel;

    /// <summary>The most recently resolved tree, or null before <see cref="Start"/>.</summary>
    public ResolvedNode? Tree { get; private set; }

    /// <summary>The patch from the most recent dispatch, or null before the first emit.</summary>
    public Patch? LastPatch { get; private set; }

    /// <summary>Seed machine state and produce the first resolved tree.</summary>
    public ResolvedNode Start()
    {
        _kernel.Init();
        return Refresh();
    }

    public IDisposable Subscribe(TreeListener listener)
    {
        _listeners.Add(listener);
        return new Subscription(_listeners, listener);
    }

    /// <summary>Dispatch a behavior event, then re-resolve and notify subscribers.</summary>
    public ResolvedNode Emit(string node, string name, JsonObject? payload = null)
    {
        LastPatch = _kernel.Dispatch(new GupEvent(node, name, payload));
        return Refresh();
    }

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
