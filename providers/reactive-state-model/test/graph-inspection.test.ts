import { test } from "vitest";
import assert from "node:assert/strict";

import { computedGraphToMermaid, inspectComputedGraph } from "../src/graph-inspection";
import { capacityBannerSample, profileFormSample } from "../src/samples";

test("inspectComputedGraph infers source and derived nodes for profileFormSample", () => {
  const graph = inspectComputedGraph(profileFormSample.computed);

  assert.deepEqual(
    graph.nodes.map((node) => [node.id, node.kind]),
    [
      ["consent", "source"],
      ["form.first", "source"],
      ["form.last", "source"],
      ["form.full", "derived"],
      ["form.ready", "derived"],
      ["ui.submitLabel", "derived"],
    ]
  );
  assert.ok(graph.edges.some((edge) => edge.from === "form.ready" && edge.to === "ui.submitLabel"));
  assert.ok(graph.edges.some((edge) => edge.from === "form.first" && edge.to === "form.full"));
});

test("computedGraphToMermaid renders a stable dependency graph for capacityBannerSample", () => {
  const mermaid = computedGraphToMermaid(capacityBannerSample.computed, { title: capacityBannerSample.name, direction: "LR" });

  assert.match(mermaid, /^%% capacity-banner/m);
  assert.match(mermaid, /^graph LR/m);
  assert.match(mermaid, /metrics_approved\(\[metrics\.approved\]\)/);
  assert.match(mermaid, /metrics_total\[metrics\.total\]/);
  assert.match(mermaid, /metrics_total --> metrics_overLimit/);
  assert.match(mermaid, /metrics_overLimit --> ui_banner/);
});