import assert from "node:assert/strict";
import { test } from "vitest";

import { componentDefinitions } from "../src/shared";

test("every declared component event has a closed payload contract", () => {
  for (const definition of Object.values(componentDefinitions)) {
    assert.deepEqual(
      Object.keys(definition.eventContracts).sort(),
      [...definition.events].sort(),
      definition.capability,
    );

    for (const [event, contract] of Object.entries(definition.eventContracts)) {
      assert.ok(contract.summary.length > 0, `${definition.capability}:${event}`);
      assert.equal(contract.payloadSchema.type, "object", `${definition.capability}:${event}`);
      assert.equal(contract.payloadSchema.additionalProperties, false, `${definition.capability}:${event}`);
    }
  }
});

test("definitions without events default event contracts to an empty object", () => {
  assert.deepEqual(componentDefinitions.chart.events, []);
  assert.deepEqual(componentDefinitions.chart.eventContracts, {});
});