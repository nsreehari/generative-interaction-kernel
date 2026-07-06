// Headless STRUCTURAL check for the Reactor/WinUI binding. Drives the real kernel through
// GenUIController and renders every resolved tree through GenUIReactorViews.Registry
// (TView = Element), then walks the resulting Reactor Element records into a serializable
// Shape and asserts the structure. Reactor Elements are pure declarative records, so this
// runs with no UI thread, no window, and no control materialization — the same offline
// discipline as GenUI.Render.Check, but over the actual WinUI/Reactor element tree.
//
// What this proves beyond compile-verified equivalence:
//   * the container view (board) composes a titled VStack over already-rendered children;
//   * leaf views (metric/table/actions) produce the expected element shapes;
//   * the renderer's visibility drop and BOTH fallback paths reach the Reactor Fallback view;
//   * the node-bound emit is a real closure: firing a ButtonElement.OnClick round-trips through
//     the kernel (dispatch -> re-resolve -> re-render) and the metric reflects the new state.//   * Reactor's OWN AccessibilityScanner walks the exact element tree that materializes to WinUI
//     controls and reports it clean. Per the framework's testing guidance, the render tree — not a
//     font/DPI/Composition-dependent bitmap — is the right paint-fidelity surface to assert.
using System.Text.Json.Nodes;
using GenUI.Kernel;
using GenUI.Render;
using GenUI.Render.Reactor;
using Microsoft.UI.Reactor.Core;
using GenKernel = GenUI.Kernel.Kernel;

const string ManifestJson = """
{
  "namespaces": ["ui"],
  "capabilities": { "board": {}, "metric": {}, "table": {}, "actions": {}, "chart": {} }
}
""";

// board root with: a metric that reads ui.clicked, a static table, an actions button that
// assigns ui.clicked on tap, a chart (in the manifest but with NO registered Reactor view),
// an unknown capability (not in the manifest), and a gated-off metric. Exercises both
// fallback paths and the visibility drop, and gives the emit round-trip something to change.
const string DocumentJson = """
{
  "root": {
    "capability": "board",
    "id": "root",
    "props": { "title": "Board" },
    "edges": {
      "children": [
        { "capability": "metric",  "id": "echo", "props": { "label": "Clicked" },
          "edges": { "read": { "value": "ui.clicked" } } },
        { "capability": "table",   "id": "t1",
          "props": { "columns": ["a", "b"], "rows": [ { "a": "1", "b": "2" } ] } },
        { "capability": "actions", "id": "go", "props": { "label": "Go" },
          "edges": { "on": { "tap": [ { "do": "assign", "target": "ui.clicked", "args": { "value": true } } ] } } },
        { "capability": "chart",   "id": "c1" },
        { "capability": "mystery", "id": "u1" },
        { "capability": "metric",  "id": "hidden", "props": { "label": "H" }, "edges": { "gate": "false" } }
      ]
    }
  }
}
""";

var manifest = JsonNode.Parse(ManifestJson)!.AsObject();
var document = JsonNode.Parse(DocumentJson)!.AsObject();

var store = new InMemoryStateModel(new[] { "ui" });
var kernel = new GenKernel(manifest, document, store);
var controller = new GenUIController(kernel);

var emitted = new List<(string Node, string Name)>();
Element? root = null;
var refreshCount = 0;

EmitFn emit = (id, name, payload) =>
{
    emitted.Add((id, name));
    controller.Emit(id, name, payload);
};

controller.Subscribe(tree =>
{
    refreshCount++;
    root = Renderer.Render(tree, GenUIReactorViews.Registry, emit);
});

controller.Start();

var checker = new Checker();

checker.Assert(root is not null, "root renders to a Reactor Element");

var shape = Shape.Of(root!);
checker.Assert(shape.Type == "VStack", $"board renders a VStack container (got {shape.Type})");

// title + 5 visible children (the gated metric is dropped by the renderer).
checker.Assert(shape.Children.Count == 6, $"title + 5 visible children (got {shape.Children.Count})");
checker.Assert(shape.Children[0] is { Type: "Text", Text: "Board" }, "board composes its title first");

// the metric leaf: a VStack of [label, value]; value is em-dash before the click.
var echo = FindMetric(shape, "Clicked");
checker.Assert(echo is not null, "metric leaf renders a labelled VStack");
checker.Assert(echo!.Children.Count == 2 && echo.Children[1].Text == "\u2014", "metric shows em-dash before the click");

// the table leaf: a header row + a data row, carrying the column headers and cell values.
var texts = Shape.Flatten(shape).Where(s => s.Type == "Text").Select(s => s.Text).ToList();
checker.Assert(texts.Contains("a") && texts.Contains("b"), "table renders its column headers");
checker.Assert(texts.Contains("1") && texts.Contains("2"), "table renders its cell values");

