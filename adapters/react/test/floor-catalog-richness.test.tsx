import { test } from "vitest";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Json } from "../../../kernel/src/types";

import { renderNode } from "../src/render";
import { buildRegistryFromImports } from "../src/registry";
import { FLOOR_COMPONENTS, floorFallback } from "../src/primitives/registry";

const registry = buildRegistryFromImports(
  { ui: { from: "floor" } },
  (from) => (from === "floor" ? FLOOR_COMPONENTS : undefined),
  floorFallback
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

function render(capability: string, props: Record<string, unknown>) {
  return renderToStaticMarkup(renderNode(leaf(capability, props), registry, () => {}));
}

test("property leaf renders a labelled value and dash-fills a blank value", () => {
  const filled = render("ui:property", { label: "Role", value: "timeline" });
  assert.match(filled, /class="gx-property-label"[^>]*>Role</);
  assert.match(filled, /class="gx-property-value"[^>]*>timeline</);

  const blank = render("ui:property", { label: "Role", value: "" });
  assert.match(blank, /class="gx-property-value"[^>]*>—</);
});

test("maplist leaf renders directional from → to rows with an optional header", () => {
  const markup = render("ui:maplist", {
    fromLabel: "kind",
    toLabel: "capability",
    rows: [
      { from: "explain", to: "ui:markdown" },
      { from: "compare", to: "" },
    ],
  });
  assert.match(markup, /class="gx-maplist-head"/);
  assert.match(markup, /class="gx-maplist-from"[^>]*>kind</);
  assert.match(markup, /class="gx-maplist-to"[^>]*>capability</);
  // Both data rows plus their directional arrow glyph.
  assert.match(markup, /explain/);
  assert.match(markup, /ui:markdown/);
  assert.ok((markup.match(/→/g) ?? []).length >= 2);
  // Empty target dash-fills rather than rendering an empty span.
  assert.match(markup, /class="gx-maplist-to"[^>]*>—</);
});

test("maplist leaf shows an empty note when there are no rows", () => {
  const markup = render("ui:maplist", { rows: [] });
  assert.match(markup, /class="gx-note gx-note-muted"[^>]*>Nothing to map\.</);
});

test("vocabulary leaf renders grouped, non-editable term chips", () => {
  const markup = render("ui:vocabulary", {
    groups: [
      { label: "Interaction kinds", note: "closed set", terms: ["explain", "compare", "decide"] },
      { label: "Empty group", terms: [] },
    ],
  });
  assert.match(markup, /class="gx-vocab-label"[^>]*>Interaction kinds</);
  assert.match(markup, /class="gx-vocab-note"[^>]*>closed set</);
  // Terms render as static <code> chips (documentation, not removable selection).
  assert.match(markup, /<code class="gx-vocab-term"[^>]*>explain<\/code>/);
  assert.match(markup, /<code class="gx-vocab-term"[^>]*>decide<\/code>/);
  // Empty group dash-fills instead of collapsing.
  assert.match(markup, /class="gx-vocab-empty"[^>]*>—</);
});
