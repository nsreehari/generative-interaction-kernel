using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json.Nodes;
using Microsoft.UI.Reactor;
using Microsoft.UI.Reactor.Core;
using static Microsoft.UI.Reactor.Factories;

namespace GenUI.Render.Reactor;

public sealed record ChartPrimitiveProps(JsonObject? Props);

public sealed class ChartPrimitiveComponent : Component<ChartPrimitiveProps>
{
    private sealed record ChartModel(List<Dictionary<string, JsonNode?>> Rows, string LabelKey, List<string> SeriesKeys);

    public override Element Render()
    {
        JsonObject spec = Props.Props ?? new JsonObject();
        ChartModel? model = Normalize(spec["data"], spec);
        if (model is null || model.Rows.Count == 0 || model.SeriesKeys.Count == 0)
        {
            return TextBlock("No chart data").FontSize(12).Opacity(0.7).Foreground(GenUITheme.MutedText);
        }

        string variant = GenUIReactorViews.Str(spec, "chartType") ?? DetectChartType(model.Rows);
        bool stacked = spec["stacked"] is JsonValue sv && sv.TryGetValue<bool>(out bool stackedValue) && stackedValue;
        bool showLegend = spec["legend"] is not JsonValue { } lv || !lv.TryGetValue<bool>(out bool legendFalse) || legendFalse;
        showLegend = showLegend && (model.SeriesKeys.Count > 1 || variant is "pie" or "doughnut");

        double max = MaxValue(model, stacked);
        var barRows = new List<Element>();
        for (int rowIndex = 0; rowIndex < model.Rows.Count; rowIndex++)
        {
            Dictionary<string, JsonNode?> row = model.Rows[rowIndex];
            var seriesBars = new List<Element>();
            foreach (var (seriesKey, seriesIndex) in model.SeriesKeys.Select((key, index) => (key, index)))
            {
                double value = Math.Max(0, AsNumber(row.TryGetValue(seriesKey, out JsonNode? v) ? v : null) ?? 0);
                int glyphCount = max > 0 ? Math.Max(1, (int)Math.Round(24 * (value / max))) : 1;
                seriesBars.Add(HStack(6,
                    TextBlock(new string('\u25A0', glyphCount)).Foreground(Palette(seriesIndex)),
                        TextBlock(Stringify(row.TryGetValue(seriesKey, out JsonNode? raw) ? raw : null))
                            .FontSize(11)
                            .Foreground(GenUITheme.PrimaryText))
                    .WithKey($"series-{rowIndex}-{seriesIndex}"));
            }

            barRows.Add(VStack(4,
                    TextBlock(Stringify(row.TryGetValue(model.LabelKey, out JsonNode? label) ? label : null))
                        .FontSize(11)
                        .Foreground(GenUITheme.MutedText),
                    stacked && seriesBars.Count > 1
                        ? VStack(2, seriesBars.ToArray())
                        : HStack(8, seriesBars.ToArray()))
                .WithKey($"row-{rowIndex}"));
        }

        var children = new List<Element>
        {
            TextBlock($"{variant} chart").Bold().FontSize(12).Foreground(GenUITheme.PrimaryText),
            VStack(8, barRows.ToArray()),
        };

        if (showLegend)
        {
            children.Add(HStack(10, model.SeriesKeys
                .Select((seriesKey, index) => (Element)HStack(4,
                    TextBlock("■").Foreground(Palette(index)),
                    TextBlock(seriesKey).FontSize(11).Foreground(GenUITheme.PrimaryText)))
                .ToArray()));
        }

        return VStack(8, children.ToArray())
            .Padding(8)
            .Background(GenUITheme.Surface)
            .WithBorder(GenUITheme.Stroke)
            .CornerRadius(6);
    }

    private static ThemeRef Palette(int index) => (index % 6) switch
    {
        0 => GenUITheme.Accent,
        1 => GenUITheme.Caution,
        2 => GenUITheme.Critical,
        3 => GenUITheme.Success,
        4 => GenUITheme.PrimaryText,
        _ => GenUITheme.MutedText,
    };

    private static string DetectChartType(List<Dictionary<string, JsonNode?>> rows)
    {
        if (rows.Count == 0)
        {
            return "bar";
        }

        Dictionary<string, JsonNode?> sample = rows[0];
        bool hasLabel = sample.ContainsKey("label");
        bool hasValue = sample.ContainsKey("value");
        bool hasX = sample.ContainsKey("x");
        bool hasDate = sample.ContainsKey("date");
        if (hasLabel && hasValue && !hasX && !hasDate)
        {
            return "pie";
        }

        return hasX || hasDate ? "line" : "bar";
    }

