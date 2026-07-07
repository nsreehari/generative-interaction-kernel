using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using GenUI.Render;
using Microsoft.UI.Reactor;
using Microsoft.UI.Reactor.Core;
using Microsoft.UI.Reactor.Layout;
using Microsoft.UI.Xaml.Automation.Peers;
using static Microsoft.UI.Reactor.Factories;

namespace GenUI.Render.Reactor;

/// <summary>
/// The concrete toolkit binding: maps the shared floor's <c>alias:name</c> capabilities to Reactor
/// <see cref="Element"/>s (TView = Element). Keys are NAMESPACED (<c>ui:*</c>) to match the migrated
/// manifests' <c>externals.components</c> imports; this single binding-edge registry provides the
/// whole <c>ui</c> vocabulary — the shared floor primitives (the C# peer of the React floor's
/// <c>FLOOR_COMPONENTS</c>) plus the live-cards profile leaves (<c>ui:board</c>/<c>ui:actions</c>)
/// that ride the same alias. Unlike the React adapter, the .NET model attaches views at the binding
/// edge (not on the bundle), so there is no per-bundle import resolution: the renderer looks each
/// resolved capability up here verbatim. Each view honours the resolved node's props and its
/// node-bound <see cref="EmitBound"/> emit; container views compose children the shared
/// <see cref="Renderer"/> walk has already rendered. Visibility, fallback, and emit-id capture live
/// in the renderer-agnostic core, so every C# binding renders the same tree identically above the leaves.
/// </summary>
public static class GenUIReactorViews
{
    /// <summary>Shared registry mapping namespaced capability ids to Reactor element factories.</summary>
    public static ComponentRegistry<Element> Registry { get; } = Build();

    private static ComponentRegistry<Element> Build() => new(
        new Dictionary<string, CapabilityView<Element>>
        {
            // Layout
            ["ui:screen"] = Screen,
            ["ui:row"] = Row,
            ["ui:col"] = Col,
            ["ui:panel"] = Panel,
            // Text / status
            ["ui:text"] = Text,
            ["ui:heading"] = Heading,
            ["ui:note"] = Note,
            ["ui:badge"] = Badge,
            ["ui:metric"] = Metric,
            ["ui:codeBlock"] = CodeBlock,
            // Data display
            ["ui:list"] = List,
            ["ui:table"] = Table,
            // Inputs
            ["ui:field"] = Field,
            ["ui:textarea"] = TextArea,
            ["ui:select"] = Select,
            ["ui:button"] = ButtonView,
            ["ui:tabBar"] = TabBar,
            ["ui:chips"] = Chips,
            // Composition
            ["ui:embed"] = Embed,
            // Live-cards profile leaves that share the `ui` alias.
            ["ui:board"] = Board,
            ["ui:actions"] = Actions,
        },
        fallback: Fallback);

    // Container: an optional title over the already-rendered children.
    private static Element Board(CapabilityViewProps<Element> p)
    {
        var children = new List<Element>();
        if (Str(p.Node.Props, "title") is { } title)
        {
            children.Add(TextBlock(title).Bold().FontSize(18).Foreground(GenUITheme.PrimaryText));
        }

        children.AddRange(p.Children);
        // The board is the app's main content region: mark it so screen readers can jump to it.
        // Fluent surface + stroke so it reads as a themed card and adapts on Light <-> Dark.
        return VStack(12, children.ToArray())
            .Padding(16)
            .Margin(16)
            .Background(GenUITheme.Surface)
            .WithBorder(GenUITheme.Stroke)
            .CornerRadius(8)
            .Landmark(AutomationLandmarkType.Main);
    }

    // Leaf: a labelled value read from the node's props (label required, value optional).
    private static Element Metric(CapabilityViewProps<Element> p) =>
        VStack(2,
            TextBlock(Str(p.Node.Props, "label") ?? string.Empty).FontSize(12).Foreground(GenUITheme.MutedText),
            TextBlock(Str(p.Node.Props, "value") ?? "\u2014").Bold().FontSize(20).Foreground(GenUITheme.PrimaryText));

    // Leaf: a button whose tap round-trips through the node-bound emit.
    private static Element Actions(CapabilityViewProps<Element> p)
    {
        string label = Str(p.Node.Props, "label") ?? "Action";
        return Button(label, () => p.Emit("tap")).AutomationName(label);
    }

