using System;
using System.Linq;
using GenUI.Render;
using Microsoft.UI.Reactor;
using Microsoft.UI.Reactor.Core;
using static Microsoft.UI.Reactor.Factories;

namespace GenUI.Render.Reactor;

/// <summary>
/// Entry point for the WinUI/Reactor SHELL — the .NET peer of the React web floor's app host
/// (<c>apps/console</c> + <c>apps/workbench</c>): one window that browses <b>Samples</b>
/// (platform-owned example bundles), <b>Apps</b> (installed profile bundles), and <b>Host</b>
/// (session/transport diagnostics). The shell owns navigation only; runtime truth lives in each
/// bundle's controller via <see cref="BundleHostComponent"/>. Two <see cref="AppRegistry"/>
/// instances are handed to the root through a static seam because <c>ReactorApp.Run&lt;TRoot&gt;</c>
/// constructs the root itself (same pattern as <see cref="ReactorHost"/>).
/// </summary>
public static class ShellHost
{
    /// <summary>Platform-owned example bundles browsed under the Samples section.</summary>
    internal static AppRegistry Samples { get; private set; } = new();

    /// <summary>Installed profile bundles browsed under the Apps section.</summary>
    internal static AppRegistry Apps { get; private set; } = new();

    /// <summary>Open the shell window over the given sample and app registries.</summary>
    public static void Run(
        AppRegistry samples,
        AppRegistry apps,
        string title = "GenUI Shell",
        int width = 1100,
        int height = 720)
    {
        Samples = samples ?? throw new ArgumentNullException(nameof(samples));
        Apps = apps ?? throw new ArgumentNullException(nameof(apps));
        ReactorApp.Run<ShellComponent>(title, width: width, height: height);
    }
}

/// <summary>
/// The shell root: a nav rail (Samples / Apps / Host) beside a content region. Selecting an entry
/// resolves a fresh <see cref="Bundle"/> from the active registry and hands it to a keyed
/// <see cref="BundleHostComponent"/>, so mounting an app == running its bundle. The shell holds no
/// runtime state of its own — only the current section and selection.
/// </summary>
public sealed class ShellComponent : Component
{
    private const string SamplesSection = "Samples";
    private const string AppsSection = "Apps";
    private const string HostSection = "Host";

    private sealed record Selection(string Name, Bundle Bundle);

    public override Element Render()
    {
        (string section, Action<string> setSection) = UseState(SamplesSection);
        (Selection? selection, Action<Selection?> setSelection) = UseState<Selection?>(null);

        void GoTo(string next)
        {
            setSection(next);
            setSelection(null);
        }

        Element body = section switch
        {
            HostSection => HostPanel(),
            AppsSection => BundleSection(ShellHost.Apps, selection, setSelection, "No apps registered yet."),
            _ => BundleSection(ShellHost.Samples, selection, setSelection, "No samples registered."),
        };

        return HStack(0, NavRail(section, GoTo), body);
    }

    // The left rail: title over one button per section; the active section carries a bullet marker.
    private static Element NavRail(string active, Action<string> goTo)
    {
        Element Item(string name) =>
            Button((active == name ? "\u2022 " : "   ") + name, () => goTo(name))
                .AutomationName(name)
                .WithKey(name);

        return VStack(8,
                TextBlock("GenUI Shell").Bold().FontSize(16).Foreground(GenUITheme.PrimaryText),
                Item(SamplesSection),
                Item(AppsSection),
                Item(HostSection))
            .Padding(16)
            .Width(200)
            .Background(GenUITheme.Surface)
            .WithBorder(GenUITheme.Stroke)
            .Landmark(Microsoft.UI.Xaml.Automation.Peers.AutomationLandmarkType.Navigation);
    }

    // A registry browser: a list of registered names beside the running bundle for the selection.
    private static Element BundleSection(
        AppRegistry registry,
        Selection? selection,
        Action<Selection?> setSelection,
        string emptyMessage)
    {
        string[] names = registry.Names.OrderBy(n => n, StringComparer.Ordinal).ToArray();

        Element list = names.Length == 0
            ? (Element)TextBlock(emptyMessage).Foreground(GenUITheme.MutedText).Margin(16)
            : VStack(6, names
                    .Select(name => (Element)Button(
                            (selection?.Name == name ? "\u2022 " : "   ") + name,
                            // Resolve to a fresh bundle at click time (not per render) and pin it in state.
                            () => setSelection(new Selection(name, registry.Resolve(name)!)))
                        .AutomationName(name)
                        .WithKey(name))
                    .ToArray())
                .Padding(16)
                .Width(240);

        Element content = selection is null
            ? (Element)TextBlock("Select an entry to run it.").Foreground(GenUITheme.MutedText).Margin(16)
            // Keyed by name so switching entries remounts a fresh controller instead of reusing one.
            : Component<BundleHostComponent, BundleHostProps>(new BundleHostProps(selection.Bundle))
                .WithKey(selection.Name);

        return HStack(0, list, content);
    }

    // Session/transport diagnostics. Both endpoints are best-effort (a bind failure leaves the window
    // fully functional); the GUP stream tracks whichever bundle is currently running.
    private static Element HostPanel()
    {
        string samples = string.Join(", ", ShellHost.Samples.Names.OrderBy(n => n, StringComparer.Ordinal));
        string apps = string.Join(", ", ShellHost.Apps.Names.OrderBy(n => n, StringComparer.Ordinal));
        string mcpPrefix = Environment.GetEnvironmentVariable("GENUI_AGENTFACE_MCP_PREFIX") ?? "http://localhost:8788/";
        string ssePrefix = (Environment.GetEnvironmentVariable("GENUI_GUP_SSE_PREFIX") ?? "http://localhost:8789/").TrimEnd('/');

        return VStack(8,
                TextBlock("Host session").Bold().FontSize(18).Foreground(GenUITheme.PrimaryText),
                TextBlock($"Samples: {(samples.Length == 0 ? "(none)" : samples)}").Foreground(GenUITheme.PrimaryText),
                TextBlock($"Apps: {(apps.Length == 0 ? "(none)" : apps)}").Foreground(GenUITheme.PrimaryText),
                TextBlock($"AgentFace MCP: {mcpPrefix}mcp \u2014 agent-authoring tools").Foreground(GenUITheme.PrimaryText),
                TextBlock($"GUP stream: {ssePrefix}/gup/stream \u2014 agents drive the running bundle").Foreground(GenUITheme.PrimaryText),
                TextBlock("Both endpoints are best-effort; a bind failure leaves the window fully functional.")
                    .Foreground(GenUITheme.MutedText))
            .Padding(16)
            .Margin(16)
            .Background(GenUITheme.Surface)
            .WithBorder(GenUITheme.Stroke)
            .CornerRadius(8);
    }
}
