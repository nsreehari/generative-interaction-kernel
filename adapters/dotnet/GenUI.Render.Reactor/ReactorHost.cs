using System;
using GenUI.Render;
using Microsoft.UI.Reactor;
using Microsoft.UI.Reactor.Hosting;

namespace GenUI.Render.Reactor;

/// <summary>
/// Entry point for hosting a <see cref="GenUIController"/> in a Reactor/WinUI window.
/// <c>ReactorApp.Run&lt;TRoot&gt;</c> constructs the root component itself, so the controller is
/// handed to the root via a static seam that the root reads on mount.
/// </summary>
public static class ReactorHost
{
    /// <summary>The controller the active <see cref="GenUIHostComponent"/> binds to.</summary>
    internal static GenUIController? CurrentController { get; private set; }

    /// <summary>Opens a WinUI window that renders the controller's UI through the Reactor binding.</summary>
    public static void Run(
        GenUIController controller,
        string title = "GenUI (Reactor)",
        int width = 1024,
        int height = 768)
    {
        CurrentController = controller ?? throw new ArgumentNullException(nameof(controller));
        ReactorApp.Run<GenUIHostComponent>(title, width: width, height: height);
    }
}
