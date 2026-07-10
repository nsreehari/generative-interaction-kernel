using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using GenUI.Render;
using System.Globalization;
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
            ["ui:chart"] = ChartPrimitive,
            ["ui:markdown"] = MarkdownView,
            ["ui:markup"] = MarkdownView,
            ["ui:todo"] = Todo,
            ["ui:editableTable"] = EditableTable,
            ["ui:multiFileUpload"] = MultiFileUpload,
            // Data display
            ["ui:list"] = List,
            ["ui:table"] = Table,
            ["ui:selection"] = Selection,
            // Inputs
            ["ui:field"] = Field,
            ["ui:textarea"] = TextArea,
            ["ui:select"] = Select,
            ["ui:button"] = ButtonView,
            ["ui:tabBar"] = TabBar,
            ["ui:chips"] = Chips,
            ["ui:searchbox"] = Searchbox,
            ["ui:query"] = Searchbox,
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

    // A native chart leaf. Mirrors the demo-boards chart contract: config lives in props (`chartType`,
    // `columns`, `series`, `stacked`, `legend`, `height`, ...) and the dynamic payload rides on `data`.
    private static Element ChartPrimitive(CapabilityViewProps<Element> p) =>
        Component<ChartPrimitiveComponent, ChartPrimitiveProps>(new ChartPrimitiveProps(p.Node.Props));

    // A read-only markdown block. `markup` is an explicit alias of the same leaf.
    private static Element MarkdownView(CapabilityViewProps<Element> p)
    {
        string text = StrOr(p.Node.Props, "value", StrOr(p.Node.Props, "text", string.Empty));
        return string.IsNullOrWhiteSpace(text) ? Empty() : Markdown(text.Trim());
    }

    // A committed todo list. Bound items may arrive in `items` or `baseItems`; each mutation emits save {items}.
    private static Element Todo(CapabilityViewProps<Element> p) =>
        Component<TodoPrimitiveComponent, TodoPrimitiveProps>(new TodoPrimitiveProps(p.Node.Props, p.Emit));

    // A committed editable grid. Bound rows may arrive in `rows` or `baseRows`; save emits save {rows}.
    private static Element EditableTable(CapabilityViewProps<Element> p) =>
        Component<EditableTablePrimitiveComponent, EditableTablePrimitiveProps>(new EditableTablePrimitiveProps(p.Node.Props, p.Emit));

    // A grouped file viewer + upload composer. It emits JSON-safe file metadata on submit and,
    // when the host provides file services, also forwards the real staged files for upload.
    private static Element MultiFileUpload(CapabilityViewProps<Element> p) =>
        Component<MultiFileUploadPrimitiveComponent, MultiFileUploadPrimitiveProps>(new MultiFileUploadPrimitiveProps(p.Node.Props, p.Emit));

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

    // A committed single-select. It mirrors the demo-boards selection kind's contract:
    // `fields` declares one property, `options` supplies choices when the field has no enum,
    // and a change emits select {value}.
    private static Element Selection(CapabilityViewProps<Element> p) =>
        Component<SelectionPrimitiveComponent, SelectionPrimitiveProps>(new SelectionPrimitiveProps(p.Node.Props, p.Emit));

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

    // A committed single-field input. It mirrors the demo-boards searchbox kind's contract:
    // `fields` declares one property, `value` seeds the journal, and submit emits submit {value}.
    private static Element Searchbox(CapabilityViewProps<Element> p) =>
        Component<SearchboxPrimitiveComponent, SearchboxPrimitiveProps>(new SearchboxPrimitiveProps(p.Node.Props, p.Emit));

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
    internal static string? Str(JsonObject? props, string key)
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
    internal static string StrOr(JsonObject? props, string key, string fallback) => Str(props, key) ?? fallback;

    // Reads a single JSON node as a string: string values pass through; scalars stringify.
    internal static string NodeStr(JsonNode? node) =>
        node is JsonValue v && v.TryGetValue<string>(out var s) ? s : node?.ToJsonString() ?? string.Empty;

    // Reads a prop as a bool: honours JSON booleans and the "true" string.
    internal static bool Bool(JsonObject? props, string key)
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
    internal static JsonArray ListArray(JsonObject? props, string key) =>
        props?[key] as JsonArray ?? new JsonArray();

    // Reads a prop as an object (null when missing or not an object).
    internal static JsonObject? Obj(JsonObject? props, string key) => props?[key] as JsonObject;

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

    internal sealed record SingleFieldConfig(
        string FieldKey,
        JsonObject Prop,
        string CurrentValue,
        IReadOnlyList<JsonNode?> Options,
        bool IsRequired);

    internal static SingleFieldConfig? ReadSingleFieldConfig(JsonObject? props)
    {
        JsonObject? schema = Obj(props, "fields");
        JsonObject? properties = Obj(schema, "properties");
        if (properties is null || properties.Count != 1)
        {
            return null;
        }

        KeyValuePair<string, JsonNode?> entry = properties.First();
        JsonObject prop = entry.Value as JsonObject ?? new JsonObject();
        JsonArray enumOptions = prop["enum"] as JsonArray ?? new JsonArray();
        JsonArray options = enumOptions.Count > 0 ? enumOptions : ListArray(props, "options");
        JsonArray required = schema?["required"] as JsonArray ?? new JsonArray();

        return new SingleFieldConfig(
            entry.Key,
            prop,
            StrOr(props, "value", string.Empty),
            options.ToArray(),
            required.Any(r => NodeStr(r) == entry.Key));
    }

    internal static JsonNode CoerceFieldValue(string raw, JsonObject prop)
    {
        string type = StrOr(prop, "type", string.Empty);
        if (type is "number" or "integer")
        {
            if (raw.Length == 0)
            {
                return JsonValue.Create(string.Empty)!;
            }

            return double.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out double parsed)
                ? JsonValue.Create(parsed)!
                : JsonValue.Create(raw)!;
        }

        return JsonValue.Create(raw)!;
    }
}

