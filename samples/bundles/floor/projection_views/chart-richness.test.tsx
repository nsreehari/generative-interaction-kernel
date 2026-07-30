import { test } from "vitest";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Json } from "@gik/kernel";

import { FallbackView, buildRegistryFromImports, renderNode } from "@gik/react";
import { FLOOR_COMPONENTS } from "./floorLeaves";

const registry = buildRegistryFromImports(
  { ui: { from: "floor" } },
  (from) => from === "floor" ? FLOOR_COMPONENTS : undefined,
  FallbackView
);

function leaf(capability: string, props: Record<string, unknown>) {
  return {
    capability,
    id: capability,
    props: props as Record<string, Json>,
    visible: true,
    fallback: false,
    children: [],
  };
}

function renderChart(props: Record<string, unknown>): string {
  return renderToStaticMarkup(renderNode(leaf("ui:chart", props), registry, () => {}));
}

const barProps = {
  chartType: "bar",
  columns: ["month", "sales"],
  data: [{ month: "Jan", sales: 3 }, { month: "Feb", sales: 5 }],
};

test("bar chart renders Y-axis gridlines, tick labels, and a baseline axis", () => {
  const markup = renderChart(barProps);
  assert.match(markup, /class="gx-chart-grid"/);
  assert.match(markup, /class="gx-chart-axis-line"/);
  assert.match(markup, /class="gx-chart-axis-label"[^>]*>6<\/text>/); // nice tick above max 5
  assert.match(markup, /class="gx-chart-axis-label"[^>]*>Jan<\/text>/);
});

test("chart series colors come from theme role vars, not hardcoded hex", () => {
  const markup = renderChart(barProps);
  assert.match(markup, /fill="var\(--gx-chart-1\)"/);
  assert.doesNotMatch(markup, /#4e79a7|#f28e2b|#e15759/);
});

test("bar chart attaches hover tooltips via <title>", () => {
  const markup = renderChart(barProps);
  assert.match(markup, /<title>Jan[^<]*sales: 3<\/title>/);
  assert.match(markup, /<title>Feb[^<]*sales: 5<\/title>/);
});

test("line chart renders a polyline, data points, and tooltips", () => {
  const markup = renderChart({
    chartType: "line",
    data: [{ x: "Jan", v: 3 }, { x: "Feb", v: 5 }],
  });
  assert.match(markup, /<polyline/);
  assert.match(markup, /<circle[^>]*fill="var\(--gx-chart-1\)"/);
  assert.match(markup, /<title>Feb[^<]*v: 5<\/title>/);
});

test("pie chart renders slices with percentage tooltips and a legend", () => {
  const markup = renderChart({
    chartType: "pie",
    data: [{ label: "A", value: 3 }, { label: "B", value: 1 }],
  });
  assert.match(markup, /<path[^>]*fill="var\(--gx-chart-1\)"/);
  assert.match(markup, /<title>A: 3 \(75%\)<\/title>/);
  assert.match(markup, /class="gx-chart-legend"/);
});

test("multi-series bar chart renders a legend", () => {
  const markup = renderChart({
    chartType: "bar",
    columns: ["month", "sales", "cost"],
    data: [{ month: "Jan", sales: 3, cost: 2 }, { month: "Feb", sales: 5, cost: 4 }],
  });
  assert.match(markup, /class="gx-chart-legend"/);
  assert.match(markup, /fill="var\(--gx-chart-2\)"/); // second series uses the 2nd role color
});
