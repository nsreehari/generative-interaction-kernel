import assert from "node:assert/strict";
import { test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Json } from "@gik/kernel";
import { buildRegistryFromImports, floorFallback, renderNode } from "@gik/react";

import fluentViews from "./index";

function leaf(capability: string, value: string, extraProps: Record<string, Json> = {}) {
  return {
    capability,
    id: capability,
    props: {
      value,
      onValue: "auto",
      offValue: "manual",
      onLabel: "Auto",
      offLabel: "Manual",
      ...extraProps,
    } as Record<string, Json>,
    visible: true,
    fallback: false,
    children: [],
  };
}

const registry = buildRegistryFromImports(
  { fluent: { from: "fluent", use: ["switch", "toggle"] } },
  (from) => from === "fluent" ? fluentViews : undefined,
  floorFallback
);

test("fluent:switch renders the track-and-thumb switch with value-derived state", () => {
  const markup = renderToStaticMarkup(renderNode(leaf("fluent:switch", "auto"), registry, () => {}));

  assert.match(markup, /class="[^"]*gx-fluent-switch/);
  assert.match(markup, /role="switch"/);
  assert.match(markup, /checked=""/);
  assert.match(markup, /<label[^>]*>Auto<\/label>/);
});

test("fluent:toggle renders the pressed-button variant with declarative stable width", () => {
  const markup = renderToStaticMarkup(renderNode(
    leaf("fluent:toggle", "auto", { minWidth: 72 }),
    registry,
    () => {}
  ));

  assert.match(markup, /class="[^"]*gx-fluent-toggle/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /min-width:72px/);
  assert.match(markup, />Auto<\/button>/);
});