// The single-owner dispatch discipline. A GenUI kernel is a mutable synchronous machine —
// Dispatch/Init/SnapshotPatch each touch the store and advance the rev, with no internal
// locking. Once one kernel is shared by more than one dispatch source (the in-process renderer
// emitting on the UI thread AND a transport broker delivering agent events on background HTTP
// threads), the kernel becomes a concurrency boundary. This seam funnels every kernel access and
// every reaction to it (renderer refresh, transport broadcast) through ONE owner, so the kernel is
// only ever touched by a single thread at a time.
//
// Implementations choose who the owner is: a reentrant lock (headless / tests) or a UI dispatcher
// thread (WinUI), where the owner is also the thread control mutations must run on. Both the
// renderer controller and the broker take an IDispatchScheduler; passing the SAME instance to both
// is what makes a shared-kernel session safe.

namespace GenUI.Kernel;

/// <summary>Runs work on the single owner that is allowed to touch a shared kernel. Calls block
/// until the owner has run the work, so the caller can rely on the result being applied.</summary>
public interface IDispatchScheduler
{
    /// <summary>Run <paramref name="work"/> on the owner and block until it completes.</summary>
    void Invoke(Action work);

    /// <summary>Run <paramref name="work"/> on the owner, block, and return its result.</summary>
    T Invoke<T>(Func<T> work);
}

/// <summary>The default owner: a reentrant lock. It serializes dispatch without pinning it to a
/// particular thread — correct for headless hosting and tests, where there is no UI thread to
/// respect. A UI binding supplies a dispatcher-thread scheduler instead (see the Reactor adapter).
/// The lock is reentrant, so a broadcast that faults mid-send and detaches on the same thread — or
/// any other nested <see cref="Invoke"/> on the owner — does not deadlock.</summary>
public sealed class InlineDispatchScheduler : IDispatchScheduler
{
    private readonly object _gate = new();

    public void Invoke(Action work)
    {
        lock (_gate) work();
    }

    public T Invoke<T>(Func<T> work)
    {
        lock (_gate) return work();
    }
}