public sealed record SelectionPrimitiveProps(JsonObject? Props, EmitBound Emit);

public sealed class SelectionPrimitiveComponent : Component<SelectionPrimitiveProps>
{
    public override Element Render()
    {
        GenUIReactorViews.SingleFieldConfig? field = GenUIReactorViews.ReadSingleFieldConfig(Props.Props);
        if (field is null)
        {
            return TextBlock("No selection configured").Foreground(GenUITheme.MutedText);
        }

        string[] labels = field.Options
            .Select(o => o is JsonObject oo
                ? GenUIReactorViews.Str(oo, "label") ?? GenUIReactorViews.Str(oo, "title") ?? GenUIReactorViews.Str(oo, "value") ?? GenUIReactorViews.Str(oo, "id") ?? string.Empty
                : GenUIReactorViews.NodeStr(o))
            .ToArray();
        string[] values = field.Options
            .Select(o => o is JsonObject oo
                ? GenUIReactorViews.Str(oo, "value") ?? GenUIReactorViews.Str(oo, "id") ?? GenUIReactorViews.Str(oo, "label") ?? string.Empty
                : GenUIReactorViews.NodeStr(o))
            .ToArray();

        bool allowEmpty = !field.IsRequired;
        var items = new List<string>();
        if (allowEmpty)
        {
            items.Add("All");
        }
        items.AddRange(labels);

        int index = Array.FindIndex(values, v => v == field.CurrentValue);
        int selectedIndex = allowEmpty ? (index < 0 ? 0 : index + 1) : Math.Max(index, 0);
        string title = GenUIReactorViews.Str(field.Prop, "title") ?? field.FieldKey;

        return ComboBox(items.ToArray(), selectedIndex, i =>
            {
                int pos = allowEmpty ? i - 1 : i;
                string next = pos < 0 ? string.Empty : pos < values.Length ? values[pos] : string.Empty;
                Props.Emit("select", new JsonObject { ["value"] = next });
            })
            .AutomationName(title);
    }
}

