import assert from "node:assert/strict";
import { test } from "vitest";

import { buildRegistryFromImports } from "@gik/react";
import type { ProjectionView } from "@gik/react";

import semanticLeaves, {
  SEMANTIC_COMPONENT_CAPABILITIES,
} from "./semanticLeaves";

const Fallback: ProjectionView = () => null;

test("semantic bundle exposes every declared component capability", () => {
  assert.deepEqual(
    Object.keys(semanticLeaves).sort(),
    Object.keys(SEMANTIC_COMPONENT_CAPABILITIES).sort(),
  );
  assert.ok("event-series" in semanticLeaves);
  assert.ok("relationship-set" in semanticLeaves);
  assert.ok(!("chart" in semanticLeaves));
});

test("semantic bundle resolves through a manifest projection alias", () => {
  const registry = buildRegistryFromImports(
    { semantic: { from: "semantic", use: ["event-series", "relationship-set"] } },
    (from) => from === "semantic" ? semanticLeaves : undefined,
    Fallback,
  );

  assert.equal(typeof registry.get("semantic:event-series"), "function");
  assert.equal(typeof registry.get("semantic:relationship-set"), "function");
});