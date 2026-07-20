import assert from "node:assert/strict";
import { test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Json, ResolvedNode } from "@gik/kernel";
import { buildRegistryFromImports, floorFallback, renderNode } from "@gik/react";

import foundryViews from "./index";

function gate(status: string, children: ResolvedNode[] = []): ResolvedNode {
  return {
    capability: "foundry:access-gate",
    id: "foundry-access-gate",
    props: { status, error: "" } as Record<string, Json>,
    visible: true,
    fallback: false,
    children,
  };
}

const registry = buildRegistryFromImports(
  { foundry: { from: "foundry", use: ["access-gate"] } },
  (from) => from === "foundry" ? foundryViews : undefined,
  floorFallback
);

test("foundry:access-gate prompts for access and withholds protected children", () => {
  const markup = renderToStaticMarkup(renderNode(gate("required", [{
    capability: "ui:text",
    id: "protected",
    props: { value: "Protected content" },
    visible: true,
    fallback: false,
    children: [],
  }]), registry, () => {}));

  assert.match(markup, /Connect to Foundry/);
  assert.match(markup, />Cancel</);
  assert.doesNotMatch(markup, /Protected content/);
});

test("foundry:access-gate renders protected children when access is ready", () => {
  const markup = renderToStaticMarkup(renderNode(gate("ready", [{
    capability: "ui:text",
    id: "protected",
    props: { value: "Protected content" },
    visible: true,
    fallback: false,
    children: [],
  }]), registry, () => {}));

  assert.match(markup, /Protected content/);
  assert.doesNotMatch(markup, /Connect to Foundry/);
});