public sealed record SearchboxPrimitiveProps(JsonObject? Props, EmitBound Emit);

public sealed class SearchboxPrimitiveComponent : Component<SearchboxPrimitiveProps>
{
    public override Element Render()
    {
        GenUIReactorViews.SingleFieldConfig? field = GenUIReactorViews.ReadSingleFieldConfig(Props.Props);
        string buttonLabel = GenUIReactorViews.StrOr(Props.Props, "actionLabel", "Search");
        (string journal, Action<string> setJournal) = UseState(field?.CurrentValue ?? string.Empty);

        UseEffect(() =>
        {
            setJournal(field?.CurrentValue ?? string.Empty);
            return () => { };
        }, field?.CurrentValue ?? string.Empty);

        if (field is null)
        {
            return TextBlock("No search field configured").Foreground(GenUITheme.MutedText);
        }

        string placeholder = GenUIReactorViews.Str(field.Prop, "placeholder")
            ?? GenUIReactorViews.Str(field.Prop, "title")
            ?? field.FieldKey;
        string title = GenUIReactorViews.Str(field.Prop, "title") ?? field.FieldKey;

        return HStack(8,
            TextBox(journal, setJournal, placeholder, string.Empty)
                .AutomationName(title)
                .Flex(grow: 1),
            Button(buttonLabel, () => Props.Emit("submit", new JsonObject { ["value"] = GenUIReactorViews.CoerceFieldValue(journal, field.Prop) }))
                .AutomationName(buttonLabel));
    }
}

public sealed record TodoPrimitiveProps(JsonObject? Props, EmitBound Emit);

public sealed class TodoPrimitiveComponent : Component<TodoPrimitiveProps>
{
    private sealed record TodoItem(string Text, bool Done)
    {
        public JsonObject ToJson() => new()
        {
            ["text"] = Text,
            ["done"] = Done,
        };
    }

    public override Element Render()
    {
        IReadOnlyList<TodoItem> incoming = ReadItems(Props.Props);
        (IReadOnlyList<TodoItem> items, Action<IReadOnlyList<TodoItem>> setItems) = UseState(incoming);
        (string draft, Action<string> setDraft) = UseState(string.Empty);

        UseEffect(() =>
        {
            setItems(incoming);
            return () => { };
        }, Signature(incoming));

        void Save(IReadOnlyList<TodoItem> next)
        {
            setItems(next);
            Props.Emit("save", new JsonObject
            {
                ["items"] = new JsonArray(next.Select(item => (JsonNode)item.ToJson()).ToArray()),
            });
        }

        var rows = new List<Element>();
        if (items.Count == 0)
        {
            rows.Add(TextBlock("Nothing here yet.").Foreground(GenUITheme.MutedText));
        }
        else
        {
            for (int index = 0; index < items.Count; index++)
            {
                int rowIndex = index;
                TodoItem item = items[rowIndex];
                rows.Add(HStack(8,
                        CheckBox(item.Done, value =>
                        {
                            var next = items.ToList();
                            next[rowIndex] = next[rowIndex] with { Done = value };
                            Save(next);
                        }, string.Empty).AutomationName(item.Text.Length > 0 ? item.Text : $"Todo {rowIndex + 1}"),
                        TextBlock(item.Text)
                            .Foreground(GenUITheme.PrimaryText)
                            .Opacity(item.Done ? 0.65 : 1.0)
                            .Flex(grow: 1),
                        Button("×", () => Save(items.Where((_, itemIndex) => itemIndex != rowIndex).ToList()))
                            .AutomationName($"Remove {item.Text}"))
                    .WithKey($"todo-{rowIndex}"));
            }
        }

        string placeholder = GenUIReactorViews.StrOr(Props.Props, "placeholder", "Add item...");
        string actionLabel = GenUIReactorViews.StrOr(Props.Props, "actionLabel", "+");
        string composerLabel = GenUIReactorViews.StrOr(Props.Props, "composerLabel", "Add todo item");

        rows.Add(HStack(8,
            TextBox(draft, setDraft, placeholder, string.Empty)
                .AutomationName(composerLabel)
                .Flex(grow: 1),
            Button(actionLabel, () =>
            {
                string text = draft.Trim();
                if (text.Length == 0)
                {
                    return;
                }

                Save(items.Append(new TodoItem(text, false)).ToList());
                setDraft(string.Empty);
            }).AutomationName(actionLabel)));

        return VStack(8, rows.ToArray())
            .Padding(8)
            .Background(GenUITheme.Surface)
            .WithBorder(GenUITheme.Stroke)
            .CornerRadius(6);
    }

