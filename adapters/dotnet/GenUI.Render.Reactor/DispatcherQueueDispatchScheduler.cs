using System;
using System.Runtime.ExceptionServices;
using System.Threading;
using GenUI.Kernel;
using Microsoft.UI.Dispatching;

namespace GenUI.Render.Reactor;

/// <summary>
/// The WinUI single owner for a shared-kernel session: every kernel dispatch and the renderer
/// refresh it triggers run on the <see cref="DispatcherQueue"/>'s thread — the same UI thread WinUI
/// control mutations must run on. UI-originated emits already on that thread run inline; transport
/// events arriving on background (HTTP) threads are marshaled here and block until the UI thread has
/// applied them, so a kernel driven by both the UI and remote agents stays single-owner.
/// </summary>
public sealed class DispatcherQueueDispatchScheduler : IDispatchScheduler
{
    private readonly DispatcherQueue _queue;

    public DispatcherQueueDispatchScheduler(DispatcherQueue queue) =>
        _queue = queue ?? throw new ArgumentNullException(nameof(queue));

    /// <summary>Bind to the DispatcherQueue of the calling (UI) thread.</summary>
    public static DispatcherQueueDispatchScheduler ForCurrentThread() =>
        new(DispatcherQueue.GetForCurrentThread()
            ?? throw new InvalidOperationException(
                "No DispatcherQueue on the current thread; construct the scheduler on the UI thread."));

    public void Invoke(Action work) => Invoke<object?>(() =>
    {
        work();
        return null;
    });

    public T Invoke<T>(Func<T> work)
    {
        // Already on the owner (a UI-thread emit, or a reentrant detach during broadcast): run inline
        // so we neither deadlock waiting on ourselves nor re-queue behind pending work.
        if (_queue.HasThreadAccess) return work();

        T result = default!;
        ExceptionDispatchInfo? error = null;
        using var done = new ManualResetEventSlim(false);

        if (!_queue.TryEnqueue(() =>
            {
                try { result = work(); }
                catch (Exception ex) { error = ExceptionDispatchInfo.Capture(ex); }
                finally { done.Set(); }
            }))
        {
            throw new InvalidOperationException(
                "GenUI dispatch scheduler: the dispatcher queue is shut down.");
        }

        done.Wait();
        error?.Throw();
        return result;
    }
}
