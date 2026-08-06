import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
  materializeBlueprint,
  parseBlueprintJson,
  runMaterializedTransition,
  type BlueprintArtifact,
  type CellDefinition,
  type RepresentationLoweringRecipeDefinition,
} from "@gik/blueprint";
import { openBlueprint } from "@gik/controlface/blueprint";
import { unwrap } from "@gik/kernel";
import { declarativeServiceOrchestrator } from "../shared/service-runtime";

const projectedUrl = new URL("../blueprints/portfolio-tracker-2tiers/blueprint.json", import.meta.url);
const headlessUrl = new URL("../blueprints/portfolio-tracker-2tiers-headless/blueprint.json", import.meta.url);

function readBlueprint(url: URL): BlueprintArtifact<RepresentationLoweringRecipeDefinition> {
  return parseBlueprintJson<RepresentationLoweringRecipeDefinition>(readFileSync(url, "utf8"));
}

function stableFacets(cells: Record<string, CellDefinition>): Record<string, CellDefinition> {
  return Object.fromEntries(Object.entries(cells).map(([id, cell]) => {
    const { view: _view, ...stable } = cell;
    return [id, stable];
  }));
}

test("headless portfolio preserves the original two-tier domain and all seven Cell contracts", () => {
  const projected = readBlueprint(projectedUrl);
  const headless = readBlueprint(headlessUrl);

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
    blueprint: readBlueprint(headlessUrl),
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
  assert.equal(program.reactions?.length, 1);
  assert.equal(program.derivations?.length, 3);
  assert.equal(terminal.services?.["portfolio-market-data"]?.kind, "deterministic-agent");
});

test("headless portfolio authorizes market data, refreshes quotes, and derives its read model", async () => {
  const materialized = materializeBlueprint({
    blueprint: readBlueprint(headlessUrl),
    externalContext: { marketMode: "mock" },
  });
  const runtime = openBlueprint(materialized.payload.terminalBlueprint);
  const result = await runMaterializedTransition({
    materializedBlueprint: materialized,
    state: materialized.payload.initialState,
    events: [{ node: "http-proxy-access-gate", name: "accessRequested", actorId: "portfolio-api" }],
    createOrchestrator: (state) => declarativeServiceOrchestrator(runtime)(undefined, state),
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