    // Leaf: a header row plus one row per data item. Columns may be strings or {key,label} objects;
    // a non-static row is a button whose tap emits rowSelect with the row's id (row[idKey] ?? index).
    private static Element Table(CapabilityViewProps<Element> p)
    {
        (string Key, string Label)[] columns = ListArray(p.Node.Props, "columns")
            .Select(c => c is JsonObject co
                ? (Key: Str(co, "key") ?? string.Empty, Label: Str(co, "label") ?? Str(co, "key") ?? string.Empty)
                : (Key: NodeStr(c), Label: NodeStr(c)))
            .ToArray();
        JsonArray rows = ListArray(p.Node.Props, "rows");
        string idKey = StrOr(p.Node.Props, "idKey", "id");
        bool isStatic = Bool(p.Node.Props, "static");
        string blank = StrOr(p.Node.Props, "blankText", string.Empty);

        if (rows.Count == 0)
        {
            return TextBlock(StrOr(p.Node.Props, "emptyText", "No rows.")).Foreground(GenUITheme.MutedText);
        }

        var rowElements = new List<Element>();
        if (columns.Length > 0)
        {
            rowElements.Add(HStack(12, columns
                .Select(c => (Element)TextBlock(c.Label).Bold().FontSize(12).Foreground(GenUITheme.MutedText))
                .ToArray()));
        }

        for (var i = 0; i < rows.Count; i++)
        {
            var row = rows[i] as JsonObject;
            string id = Str(row, idKey) ?? i.ToString();
            Element[] cells = columns.Length > 0
                ? columns.Select(c =>
                    {
                        string? text = Str(row, c.Key);
                        return (Element)TextBlock(string.IsNullOrEmpty(text) ? blank : text)
                            .FontSize(13).Foreground(GenUITheme.PrimaryText);
                    }).ToArray()
                : new[] { (Element)TextBlock(row?.ToJsonString() ?? string.Empty).FontSize(13).Foreground(GenUITheme.PrimaryText) };

            Element rowBody = HStack(12, cells);
            if (isStatic)
            {
                rowElements.Add(rowBody);
            }
            else
            {
                string rowId = id;
                rowElements.Add(Button(rowBody, () => p.Emit("rowSelect", new JsonObject { ["id"] = rowId }))
                    .AutomationName($"Row {i + 1}"));
            }
        }

        return VStack(4, rowElements.ToArray());
    }

    // --- Shared floor: layout ---------------------------------------------------------------

    // A titled screen: a header (title + optional subtitle) over the already-rendered body children.
    private static Element Screen(CapabilityViewProps<Element> p)
    {
        var head = new List<Element>
        {
            TextBlock(StrOr(p.Node.Props, "title", string.Empty)).Bold().FontSize(24).Foreground(GenUITheme.PrimaryText),
        };
        if (Str(p.Node.Props, "subtitle") is { } subtitle)
        {
            head.Add(TextBlock(subtitle).FontSize(13).Foreground(GenUITheme.MutedText));
        }

        var children = new List<Element> { VStack(2, head.ToArray()) };
        children.AddRange(p.Children);
        return VStack(12, children.ToArray()).Padding(16);
    }

    // A horizontal group of already-rendered children; `spacing` tunes the gap.
    private static Element Row(CapabilityViewProps<Element> p) =>
        HStack(Spacing(p.Node.Props), p.Children.ToArray());

    // A vertical group of already-rendered children; `spacing` tunes the gap.
    private static Element Col(CapabilityViewProps<Element> p) =>
        VStack(Spacing(p.Node.Props), p.Children.ToArray());

    // A themed card: an optional title over its children, on the Fluent surface + stroke.
    private static Element Panel(CapabilityViewProps<Element> p)
    {
        var children = new List<Element>();
        if (Str(p.Node.Props, "title") is { } title)
        {
            children.Add(TextBlock(title).Bold().FontSize(16).Foreground(GenUITheme.PrimaryText));
        }

        children.AddRange(p.Children);
        return VStack(8, children.ToArray())
            .Padding(12)
            .Background(GenUITheme.Surface)
            .WithBorder(GenUITheme.Stroke)
            .CornerRadius(8);
    }

    // --- Shared floor: text / status --------------------------------------------------------

