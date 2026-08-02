import assert from "node:assert/strict";
import { test } from "vitest";

import { primitiveComponentDefinitions } from "../src/primitives";
import { semanticComponentDefinitions } from "../src/semantic";

test("semantic and primitive entry points expose distinct component layers", () => {
  assert.ok("timeline" in semanticComponentDefinitions);
  assert.ok(!("chart" in semanticComponentDefinitions));
  assert.ok("chart" in primitiveComponentDefinitions);
  assert.ok("timer-button" in primitiveComponentDefinitions);
  assert.equal(primitiveComponentDefinitions.chart.capability, "primitive:chart");
});