// both fallback paths reach the Reactor Fallback view (a subtle [capability] marker).
checker.Assert(texts.Contains("[chart]"), "known-but-unregistered capability falls back");
checker.Assert(texts.Contains("[mystery]"), "unknown capability falls back");

// the gated metric is absent from the element tree entirely.
checker.Assert(!texts.Contains("H"), "gated node produces no element");

// fire the actions button's node-bound emit — the real closure the renderer built.
var button = FindActionButton(root!);
checker.Assert(button is not null, "actions renders a Button with a bound handler");
button!.OnClick!();

checker.Assert(emitted.Contains(("go", "tap")), "the bound emit carries the node id");
checker.Assert(controller.LastPatch?.Rev == 1, $"one dispatch advanced to rev 1 (got {controller.LastPatch?.Rev})");
checker.Assert(refreshCount >= 2, "the subscriber re-rendered after the dispatch");

// after the round-trip, the metric reflects the new state (bool stringifies to "true").
var echoAfter = FindMetric(Shape.Of(root!), "Clicked");
checker.Assert(echoAfter!.Children[1].Text == "true", "metric reflects ui.clicked after the click");

// Reactor's own accessibility oracle walks the exact element tree that materializes to controls.
// Running it headless proves the render tree is semantically sound (accessible names, roles,
// landmarks) — the strongest paint-fidelity evidence available without opening a window, and the
// surface the framework itself prescribes over a bitmap diff. We enforce a WARNING-clean bar (the
// actionable severity); remaining info-level advisories are surfaced, not suppressed. The metric's
// bold 20px value trips the heading-style heuristic (A11Y_004), but it is numeric data, not a
// heading — annotating it as one would be semantically wrong, so that advisory is left as-is.
var a11y = AccessibilityScanner.Scan(root!);
var warnings = a11y.Where(d => d.Severity == "warning").ToList();
checker.Assert(
    warnings.Count == 0,
    warnings.Count == 0
        ? "Reactor's accessibility scanner reports no warnings on the render tree"
        : $"Reactor's accessibility scanner reports no warnings on the render tree (got {string.Join(", ", warnings.Select(d => $"{d.Id} {d.ElementType}"))})");
foreach (var info in a11y.Where(d => d.Severity != "warning"))
    Console.WriteLine($"  info  a11y advisory {info.Id} on {info.ElementType}: {info.Message}");

return checker.Report();

// Locate the metric VStack whose first Text child is the given label.
static Shape? FindMetric(Shape s, string label) => Shape.Flatten(s)
    .FirstOrDefault(n => n.Type == "VStack" && n.Children.Count == 2 && n.Children[0].Text == label);

// The actions button is the one with a string Label and no content element (table row buttons
// wrap an HStack in ContentElement instead), carrying a bound OnClick.
static ButtonElement? FindActionButton(Element e)
{
    if (e is ButtonElement { ContentElement: null, OnClick: not null } b) return b;
    foreach (var child in Children(e))
        if (FindActionButton(child) is { } hit) return hit;
    return null;
}

static IEnumerable<Element> Children(Element e) => e switch
{
    StackElement s => s.Children,
    ButtonElement { ContentElement: { } c } => new[] { c },
    _ => Array.Empty<Element>(),
};

// A serializable structural view of a Reactor Element subtree: the salient element type, its
// text content (for text/button leaves), and rendered children. Purely reads the declarative
// record fields — no control is ever created.
sealed record Shape(string Type, string? Text, IReadOnlyList<Shape> Children)
{
    public static Shape Of(Element e) => e switch
    {
        StackElement s => new Shape(
            s.Orientation.ToString() == "Vertical" ? "VStack" : "HStack",
            null,
            s.Children.Select(Of).ToArray()),
        TextBlockElement t => new Shape("Text", t.Content, Array.Empty<Shape>()),
        ButtonElement b => new Shape(
            "Button",
            b.Label.Length > 0 ? b.Label : null,
            b.ContentElement is null ? Array.Empty<Shape>() : new[] { Of(b.ContentElement) }),
        _ => new Shape(e.GetType().Name, null, Array.Empty<Shape>()),
    };

    public static IEnumerable<Shape> Flatten(Shape s)
    {
        yield return s;
        foreach (var c in s.Children)
            foreach (var d in Flatten(c))
                yield return d;
    }
}

sealed class Checker
{
    private int _failures;

    public void Assert(bool ok, string label)
    {
        Console.WriteLine(ok ? $"  PASS  {label}" : $"  FAIL  {label}");
        if (!ok) _failures++;
    }

    public int Report()
    {
        Console.WriteLine();
        Console.WriteLine(_failures == 0
            ? "OK: all Reactor structural checks passed (headless Element walk)."
            : $"FAILED: {_failures} Reactor structural check(s).");
        return _failures == 0 ? 0 : 1;
    }
}