    // Inline text; `variant` selects a small set of type treatments (body/caption/strong).
    private static Element Text(CapabilityViewProps<Element> p)
    {
        var text = TextBlock(StrOr(p.Node.Props, "value", string.Empty));
        return StrOr(p.Node.Props, "variant", "body") switch
        {
            "caption" => text.FontSize(12).Foreground(GenUITheme.MutedText),
            "strong" => text.Bold().Foreground(GenUITheme.PrimaryText),
            _ => text.Foreground(GenUITheme.PrimaryText),
        };
    }

    // A heading; `level` (1-4) selects the type size.
    private static Element Heading(CapabilityViewProps<Element> p)
    {
        double size = StrOr(p.Node.Props, "level", "2") switch
        {
            "1" => 24,
            "3" => 16,
            "4" => 14,
            _ => 20,
        };
        return TextBlock(StrOr(p.Node.Props, "value", string.Empty)).Bold().FontSize(size).Foreground(GenUITheme.PrimaryText);
    }

    // A muted/toned caption line.
    private static Element Note(CapabilityViewProps<Element> p) =>
        TextBlock(StrOr(p.Node.Props, "value", string.Empty))
            .FontSize(13)
            .Foreground(ToneBrush(StrOr(p.Node.Props, "tone", "muted")));

    // A small toned label (tone defaults to the value, mirroring the React floor).
    private static Element Badge(CapabilityViewProps<Element> p)
    {
        string value = StrOr(p.Node.Props, "value", string.Empty);
        return TextBlock(value).Bold().FontSize(12).Foreground(ToneBrush(StrOr(p.Node.Props, "tone", value)));
    }

    // A whitespace-preserving block for JSON/code dumps (reads `code`), on the Fluent surface.
    private static Element CodeBlock(CapabilityViewProps<Element> p) =>
        VStack(0, TextBlock(StrOr(p.Node.Props, "code", string.Empty)).FontSize(13).Foreground(GenUITheme.PrimaryText))
            .Padding(8)
            .Background(GenUITheme.Surface)
            .WithBorder(GenUITheme.Stroke)
            .CornerRadius(4);

    // --- Shared floor: data display ---------------------------------------------------------

    // A list of items. String items render their value; object items read primary/secondary/badge/
    // value keys. A non-static row is a button whose tap emits select with the item's id.
    private static Element List(CapabilityViewProps<Element> p)
    {
        JsonArray items = ListArray(p.Node.Props, "items");
        string idKey = StrOr(p.Node.Props, "idKey", "id");
        string primaryKey = StrOr(p.Node.Props, "primaryKey", "label");
        string? secondaryKey = Str(p.Node.Props, "secondaryKey");
        string? badgeKey = Str(p.Node.Props, "badgeKey");
        string? valueKey = Str(p.Node.Props, "valueKey");
        bool isStatic = Bool(p.Node.Props, "static");
        bool badgeLeading = Bool(p.Node.Props, "badgeLeading");

        if (items.Count == 0)
        {
            return TextBlock(StrOr(p.Node.Props, "emptyText", "Nothing here yet.")).Foreground(GenUITheme.MutedText);
        }

        var rows = new List<Element>();
        for (var i = 0; i < items.Count; i++)
        {
            JsonNode? raw = items[i];
            bool isStr = raw is JsonValue rv && rv.TryGetValue<string>(out _);
            var item = raw as JsonObject;
            string id = isStr ? raw!.GetValue<string>() : (Str(item, idKey) ?? i.ToString());
            string primary = isStr ? raw!.GetValue<string>() : (Str(item, primaryKey) ?? string.Empty);

            var cells = new List<Element>();
            Element? badge = !isStr && badgeKey is not null && Str(item, badgeKey) is { } badgeText
                ? TextBlock(badgeText).Bold().FontSize(11).Foreground(ToneBrush(badgeText))
                : null;
            if (badgeLeading && badge is not null)
            {
                cells.Add(badge);
            }

            cells.Add(TextBlock(primary).Foreground(GenUITheme.PrimaryText));
            if (!badgeLeading && badge is not null)
            {
                cells.Add(badge);
            }

            if (!isStr && secondaryKey is not null && Str(item, secondaryKey) is { } secondary)
            {
                cells.Add(TextBlock(secondary).FontSize(12).Foreground(GenUITheme.MutedText));
            }

            if (!isStr && valueKey is not null && Str(item, valueKey) is { } value)
            {
                cells.Add(TextBlock(value).FontSize(12).Foreground(GenUITheme.MutedText));
            }

            Element rowBody = HStack(8, cells.ToArray());
            if (isStatic)
            {
                rows.Add(rowBody);
            }
            else
            {
                string rowId = id;
                rows.Add(Button(rowBody, () => p.Emit("select", new JsonObject { ["id"] = rowId }))
                    .AutomationName(primary.Length > 0 ? primary : rowId));
            }
        }

        return VStack(4, rows.ToArray());
    }

