using System;
using System.Collections.Generic;
using GenUI.Render;

namespace GenUI.Render.Reactor;

/// <summary>
/// The generic Reactor HOST — the C# mirror of the React floor's <c>host.tsx</c> (<c>BundleHost</c>).
/// It runs ANY <see cref="Bundle"/>: it loads the bundle (seeded store + kernel via
/// <see cref="BundleLoader.LoadBundle"/>) into a <see cref="GenUIController"/> and opens a
/// Reactor/WinUI window that renders it through <see cref="GenUIReactorViews"/>. The sample, a
/// profile app, and every hosted surface are just bundles handed to this host — there is no
/// privileged app shell, exactly as on the web.
/// </summary>
public static class BundleHost
{
    /// <summary>Load a bundle and open a window that renders it. Reuses the shared
    /// <see cref="ReactorHost"/> window + <see cref="GenUIHostComponent"/> render loop, so a bundle
    /// renders identically to any other controller-hosted surface.</summary>
    public static void Run(
        Bundle bundle,
        string title = "GenUI (Reactor)",
        int width = 1024,
        int height = 768)
    {
        ArgumentNullException.ThrowIfNull(bundle);
        GenUIController controller = BundleLoader.LoadBundle(bundle);
        ReactorHost.Run(controller, title, width, height);
    }

    /// <summary>Load a named app from a registry and run it. Mounting an app == running its bundle.</summary>
    public static void RunApp(
        AppRegistry apps,
        string name,
        string? title = null,
        int width = 1024,
        int height = 768)
    {
        ArgumentNullException.ThrowIfNull(apps);
        Bundle bundle = apps.Resolve(name)
            ?? throw new ArgumentException($"No app named '{name}' is registered.", nameof(name));
        Run(bundle, title ?? name, width, height);
    }
}

/// <summary>Produces a fresh runnable <see cref="Bundle"/> (including native effects) each mount.</summary>
public delegate Bundle AppFactory();

/// <summary>
/// The APP REGISTRY — the C# mirror of the React floor's <c>apps.tsx</c>. An "app" is just a
/// <see cref="Bundle"/>; a known app (one that ships native effect handlers, which can't live in
/// JSON) is mounted by name through this registry. The same bundle runs identically whether it is
/// the outermost mount or a leaf inside another surface.
/// </summary>
public sealed class AppRegistry
{
    private readonly Dictionary<string, AppFactory> _factories = new(StringComparer.Ordinal);

    /// <summary>Register (or replace) an app factory by name; returns this for fluent chaining.</summary>
    public AppRegistry Register(string name, AppFactory factory)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("App name is required.", nameof(name));
        }

        _factories[name] = factory ?? throw new ArgumentNullException(nameof(factory));
        return this;
    }

    /// <summary>Resolve a registered app to a fresh bundle, or null when the name is unknown.</summary>
    public Bundle? Resolve(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        return _factories.TryGetValue(name, out AppFactory? make) ? make() : null;
    }

    /// <summary>The set of registered app names (stable order of registration is not guaranteed).</summary>
    public IReadOnlyCollection<string> Names => _factories.Keys;
}
