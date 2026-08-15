import assert from "node:assert/strict";
import { test } from "vitest";
import {
  materializeBlueprint,
  runMaterializedTransition,
  type CellDefinition,
} from "@gik/blueprint";
import { openBlueprint } from "@gik/controlface/blueprint";
import { unwrap } from "@gik/kernel";
import { resolveSampleBlueprintSource } from "../catalog/blueprint-catalog";
import { resolveSampleNativeServices } from "../apps/node-host/native-services";
import {
  createNodeBlueprintServiceHost,
  nodeServiceOrchestrator,
} from "../apps/node-host/service-host";

const projectedBlueprint = () => resolveSampleBlueprintSource("portfolio-tracker-2tiers");
const headlessBlueprint = () => resolveSampleBlueprintSource("portfolio-tracker-2tiers-headless");

function stableFacets(cells: Record<string, CellDefinition>): Record<string, CellDefinition> {
  return Object.fromEntries(Object.entries(cells).map(([id, cell]) => {
    const { view: _view, ...stable } = cell;
    return [id, stable];
  }));
}

test("headless portfolio preserves the original two-tier domain and all seven Cell contracts", () => {
  const projected = projectedBlueprint();
  const headless = headlessBlueprint();

  assert.deepEqual(headless.payload.tiers, projected.payload.tiers);
  assert.deepEqual(stableFacets(headless.payload.cells ?? {}), stableFacets(projected.payload.cells ?? {}));
  assert.deepEqual(headless.payload.services, projected.payload.services);
  assert.deepEqual(
    headless.payload.recipes[0].implementationPrograms,
    projected.payload.recipes[0].implementationPrograms,
  );
});

test("headless portfolio materializes with no UI or presentation declarations", () => {
  const materialized = materializeBlueprint({
    blueprint: headlessBlueprint(),
    externalContext: { marketMode: "mock" },
  });
  const terminal = materialized.payload.terminalBlueprint.payload;
  const program = unwrap(materialized.payload.program);

  assert.equal(terminal.projections, undefined);
  assert.equal(terminal.runtime.capabilities, undefined);
  assert.equal(terminal.runtime.externals?.projectionViews, undefined);
  assert.equal(program.root, undefined);
  assert.equal(Object.values(terminal.cells ?? {}).some(({ view }) => view !== undefined), false);
  assert.deepEqual(program.handlers?.map(({ id }) => id), [
    "portfolio-workspace",
    "http-proxy-access-gate",
    "holdings",
    "market-prices",
  ]);
  assert.equal("reactions" in program, false);
  assert.equal("derivations" in program, false);
  assert.deepEqual(program.graph?.nodes.map(({ id }) => id), [
    "market-prices-evaluate",
    "positions-evaluate",
    "summary-evaluate",
    "portfolio-status-evaluate",
  ]);
  assert.equal(terminal.services?.["portfolio-market-data"]?.kind, "deterministic-agent");
});

test("headless portfolio authorizes market data, refreshes quotes, and derives its read model", async () => {
  const materialized = materializeBlueprint({
    blueprint: headlessBlueprint(),
    externalContext: { marketMode: "mock" },
  });
  const runtime = openBlueprint(materialized.payload.terminalBlueprint);
  const nativeServices = resolveSampleNativeServices("portfolio-tracker-2tiers-headless");
  const result = await runMaterializedTransition({
    materializedBlueprint: materialized,
    state: materialized.payload.initialState,
    events: [{ node: "http-proxy-access-gate", name: "accessRequested", actorId: "portfolio-api" }],
    createOrchestrator: (state) => {
      const host = createNodeBlueprintServiceHost(runtime, state, {}, nativeServices);
      return nodeServiceOrchestrator(runtime, host, state)(undefined, state);
    },
  });
  const portfolio = result.state.portfolio as Record<string, unknown>;
  const quotes = portfolio.quotes as Record<string, { price: number }>;
  const positions = portfolio.positions as Record<string, { price: number; value: number }>;
  const summary = portfolio.summary as { marketValue: number; gainLoss: number };
  const status = portfolio.status as { tone: string; message: string };

  assert.equal(portfolio.httpProxyAccessStatus, "ready");
  assert.equal(typeof quotes.AAPL.price, "number");
  assert.equal(positions.AAPL.price, quotes.AAPL.price);
  assert.equal(summary.marketValue, Math.round((positions.AAPL.value + positions.MSFT.value) * 100) / 100);
  assert.equal(status.tone, summary.gainLoss > 0 ? "positive" : summary.gainLoss < 0 ? "negative" : "neutral");
  assert.equal(typeof status.message, "string");
});