    // --- Shared floor: inputs ---------------------------------------------------------------

    // A single-line text input; edits emit input with the new value. The label rides the control
    // header so screen readers announce it.
    private static Element Field(CapabilityViewProps<Element> p) =>
        TextBox(
            StrOr(p.Node.Props, "value", string.Empty),
            v => p.Emit("input", new JsonObject { ["value"] = v }),
            StrOr(p.Node.Props, "placeholder", string.Empty),
            StrOr(p.Node.Props, "label", string.Empty));

    // A multi-line text input; edits emit input with the new value.
    private static Element TextArea(CapabilityViewProps<Element> p) =>
        TextBox(
            StrOr(p.Node.Props, "value", string.Empty),
            v => p.Emit("input", new JsonObject { ["value"] = v }),
            StrOr(p.Node.Props, "placeholder", string.Empty),
            StrOr(p.Node.Props, "label", string.Empty))
        .Set(tb => tb.AcceptsReturn = true);

    // A dropdown over `options` (strings or {value,label}); a selection emits change with the value.
    private static Element Select(CapabilityViewProps<Element> p)
    {
        (string Value, string Label)[] options = ListArray(p.Node.Props, "options")
            .Select(o => o is JsonObject oo
                ? (Value: Str(oo, "value") ?? string.Empty, Label: Str(oo, "label") ?? Str(oo, "value") ?? string.Empty)
                : (Value: NodeStr(o), Label: NodeStr(o)))
            .ToArray();
        string value = StrOr(p.Node.Props, "value", string.Empty);
        int selected = Array.FindIndex(options, o => o.Value == value);
        string label = StrOr(p.Node.Props, "label", string.Empty);

        Element combo = ComboBox(
            options.Select(o => o.Label).ToArray(),
            selected < 0 ? 0 : selected,
            i =>
            {
                if (i >= 0 && i < options.Length)
                {
                    p.Emit("change", new JsonObject { ["value"] = options[i].Value });
                }
            });

        return label.Length > 0
            ? VStack(2, TextBlock(label).FontSize(12).Foreground(GenUITheme.MutedText), combo)
            : combo;
    }

    // A button whose tap emits press. `disabled` mutes it on materialization.
    private static Element ButtonView(CapabilityViewProps<Element> p)
    {
        string label = StrOr(p.Node.Props, "label", string.Empty);
        var button = Button(label, () => p.Emit("press", new JsonObject())).AutomationName(label);
        return Bool(p.Node.Props, "disabled") ? button.Set(b => b.IsEnabled = false) : button;
    }

    // A row of tabs; the active one carries a bullet marker, a tap emits select with the value.
    private static Element TabBar(CapabilityViewProps<Element> p)
    {
        string active = StrOr(p.Node.Props, "active", string.Empty);
        Element[] tabs = ListArray(p.Node.Props, "options")
            .Select(o => o is JsonObject oo
                ? (Value: Str(oo, "value") ?? string.Empty, Label: Str(oo, "label") ?? Str(oo, "value") ?? string.Empty)
                : (Value: NodeStr(o), Label: NodeStr(o)))
            .Select(o =>
            {
                string val = o.Value;
                return (Element)Button(
                        (val == active ? "\u2022 " : string.Empty) + o.Label,
                        () => p.Emit("select", new JsonObject { ["value"] = val }))
                    .AutomationName(o.Label);
            })
            .ToArray();
        return HStack(4, tabs);
    }

    // A row of removable chips; each remove button emits remove with the chip's value.
    private static Element Chips(CapabilityViewProps<Element> p)
    {
        (string Value, string Label)[] items = ListArray(p.Node.Props, "items")
            .Select(o => o is JsonObject oo
                ? (Value: Str(oo, "value") ?? string.Empty, Label: Str(oo, "label") ?? Str(oo, "value") ?? string.Empty)
                : (Value: NodeStr(o), Label: NodeStr(o)))
            .ToArray();

        if (items.Length == 0)
        {
            return TextBlock(StrOr(p.Node.Props, "emptyText", "None yet.")).Foreground(GenUITheme.MutedText);
        }

        Element[] chips = items
            .Select(it =>
            {
                string val = it.Value;
                return (Element)HStack(4,
                    TextBlock(it.Label).FontSize(12).Foreground(GenUITheme.PrimaryText),
                    Button("\u2715", () => p.Emit("remove", new JsonObject { ["value"] = val }))
                        .AutomationName($"remove {it.Label}"));
            })
            .ToArray();
        return HStack(6, chips);
    }

