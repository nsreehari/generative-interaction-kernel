import assert from "node:assert/strict";
import { test } from "vitest";

import {
  evaluateCell,
  validateCell,
} from "../src";

const cell = {
  id: "portfolio-summary",
  inputs: [{ token: "positions", as: "positions", required: true }],
  sources: [{
    id: "prices",
    service: "market",
    operation: "refresh",
    contract: "prices/v1",
    when: "inputs.positions != null and computed.total > 0",
    input: { kind: "jsonata", expr: "inputs.positions.symbol" },
    output: { kind: "jsonata", expr: "response.chart.result[0].meta.regularMarketPrice" },
  }],
  compute: [{
    id: "total",
    expression: "$sum(inputs.positions.value)",
    assign: "total",
    dependencies: ["inputs.positions"],
  }, {
    id: "label",
    expression: "'$' & $string(computed.total)",
    assign: "label",
    dependencies: ["total"],
  }],
  outputs: [
    { token: "portfolio-total", from: "computed.total" },
    { token: "portfolio-label", from: "computed.label" },
  ],
} as const;

const blueprintRunState = {
  cells: { "portfolio-summary": { sources: [] } },
};
const systemContext = { blueprintRunState, cellId: "portfolio-summary" };

test("evaluateCell purely derives outputs and admitted source effects", () => {
  const result = evaluateCell({
    materializedProgramCell: cell,
    inputs: { positions: [{ symbol: "MSFT", value: 10 }, { symbol: "AAPL", value: 15 }] },
    settledSources: { prices: 421.5 },
    systemContext,
  });

  assert.deepEqual(result.outputs, { "portfolio-total": 25, "portfolio-label": "$25" });
  assert.deepEqual(result.computed, { total: 25, label: "$25" });
  assert.deepEqual(result.operations, [
    { op: "set", path: "total", value: 25 },
    { op: "set", path: "label", value: "$25" },
  ]);
  assert.equal(result.effects.length, 1);
  assert.equal(result.effects[0].source.id, "prices");
  assert.equal(result.effects[0].source.input?.expr, "inputs.positions.symbol");
  assert.equal(result.effects[0].source.output?.expr, "response.chart.result[0].meta.regularMarketPrice");
  assert.deepEqual(result.effects[0].sourceInputs.inputs, {
    positions: [{ symbol: "MSFT", value: 10 }, { symbol: "AAPL", value: 15 }],
  });
});

test("evaluateCell exposes only settled source values to computes", () => {
  const result = evaluateCell({
    materializedProgramCell: {
      ...cell,
      sources: [],
      compute: [{
        id: "price",
        expression: "sources.prices",
        assign: "price",
        dependencies: ["sources.prices"],
      }],
      outputs: [{ token: "market-price", from: "computed.price" }],
    },
    inputs: { positions: [] },
    settledSources: { prices: 421.5 },
    systemContext,
  });

  assert.deepEqual(result.outputs, { "market-price": 421.5 });
});

test("evaluateCell withholds outputs whose predicate is false", () => {
  const result = evaluateCell({
    materializedProgramCell: {
      id: "analysis",
      compute: [{ id: "report", expression: "sources.report", assign: "report" }],
      outputs: [{ token: "analysis-report", from: "computed.report", when: "computed.report != null" }],
    },
    inputs: {},
    settledSources: {},
    systemContext,
  });

  assert.deepEqual(result.outputs, {});
});

test("evaluateCell resolves only declared system inputs as pure Blueprint run-state projections", () => {
  const activeCellRunState = {
    sources: [{
      id: "prices",
      lastRequestedToken: "request-1",
      lastCompletedToken: null,
      lastCompletionStatus: null,
      queueRequestedToken: "request-1",
    }],
  };
  const activeBlueprintRunState = { cells: { "portfolio-summary": activeCellRunState } };
  const result = evaluateCell({
    materializedProgramCell: {
      id: "portfolio-summary",
      systemInputs: ["numSourcesRunning"],
      compute: [{
        id: "running",
        expression: "systemInputs.numSourcesRunning",
        assign: "running",
      }],
      outputs: [{ token: "running", from: "computed.running" }],
    },
    inputs: {},
    settledSources: {},
    systemContext: { blueprintRunState: activeBlueprintRunState, cellId: "portfolio-summary" },
  });

  assert.deepEqual(result.outputs, { running: 1 });
  assert.equal(activeCellRunState.sources[0].lastCompletedToken, null);
});

test("validateCell requires registered system tokens and rejects arbitrary evaluator roots", () => {
  assert.equal(validateCell({
    id: "valid-run-state",
    systemInputs: ["numSourcesRunning"],
    compute: [{ id: "running", expression: "systemInputs.numSourcesRunning", assign: "running" }],
  }).ok, true);

  const undeclared = validateCell({
    id: "undeclared-run-state",
    compute: [{ id: "running", expression: "systemInputs.numSourcesRunning", assign: "running" }],
  });
  assert.equal(undeclared.ok, false);
  assert.match(undeclared.errors[0].detail, /must be declared/);

  const arbitrary = validateCell({
    id: "arbitrary-root",
    compute: [{ id: "running", expression: "runtime.numSourcesRunning", assign: "running" }],
  });
  assert.equal(arbitrary.ok, false);
  assert.match(arbitrary.errors[0].detail, /Unknown evaluator expression root 'runtime'/);

  const internal = validateCell({
    id: "internal-root",
    compute: [{ id: "running", expression: "blueprintRunState.cells", assign: "running" }],
  });
  assert.equal(internal.ok, false);
  assert.match(internal.errors[0].detail, /Internal namespace/);

  const scopedFields = validateCell({
    id: "scoped-fields",
    compute: [{
      id: "positions",
      expression: "$merge(inputs.holdings.*.($quote := $lookup($$.inputs.quotes, ticker); {ticker:{'ticker':ticker,'quantity':quantity,'price':$quote.price,'value':quantity * $quote.price,'costBasis':quantity * costBasis}}))",
      assign: "positions",
    }],
  });
  assert.equal(scopedFields.ok, true);

  const variableFields = validateCell({
    id: "variable-fields",
    compute: [{
      id: "positions",
      expression: "($rows := $each(inputs.holdings, function($holding, $ticker) {{$ticker:{'quantity':$holding.quantity,'costBasis':$holding.costBasis}}}); $merge($rows))",
      assign: "positions",
    }],
  });
  assert.equal(variableFields.ok, true);
});

test("validateCell accepts dependency hints and runtime-owned outputs", () => {
  const report = validateCell({
    ...cell,
    compute: [{ ...cell.compute[0], dependencies: ["later"] }],
    outputs: [{ token: "bad", from: "inputs.positions" }],
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
});

test("validateCell accepts declared input forwarding and rejects unowned output paths", () => {
  const forwarded = validateCell({
    id: "selection",
    inputs: [{ token: "selection.value", as: "value" }],
    outputs: [{ token: "selected", from: "inputs.value" }],
  });
  const unowned = validateCell({
    id: "selection",
    inputs: [{ token: "selection.value", as: "value" }],
    outputs: [{ token: "selected", from: "other.value" }],
  });

  assert.equal(forwarded.ok, true);
  assert.equal(unowned.ok, false);
  assert.equal(unowned.errors[0]?.code, "unknown-output-compute");
});
