import assert from "node:assert/strict";
import { test } from "vitest";

import { buildRegistryFromImports } from "@gik/react";
import type { ProjectionView } from "@gik/react";

import primitiveLeaves, {
  PRIMITIVE_COMPONENT_CAPABILITIES,
} from "./primitiveLeaves";

const Fallback: ProjectionView = () => null;

test("primitive bundle exposes every declared component capability", () => {
  assert.deepEqual(
    Object.keys(primitiveLeaves).sort(),
    Object.keys(PRIMITIVE_COMPONENT_CAPABILITIES).sort(),
  );
  assert.deepEqual(Object.keys(primitiveLeaves).sort(), [
    "access-gate",
    "chart",
    "collection-board",
    "container",
    "datetime",
    "editable-table",
    "file-download",
    "file-input",
    "file-list",
    "form",
    "gantt",
    "graph-diagram",
    "growing-container",
    "infinite-canvas",
    "markdown",
    "source-viewer",
    "timer-button",
    "todo-list",
  ]);
});

test("primitive bundle resolves through a manifest projection alias", () => {
  const registry = buildRegistryFromImports(
    { primitive: { from: "primitive", use: ["chart", "editable-table", "form", "growing-container"] } },
    (from) => from === "primitive" ? primitiveLeaves : undefined,
    Fallback,
  );

  assert.equal(typeof registry.get("primitive:chart"), "function");
  assert.equal(typeof registry.get("primitive:editable-table"), "function");
  assert.equal(typeof registry.get("primitive:form"), "function");
  assert.equal(typeof registry.get("primitive:growing-container"), "function");
});