    private static IReadOnlyList<TodoItem> ReadItems(JsonObject? props)
    {
        JsonArray items = GenUIReactorViews.ListArray(props, "items");
        if (items.Count == 0)
        {
            items = GenUIReactorViews.ListArray(props, "baseItems");
        }

        return items.Select(item => item as JsonObject)
            .Where(item => item is not null)
            .Select(item => new TodoItem(
                GenUIReactorViews.Str(item, "text") ?? string.Empty,
                GenUIReactorViews.Bool(item, "done")))
            .ToList();
    }

    private static string Signature(IReadOnlyList<TodoItem> items) =>
        string.Join("|", items.Select(item => $"{item.Text}:{item.Done}"));
}

public sealed record EditableTablePrimitiveProps(JsonObject? Props, EmitBound Emit);

public sealed class EditableTablePrimitiveComponent : Component<EditableTablePrimitiveProps>
{
    public override Element Render()
    {
        JsonObject spec = GenUIReactorViews.Obj(Props.Props, "spec") ?? new JsonObject();
        IReadOnlyList<Dictionary<string, JsonNode?>> incomingRows = ReadRows(Props.Props);
        (IReadOnlyList<Dictionary<string, JsonNode?>> rows, Action<IReadOnlyList<Dictionary<string, JsonNode?>>> setRows) = UseState(incomingRows);
        (bool dirty, Action<bool> setDirty) = UseState(false);

        UseEffect(() =>
        {
            setRows(incomingRows);
            setDirty(false);
            return () => { };
        }, Signature(incomingRows));

        string[] columns = ReadColumns(spec, rows).ToArray();
        bool canAdd = !spec.TryGetPropertyValue("addRow", out JsonNode? addNode) || addNode is not JsonValue addValue || !addValue.TryGetValue<bool>(out bool addBool) || addBool;
        bool canDelete = !spec.TryGetPropertyValue("deleteRow", out JsonNode? deleteNode) || deleteNode is not JsonValue deleteValue || !deleteValue.TryGetValue<bool>(out bool deleteBool) || deleteBool;
        string placeholder = GenUIReactorViews.Str(spec, "placeholder") ?? "No data";

        void UpdateRows(IReadOnlyList<Dictionary<string, JsonNode?>> next)
        {
            setRows(next);
            setDirty(true);
        }

        if (columns.Length == 0 && !canAdd)
        {
            return TextBlock(placeholder).Foreground(GenUITheme.MutedText);
        }

        var tableRows = new List<Element>();
        tableRows.Add(HStack(8, columns.Select(column => (Element)TextBlock(column).Bold().FontSize(11).Foreground(GenUITheme.MutedText)).ToArray()));

        if (rows.Count == 0)
        {
            tableRows.Add(TextBlock(placeholder).Foreground(GenUITheme.MutedText));
        }
        else
        {
            for (int rowIndex = 0; rowIndex < rows.Count; rowIndex++)
            {
                int capturedRow = rowIndex;
                Dictionary<string, JsonNode?> row = rows[capturedRow];
                var cells = new List<Element>();
                foreach (string column in columns)
                {
                    bool isNumber = IsNumericColumn(spec, row, column);
                    string current = GenUIReactorViews.NodeStr(row.TryGetValue(column, out JsonNode? value) ? value : null);
                    string capturedColumn = column;
                    cells.Add(TextBox(current, text =>
                        {
                            var next = CloneRows(rows);
                            next[capturedRow][capturedColumn] = isNumber
                                ? (text.Length == 0 ? JsonValue.Create(0d) : GenUIReactorViews.CoerceFieldValue(text, new JsonObject { ["type"] = isNumber ? "number" : "string" }))
                                : JsonValue.Create(text);
                            UpdateRows(next);
                        })
                        .AutomationName($"{capturedColumn} {capturedRow + 1}")
                        .Flex(grow: 1));
                }

                if (canDelete)
                {
                    cells.Add(Button("×", () => UpdateRows(rows.Where((_, index) => index != capturedRow).Select(CloneRow).ToList()))
                        .AutomationName($"Remove row {capturedRow + 1}"));
                }

                tableRows.Add(HStack(8, cells.ToArray()).WithKey($"editable-row-{capturedRow}"));
            }
        }

        var actions = new List<Element>();
        if (canAdd)
        {
            actions.Add(Button("+ Add row", () =>
                {
                    var next = CloneRows(rows);
                    var blank = new Dictionary<string, JsonNode?>(StringComparer.Ordinal);
                    foreach (string column in columns)
                    {
                        blank[column] = JsonValue.Create(string.Empty);
                    }

                    next.Add(blank);
                    UpdateRows(next);
                }).AutomationName("Add row"));
        }

        if (dirty)
        {
            actions.Add(Button("Discard", () =>
                {
                    setRows(ReadRows(Props.Props));
                    setDirty(false);
                }).AutomationName("Discard changes"));
            actions.Add(Button("Save", () =>
                {
                    Props.Emit("save", new JsonObject { ["rows"] = new JsonArray(rows.Select(r => (JsonNode)ToJson(r)).ToArray()) });
                    setDirty(false);
                }).AutomationName("Save changes"));
        }

        return VStack(8,
                VStack(6, tableRows.ToArray())
                    .Padding(8)
                    .Background(GenUITheme.Surface)
                    .WithBorder(GenUITheme.Stroke)
                    .CornerRadius(6),
                actions.Count > 0 ? HStack(6, actions.ToArray()) : Empty())
            .WithKey("editable-table-root");
    }