    // --- Shared floor: composition ----------------------------------------------------------

    // Hosts a whole bundle in a leaf. `props.bundle` is an inline JSON bundle (runtime-built, e.g. a
    // preview/playground); it is loaded and hosted in a server-free child session. The named-app path
    // (props.app) needs an app registry the binding-edge leaf does not carry, so only the inline
    // bundle is hosted here — an absent/invalid bundle shows `emptyText`.
    private static Element Embed(CapabilityViewProps<Element> p)
    {
        if (Obj(p.Node.Props, "bundle") is { } bundleJson)
        {
            try
            {
                Bundle bundle = BundleLoader.FromJson(bundleJson);
                return Component<EmbeddedBundleComponent, EmbeddedBundleProps>(new EmbeddedBundleProps(bundle));
            }
            catch (ArgumentException)
            {
                // Malformed inline bundle: fall through to the empty placeholder below.
            }
        }

        return TextBlock(StrOr(p.Node.Props, "emptyText", "Nothing to preview.")).Foreground(GenUITheme.MutedText);
    }

    // Both fallback paths (unknown capability / registered-but-unmapped) surface a subtle
    // marker, still carrying any children so a container-shaped fallback keeps its subtree.
    private static Element Fallback(CapabilityViewProps<Element> p)
    {
        Element marker = TextBlock($"[{p.Node.Capability}]").FontSize(12).Foreground(GenUITheme.MutedText);
        return p.Children.Count == 0
            ? marker
            : VStack(8, new[] { marker }.Concat(p.Children).ToArray());
    }

    // Reads a prop as a display string: strings pass through; numbers/bools stringify.
    private static string? Str(JsonObject? props, string key)
    {
        if (props is null || !props.TryGetPropertyValue(key, out var node) || node is null)
        {
            return null;
        }

        return node is JsonValue value && value.TryGetValue<string>(out var text)
            ? text
            : node.ToJsonString();
    }

    // Reads a prop as a display string with a fallback for missing/null values.
    private static string StrOr(JsonObject? props, string key, string fallback) => Str(props, key) ?? fallback;

    // Reads a single JSON node as a string: string values pass through; scalars stringify.
    private static string NodeStr(JsonNode? node) =>
        node is JsonValue v && v.TryGetValue<string>(out var s) ? s : node?.ToJsonString() ?? string.Empty;

    // Reads a prop as a bool: honours JSON booleans and the "true" string.
    private static bool Bool(JsonObject? props, string key)
    {
        if (props is null || !props.TryGetPropertyValue(key, out var node) || node is not JsonValue value)
        {
            return false;
        }

        if (value.TryGetValue<bool>(out var b))
        {
            return b;
        }

        return value.TryGetValue<string>(out var s) && s == "true";
    }

    // Reads a prop as an array (empty when missing or not an array).
    private static JsonArray ListArray(JsonObject? props, string key) =>
        props?[key] as JsonArray ?? new JsonArray();

    // Reads a prop as an object (null when missing or not an object).
    private static JsonObject? Obj(JsonObject? props, string key) => props?[key] as JsonObject;

    // Maps a spacing keyword (or numeric string) to a stack gap.
    private static double Spacing(JsonObject? props) => Str(props, "spacing") switch
    {
        "none" => 0,
        "tight" => 4,
        "loose" => 16,
        "wide" => 24,
        { } s when double.TryParse(s, out var d) => d,
        _ => 8,
    };

    // Maps a semantic tone keyword to a Fluent theme brush.
    private static ThemeRef ToneBrush(string tone) => tone switch
    {
        "good" or "success" or "ok" => GenUITheme.Success,
        "warn" or "caution" or "warning" => GenUITheme.Caution,
        "bad" or "error" or "danger" or "critical" => GenUITheme.Critical,
        "accent" or "info" => GenUITheme.Accent,
        "muted" => GenUITheme.MutedText,
        _ => GenUITheme.PrimaryText,
    };
}
