import assert from "node:assert/strict";
import { test } from "vitest";

import { componentDefinitions } from "../src/shared";
import {
  actionBoardDefinition,
  createSemanticComponentAuthoringTools,
  describeSemanticComponent,
  getSemanticComponentAgentInstructions,
  listSemanticComponents,
  materializeActionBoardTrial,
  preflightSemanticComponent,
  validateActionBoard,
} from "../src/semantic";

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

test("ActionBoard action payload contract is discoverable through every authoring surface", () => {
  const expected = {
    action: {
      summary: "The user invokes an action for a board item.",
      payloadSchema: {
        type: "object",
        additionalProperties: false,
        required: ["actionId", "id", "item"],
        properties: {
          actionId: { type: "string" },
          id: { type: "string" },
          item: { type: "object", additionalProperties: true },
        },
      },
    },
  };
  const trial = materializeActionBoardTrial();

  assert.deepEqual(actionBoardDefinition.eventContracts, expected);
  assert.deepEqual(describeSemanticComponent("action-board").eventContracts, expected);
  assert.deepEqual(listSemanticComponents().find((entry) => entry.id === "action-board")?.eventContracts, expected);
  assert.deepEqual(preflightSemanticComponent("action-board", trial.props).eventContracts, expected);

  const tools = createSemanticComponentAuthoringTools(["action-board"]);
  assert.deepEqual(tools.find((tool) => tool.name === "listSemanticComponents")!.handler({}), [{
    id: "action-board",
    capability: actionBoardDefinition.capability,
    version: actionBoardDefinition.version,
    summary: actionBoardDefinition.summary,
    dataProp: actionBoardDefinition.dataProp,
    slots: [],
    defaultVariant: actionBoardDefinition.defaultVariant,
    variants: actionBoardDefinition.variants.map((variant) => variant.value),
    events: actionBoardDefinition.events,
    eventContracts: expected,
  }]);
  assert.deepEqual(
    (tools.find((tool) => tool.name === "describeSemanticComponent")!.handler({ capability: "action-board" }) as { eventContracts: unknown }).eventContracts,
    expected,
  );
  assert.deepEqual(
    (tools.find((tool) => tool.name === "preflightSemanticComponent")!.handler({ capability: "action-board", props: trial.props }) as { eventContracts: unknown }).eventContracts,
    expected,
  );

  const instructions = getSemanticComponentAgentInstructions(["action-board"]);
  assert.match(instructions, /Event payload contracts:/);
  assert.match(instructions, /action: The user invokes an action for a board item\./);
  assert.match(instructions, /"actionId"/);
  assert.match(instructions, /"additionalProperties":true/);
});

test("ActionBoard rejects duplicate identities and undeclared groups", () => {
  const trial = materializeActionBoardTrial();
  const item = (trial.props.items as Array<Record<string, unknown>>)[0];
  const report = validateActionBoard({
    ...trial.props,
    items: [item, { ...item, lane: "later" }],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.errors.map((issue) => issue.code).sort(), [
    "action-board-declared-group",
    "action-board-unique-item-id",
  ]);
});