    private static IReadOnlyList<Dictionary<string, JsonNode?>> ReadRows(JsonObject? props)
    {
        JsonArray rows = GenUIReactorViews.ListArray(props, "rows");
        if (rows.Count == 0)
        {
            rows = GenUIReactorViews.ListArray(props, "baseRows");
        }

        return rows.Select(row => row as JsonObject)
            .Where(row => row is not null)
            .Select(row => row!.ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal))
            .ToList();
    }

    private static IReadOnlyList<string> ReadColumns(JsonObject spec, IReadOnlyList<Dictionary<string, JsonNode?>> rows)
    {
        JsonArray explicitColumns = GenUIReactorViews.ListArray(spec, "columns");
        if (explicitColumns.Count > 0)
        {
            return explicitColumns.Select(GenUIReactorViews.NodeStr).ToList();
        }

        JsonObject? schema = spec["schema"] as JsonObject;
        JsonObject? properties = schema? ["properties"] as JsonObject;
        if (properties is not null && properties.Count > 0)
        {
            return properties.Select(kv => kv.Key).ToList();
        }

        return rows.Count > 0 ? rows[0].Keys.ToList() : Array.Empty<string>();
    }

    private static bool IsNumericColumn(JsonObject spec, Dictionary<string, JsonNode?> row, string column)
    {
        JsonObject? schema = spec["schema"] as JsonObject;
        JsonObject? properties = schema?["properties"] as JsonObject;
        JsonObject? prop = properties?[column] as JsonObject;
        string type = GenUIReactorViews.Str(prop, "type") ?? string.Empty;
        if (type is "number" or "integer")
        {
            return true;
        }

        return row.TryGetValue(column, out JsonNode? value) && value is JsonValue json && (json.TryGetValue<double>(out _) || json.TryGetValue<int>(out _) || json.TryGetValue<long>(out _));
    }

    private static List<Dictionary<string, JsonNode?>> CloneRows(IReadOnlyList<Dictionary<string, JsonNode?>> rows) =>
        rows.Select(CloneRow).ToList();

    private static Dictionary<string, JsonNode?> CloneRow(Dictionary<string, JsonNode?> row) =>
        row.ToDictionary(kv => kv.Key, kv => kv.Value?.DeepClone(), StringComparer.Ordinal);

    private static JsonObject ToJson(Dictionary<string, JsonNode?> row)
    {
        var result = new JsonObject();
        foreach (KeyValuePair<string, JsonNode?> entry in row)
        {
            result[entry.Key] = entry.Value?.DeepClone();
        }

        return result;
    }

    private static string Signature(IReadOnlyList<Dictionary<string, JsonNode?>> rows) =>
        string.Join("|", rows.Select(row => string.Join(",", row.Select(entry => $"{entry.Key}:{GenUIReactorViews.NodeStr(entry.Value)}"))));
}

