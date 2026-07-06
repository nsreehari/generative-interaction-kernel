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
/// The concrete toolkit binding: maps live-cards capabilities to Reactor <see cref="Element"/>s
/// (TView = Element). Each view honours the resolved node's props and its node-bound
/// <see cref="EmitBound"/> emit; the container view composes children that the shared
/// <see cref="Renderer"/> walk has already rendered. Nothing here re-implements visibility,
/// fallback, or emit-id capture — those live in the renderer-agnostic core, so every C#
/// binding renders the same <see cref="ResolvedNode"/> tree identically above the leaves.
/// </summary>
public static class GenUIReactorViews
{
    /// <summary>Shared registry mapping capability ids to Reactor element factories.</summary>
    public static ComponentRegistry<Element> Registry { get; } = Build();

    private static ComponentRegistry<Element> Build() => new(
        new Dictionary<string, CapabilityView<Element>>
        {
            ["board"] = Board,
            ["metric"] = Metric,
            ["narrative"] = Narrative,
            ["badge"] = Badge,
            ["table"] = Table,
            ["form"] = Form,
            ["actions"] = Actions,
        },
        fallback: Fallback);

    // Container: an optional title over the already-rendered children.
    private static Element Board(CapabilityViewProps<Element> p)
    {
        var children = new List<Element>();
        if (Str(p.Node.Props, "title") is { } title)
        {
            children.Add(TextBlock(title).Bold().FontSize(18));
        }

        children.AddRange(p.Children);
        // The board is the app's main content region: mark it so screen readers can jump to it.
        return VStack(12, children.ToArray()).Margin(16).Landmark(AutomationLandmarkType.Main);
    }

    // Leaf: a labelled value read from the node's props (label required, value optional).
    private static Element Metric(CapabilityViewProps<Element> p) =>
        VStack(2,
            TextBlock(Str(p.Node.Props, "label") ?? string.Empty).FontSize(12).Opacity(0.7),
            TextBlock(Str(p.Node.Props, "value") ?? "\u2014").Bold().FontSize(20));

    // Leaf: a card's prose narrative/summary/recommendation, bound onto the `text` prop.
    private static Element Narrative(CapabilityViewProps<Element> p)
    {
        string text = Str(p.Node.Props, "text") ?? string.Empty;
        return TextBlock(text.Length > 0 ? text : "No narrative yet.").FontSize(13);
    }

    // Leaf: a short status token bound onto `value` (the tone rides through for styling).
    private static Element Badge(CapabilityViewProps<Element> p) =>
        TextBlock(Str(p.Node.Props, "value") ?? string.Empty).Bold().FontSize(12);

    // Leaf: a labelled data-entry surface whose save round-trips through the node-bound emit.
    private static Element Form(CapabilityViewProps<Element> p)
    {
        string? label = Str(p.Node.Props, "label");
        var children = new List<Element>();
        if (label is { Length: > 0 })
        {
            children.Add(TextBlock(label).FontSize(12).Opacity(0.7));
        }

        children.Add(Button("Save", () => p.Emit("submit"))
            .AutomationName(label is { Length: > 0 } ? $"{label} save" : "Save"));
        return VStack(6, children.ToArray());
    }

    // Leaf: a button whose tap round-trips through the node-bound emit.
    private static Element Actions(CapabilityViewProps<Element> p)
    {
        string label = Str(p.Node.Props, "label") ?? "Action";
        return Button(label, () => p.Emit("tap")).AutomationName(label);
    }

    // Leaf: a header row plus one tappable row per data item; a tap emits rowSelect with the row index.
    private static Element Table(CapabilityViewProps<Element> p)
    {
        string[] columns = (p.Node.Props["columns"] as JsonArray)?
            .Select(c => c?.GetValue<string>() ?? string.Empty)
            .ToArray() ?? Array.Empty<string>();
        JsonArray rows = p.Node.Props["rows"] as JsonArray ?? new JsonArray();

        var rowElements = new List<Element>();
        if (columns.Length > 0)
        {
            rowElements.Add(HStack(12, columns
                .Select(c => (Element)TextBlock(c).Bold().FontSize(12).Opacity(0.7))
                .ToArray()));
        }

        for (var i = 0; i < rows.Count; i++)
        {
            var row = rows[i] as JsonObject;
            var index = i;
            Element[] cells = columns.Length > 0
                ? columns.Select(col => (Element)TextBlock(Str(row, col) ?? string.Empty).FontSize(13)).ToArray()
                : new[] { (Element)TextBlock(row?.ToJsonString() ?? string.Empty).FontSize(13) };

            rowElements.Add(Button(
                HStack(12, cells),
                () => p.Emit("rowSelect", new JsonObject { ["index"] = index }))
                .AutomationName($"Row {index + 1}"));
        }

        return VStack(4, rowElements.ToArray());
    }

    // Both fallback paths (unknown capability / registered-but-unmapped) surface a subtle
    // marker, still carrying any children so a container-shaped fallback keeps its subtree.
    private static Element Fallback(CapabilityViewProps<Element> p)
    {
        Element marker = TextBlock($"[{p.Node.Capability}]").FontSize(12).Opacity(0.5);
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
}
