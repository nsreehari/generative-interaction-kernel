using Microsoft.UI.Reactor.Core;

namespace GenUI.Render.Reactor;

/// <summary>
/// The Reactor adapter's Fluent-backed ThemeProvider: the ONE place that maps the platform's
/// semantic style roles onto concrete WinUI Fluent theme resources. It is the cross-platform
/// mirror of the React adapter's semantic-role block (host <c>styles.css</c> <c>.gx-host</c>),
/// which maps the SAME roles onto Fluent v9 design tokens. Both adapters therefore render one
/// shared vocabulary — Reactor via WinUI Fluent <see cref="ThemeRef"/>s, React via Fluent CSS
/// variables — so a document expresses intent (surface / primary text / muted / accent /
/// success / caution / critical) once and each toolkit resolves it to Fluent on its platform.
///
/// Every token here is a WinUI <see cref="Theme"/> reference: it resolves from the app's Fluent
/// <c>ThemeDictionaries</c> at render time and re-resolves automatically on a Light ↔ Dark
/// theme change — no per-component color literals, and no manual re-theming.
/// </summary>
public static class GenUITheme
{
    // Role -> Fluent token. Names mirror the React `.gx-host` semantic roles so the two
    // adapters stay a single vocabulary; the mapped Fluent brush is the platform equivalent.

    /// <summary>Card/panel surface. React role <c>--panel</c>.</summary>
    public static ThemeRef Surface => Theme.CardBackground;

    /// <summary>Divider / card border. React role <c>--line</c>.</summary>
    public static ThemeRef Stroke => Theme.CardStroke;

    /// <summary>Primary body/heading text. React role <c>--text</c>.</summary>
    public static ThemeRef PrimaryText => Theme.PrimaryText;

    /// <summary>Muted/secondary text (labels, headers, captions). React role <c>--muted</c>.</summary>
    public static ThemeRef MutedText => Theme.SecondaryText;

    /// <summary>Accent/brand text. React role <c>--accent</c>.</summary>
    public static ThemeRef Accent => Theme.AccentText;

    /// <summary>Positive/active signal. React role <c>--good</c>.</summary>
    public static ThemeRef Success => Theme.SystemSuccess;

    /// <summary>Warning/draft signal. React role <c>--warn</c>.</summary>
    public static ThemeRef Caution => Theme.SystemCaution;

    /// <summary>Error/danger signal. React role <c>--bad</c>.</summary>
    public static ThemeRef Critical => Theme.SystemCritical;
}