public sealed record MultiFileUploadPrimitiveProps(JsonObject? Props, EmitBound Emit);

public sealed class MultiFileUploadPrimitiveComponent : Component<MultiFileUploadPrimitiveProps>
{
    public override Element Render()
    {
        JsonNode? rawData = Props.Props? ["data"];
        JsonArray files = ResolveFiles(rawData, Props.Props);
        JsonArray groups = ResolveGroups(rawData, Props.Props);
        GenUIFileServices? fileServices = ReactorHost.CurrentFileServices;
        (string text, Action<string> setText) = UseState(string.Empty);
        (IReadOnlyList<GenUIStagedFile> staged, Action<IReadOnlyList<GenUIStagedFile>> setStaged) = UseState<IReadOnlyList<GenUIStagedFile>>(Array.Empty<GenUIStagedFile>());

        async void Attach()
        {
            if (fileServices?.PickAttachmentsAsync is null)
            {
                return;
            }

            IReadOnlyList<string> accept = GenUIReactorViews.ListArray(Props.Props, "accept").Select(GenUIReactorViews.NodeStr).ToList();
            IReadOnlyList<GenUIStagedFile> picked = await fileServices.PickAttachmentsAsync(true, accept);
            if (picked.Count == 0)
            {
                return;
            }

            var merged = staged.ToList();
            foreach (GenUIStagedFile file in picked)
            {
                if (!merged.Any(existing => existing.Name == file.Name && existing.Size == file.Size))
                {
                    merged.Add(file);
                }
            }

            setStaged(merged);
        }

        void Submit()
        {
            if (staged.Count == 0)
            {
                return;
            }

            string trimmed = text.Trim();
            Props.Emit("submit", new JsonObject
            {
                ["text"] = trimmed,
                ["files"] = new JsonArray(staged.Select(file => (JsonNode)file.ToMetadataJson()).ToArray()),
            });

            if (fileServices?.UploadFilesMultiple is not null)
            {
                _ = fileServices.UploadFilesMultiple(staged.Select(file => file.ToData()).ToList(), trimmed);
            }

            setText(string.Empty);
            setStaged(Array.Empty<GenUIStagedFile>());
        }

        var children = new List<Element>();
        if (groups.Count > 0)
        {
            children.Add(VStack(8, groups
                .Select((groupNode, index) => (Element)RenderGroup(groupNode as JsonObject, index, files))
                .ToArray()));
        }

        if (staged.Count > 0)
        {
            children.Add(HStack(6, staged.Select((file, index) => (Element)HStack(4,
                    TextBlock($"{file.Name} ({FormatSize(file.Size)})").Foreground(GenUITheme.PrimaryText),
                    Button("×", () => setStaged(staged.Where((_, itemIndex) => itemIndex != index).ToList()))
                        .AutomationName($"Remove {file.Name}"))
                .WithKey($"staged-{index}")).ToArray()));
        }

        string placeholder = GenUIReactorViews.StrOr(Props.Props, "placeholder", "Add a message…");
        string submitLabel = GenUIReactorViews.StrOr(Props.Props, "submitLabel", "Upload");
        children.Add(HStack(8,
            Button("Attach files", Attach).AutomationName("Attach files").Set(button => button.IsEnabled = fileServices?.PickAttachmentsAsync is not null),
            TextBox(text, setText, placeholder, string.Empty).AutomationName(placeholder).Flex(grow: 1),
            Button(submitLabel, Submit).AutomationName(submitLabel).Set(button => button.IsEnabled = staged.Count > 0)));

        return VStack(12, children.ToArray())
            .Padding(8)
            .Background(GenUITheme.Surface)
            .WithBorder(GenUITheme.Stroke)
            .CornerRadius(6);
    }

