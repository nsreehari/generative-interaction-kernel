import assert from "node:assert/strict";
import { test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Json } from "@gik/kernel";
import { FallbackView, buildRegistryFromImports, renderNode } from "@gik/react";

import fluentViews from "./fluentLeaves";

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
  { fluent: { from: "fluent", use: ["button", "dropdown", "icon-button", "switch", "toggle"] } },
  (from) => from === "fluent" ? fluentViews : undefined,
  FallbackView
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

test("fluent:dropdown renders declarative options and the selected label", () => {
  const markup = renderToStaticMarkup(renderNode(
    leaf("fluent:dropdown", "soc-t3", {
      ariaLabel: "Select demo Blueprint",
      options: [
        { value: "soc-t3", label: "Governed SOC investigation" },
        { value: "soc-executive", label: "SOC executive walkthrough" },
      ],
    }),
    registry,
    () => {}
  ));

  assert.match(markup, /class="[^"]*gx-fluent-dropdown/);
  assert.match(markup, /role="combobox"/);
  assert.match(markup, /aria-label="Select demo Blueprint"/);
  assert.match(markup, /Governed SOC investigation/);
  assert.doesNotMatch(markup, /SOC executive walkthrough/);
});

test("fluent:icon-button renders a named icon-only command", () => {
  const markup = renderToStaticMarkup(renderNode(
    leaf("fluent:icon-button", "", {
      icon: "full-screen-minimize",
      ariaLabel: "Exit full screen",
    }),
    registry,
    () => {}
  ));

  assert.match(markup, /class="[^"]*gx-fluent-icon-button/);
  assert.match(markup, /aria-label="Exit full screen"/);
  assert.match(markup, /title="Exit full screen"/);
  assert.match(markup, /<svg/);
});

test("fluent:button renders a labeled command", () => {
  const markup = renderToStaticMarkup(renderNode(
    leaf("fluent:button", "", {
      label: "Analyze report",
      appearance: "primary",
    }),
    registry,
    () => {}
  ));

  assert.match(markup, /class="[^"]*gx-fluent-button/);
  assert.match(markup, />Analyze report<\/button>/);
});