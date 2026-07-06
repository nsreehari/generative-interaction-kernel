using System;
using System.Collections.Generic;
using System.Text.Json;
using Microsoft.UI.Reactor.Core;

namespace GenUI.Render.Reactor;

/// <summary>
/// The Reactor adapter's Fluent-backed ThemeProvider. It reads the SAME shared source as the
/// React adapter — <c>theme/roles.json</c>, embedded into this assembly — and binds each semantic
/// role to its WinUI Fluent <see cref="ThemeRef"/> (the role's <c>winui</c> key). The React adapter
/// binds the same roles to Fluent v9 tokens; both therefore render one shared vocabulary from one
/// file, and Fluent drives the theme on each platform. Every resolved token is a WinUI
/// <see cref="Theme"/> reference: it resolves from the app's Fluent <c>ThemeDictionaries</c> at
/// render time and re-resolves automatically on a Light ↔ Dark theme change.
/// </summary>
public static class GenUITheme
{
    private const string ResourceName = "GenUI.Render.Reactor.theme.roles.json";

    // Role -> WinUI Fluent ThemeResource key, loaded once from the embedded theme/roles.json.
    private static readonly IReadOnlyDictionary<string, string> s_winuiByRole = LoadRoleWinuiKeys();

    /// <summary>Card/panel surface. React role <c>--panel</c>.</summary>
    public static ThemeRef Surface => Ref("surface");

    /// <summary>Divider / card border. React role <c>--line</c>.</summary>
    public static ThemeRef Stroke => Ref("line");

    /// <summary>Primary body/heading text. React role <c>--text</c>.</summary>
    public static ThemeRef PrimaryText => Ref("text");

    /// <summary>Muted/secondary text (labels, headers, captions). React role <c>--muted</c>.</summary>
    public static ThemeRef MutedText => Ref("muted");

    /// <summary>Accent/brand text. React role <c>--accent</c>.</summary>
    public static ThemeRef Accent => Ref("accent");

    /// <summary>Positive/active signal. React role <c>--good</c>.</summary>
    public static ThemeRef Success => Ref("good");

    /// <summary>Warning/draft signal. React role <c>--warn</c>.</summary>
    public static ThemeRef Caution => Ref("warn");

    /// <summary>Error/danger signal. React role <c>--bad</c>.</summary>
    public static ThemeRef Critical => Ref("bad");

    private static ThemeRef Ref(string role) =>
        s_winuiByRole.TryGetValue(role, out var key)
            ? Theme.Ref(key)
            : throw new InvalidOperationException($"theme/roles.json has no role '{role}'");

    private static IReadOnlyDictionary<string, string> LoadRoleWinuiKeys()
    {
        var assembly = typeof(GenUITheme).Assembly;
        using var stream = assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"embedded theme resource '{ResourceName}' not found");
        using var doc = JsonDocument.Parse(stream);

        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var role in doc.RootElement.GetProperty("roles").EnumerateObject())
        {
            map[role.Name] = role.Value.GetProperty("winui").GetString()
                ?? throw new InvalidOperationException($"role '{role.Name}' is missing a 'winui' key");
        }

        return map;
    }
}