    private static Element RenderGroup(JsonObject? group, int groupIndex, JsonArray files)
    {
        string? message = GenUIReactorViews.Str(group, "message");
        JsonArray indexes = group?["file_idxs"] as JsonArray ?? new JsonArray();
        var rows = new List<Element>();
        if (!string.IsNullOrWhiteSpace(message))
        {
            rows.Add(TextBlock(message.Trim()).Foreground(GenUITheme.PrimaryText));
        }

        rows.Add(HStack(6, indexes
            .Select(indexNode => indexNode is JsonValue value && value.TryGetValue<int>(out int fileIndex) && fileIndex >= 0 && fileIndex < files.Count
                ? (Element)TextBlock(FileLabel(files[fileIndex], fileIndex)).Foreground(GenUITheme.MutedText)
                : Empty())
            .ToArray()));

        return VStack(6, rows.ToArray()).WithKey($"group-{groupIndex}");
    }

    private static JsonArray ResolveFiles(JsonNode? rawData, JsonObject? props)
    {
        if (rawData is JsonArray bareFiles)
        {
            return bareFiles;
        }

        if (rawData is JsonObject map && map["files"] is JsonArray files)
        {
            return files;
        }

        return GenUIReactorViews.ListArray(props, "files");
    }

    private static JsonArray ResolveGroups(JsonNode? rawData, JsonObject? props)
    {
        if (rawData is JsonObject map && map["filegroups"] is JsonArray groups)
        {
            return groups;
        }

        return GenUIReactorViews.ListArray(props, "filegroups");
    }

    private static string FileLabel(JsonNode? fileNode, int fallbackIndex)
    {
        JsonObject? file = fileNode as JsonObject;
        string name = GenUIReactorViews.Str(file, "name")
            ?? GenUIReactorViews.Str(file, "stored_name")
            ?? $"file {fallbackIndex}";
        double? size = file?["size"] is JsonValue sizeValue && sizeValue.TryGetValue<double>(out double fileSize) ? fileSize : null;
        return size is > 0 ? $"{name} ({FormatSize((long)size.Value)})" : name;
    }

    private static string FormatSize(long size)
    {
        if (size <= 0)
        {
            return "Unknown size";
        }

        if (size < 1024)
        {
            return $"{size} B";
        }

        double kb = size / 1024.0;
        if (kb < 1024)
        {
            return $"{Math.Max(1, Math.Round(kb)):0} KB";
        }

        double mb = kb / 1024.0;
        if (mb < 1024)
        {
            return mb >= 100 ? $"{mb:0} MB" : $"{mb:0.0} MB";
        }

        double gb = mb / 1024.0;
        return gb >= 100 ? $"{gb:0} GB" : $"{gb:0.0} GB";
    }
}