    private static double MaxValue(ChartModel model, bool stacked)
    {
        double max = 0;
        foreach (Dictionary<string, JsonNode?> row in model.Rows)
        {
            if (stacked)
            {
                double sum = model.SeriesKeys.Sum(key => Math.Max(0, AsNumber(row.TryGetValue(key, out JsonNode? v) ? v : null) ?? 0));
                max = Math.Max(max, sum);
            }
            else
            {
                foreach (string key in model.SeriesKeys)
                {
                    max = Math.Max(max, AsNumber(row.TryGetValue(key, out JsonNode? v) ? v : null) ?? 0);
                }
            }
        }

        return max;
    }

    private static ChartModel? Normalize(JsonNode? data, JsonObject spec)
    {
        if (data is JsonObject map
            && map["labels"] is JsonArray labels
            && map["datasets"] is JsonArray datasets)
        {
            var seriesNames = datasets
                .Select((dataset, index) => dataset is JsonObject d
                    ? GenUIReactorViews.Str(d, "label") ?? $"series{index + 1}"
                    : $"series{index + 1}")
                .ToList();

            var rows = new List<Dictionary<string, JsonNode?>>();
            for (int i = 0; i < labels.Count; i++)
            {
                var row = new Dictionary<string, JsonNode?>(StringComparer.Ordinal)
                {
                    ["__label"] = labels[i],
                };
                for (int j = 0; j < datasets.Count; j++)
                {
                    JsonNode? value = datasets[j] is JsonObject datasetObj
                        && datasetObj["data"] is JsonArray dataArray
                        && i < dataArray.Count
                            ? dataArray[i]
                            : null;
                    row[seriesNames[j]] = value;
                }

                rows.Add(row);
            }

            return new ChartModel(rows, "__label", seriesNames);
        }

        if (data is not JsonArray list || list.Count == 0)
        {
            return null;
        }

        if (list[0] is not JsonObject)
        {
            var rows = list
                .Select((value, index) => new Dictionary<string, JsonNode?>(StringComparer.Ordinal)
                {
                    ["__label"] = JsonValue.Create((index + 1).ToString(CultureInfo.InvariantCulture)),
                    ["value"] = value,
                })
                .ToList();
            return new ChartModel(rows, "__label", new List<string> { "value" });
        }

        var objectRows = list
            .OfType<JsonObject>()
            .Select(obj => obj.ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal))
            .ToList();

        IReadOnlyList<string>? columns = GetStringList(spec, "columns");
        var allKeys = objectRows[0].Keys.ToList();
        string labelKey = (columns is { Count: > 0 } ? columns[0] : null)
            ?? GenUIReactorViews.Str(spec, "labelKey")
            ?? GenUIReactorViews.Str(spec, "xKey")
            ?? (allKeys.Count > 0 ? allKeys[0] : string.Empty);

        List<string> seriesKeys;
        IReadOnlyList<string>? specSeries = GetStringList(spec, "series");
        if (specSeries is { Count: > 0 })
        {
            seriesKeys = specSeries.ToList();
        }
        else if (columns is { Count: > 1 })
        {
            seriesKeys = columns.Skip(1).ToList();
        }
        else
        {
            seriesKeys = allKeys
                .Where(key => key != labelKey && AsNumber(objectRows[0].TryGetValue(key, out JsonNode? v) ? v : null) is not null)
                .ToList();
            if (seriesKeys.Count == 0)
            {
                seriesKeys = allKeys.Where(key => key != labelKey).Take(1).ToList();
            }
        }

        return new ChartModel(objectRows, labelKey, seriesKeys);
    }

    private static IReadOnlyList<string>? GetStringList(JsonObject spec, string key) =>
        spec[key] is JsonArray seq ? seq.Select(GenUIReactorViews.NodeStr).ToList() : null;

    private static string Stringify(JsonNode? node) =>
        node is null ? string.Empty : node is JsonValue value && value.TryGetValue<string>(out string? s) ? s : node.ToJsonString();

    private static double? AsNumber(JsonNode? node)
    {
        if (node is not JsonValue value)
        {
            return null;
        }

        if (value.TryGetValue<double>(out double d)) return d;
        if (value.TryGetValue<int>(out int i)) return i;
        if (value.TryGetValue<long>(out long l)) return l;
        if (value.TryGetValue<decimal>(out decimal m)) return (double)m;
        if (value.TryGetValue<bool>(out bool b)) return b ? 1 : 0;
        if (value.TryGetValue<string>(out string? s) && double.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out double parsed)) return parsed;
        return null;
    }
}