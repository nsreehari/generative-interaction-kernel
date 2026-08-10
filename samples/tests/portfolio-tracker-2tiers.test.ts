import assert from "node:assert/strict";
import { test } from "vitest";
import {
  materializeBlueprint,
  type BlueprintArtifact,
  type CellDefinition,
  type RepresentationLoweringRecipeDefinition,
} from "@gik/blueprint";
import { openBlueprint } from "@gik/controlface/blueprint";
import { bundleFromJson, loadBundleRuntime } from "@gik/react";
import effects from "../blueprints/portfolio-tracker/native/effect_handlers/portfolioTrackerEffectHandlers";
import { mockMarketDataHandler, MOCK_MARKET_DATA_PROVIDER } from "../services/mock-market-data";
import { declarativeServiceOrchestrator } from "../shared/service-runtime";
import { createBlueprintAgentLifecycle } from "../shared/blueprint-agent-lifecycle";
import { resolveSampleBlueprintSource } from "../shared/blueprint-catalog";
import { InMemoryStateModel } from "../../kernel/src/index";

const authoredBlueprint = () => resolveSampleBlueprintSource("portfolio-tracker-2tiers") as BlueprintArtifact<RepresentationLoweringRecipeDefinition>;

function stableFacets(cells: Record<string, CellDefinition>): Record<string, CellDefinition> {
  return Object.fromEntries(Object.entries(cells).map(([id, cell]) => {
    const { view: _view, ...stable } = cell;
    return [id, stable];
  }));
}

test("portfolio tracker lowers all six representations while preserving all seven Cells", () => {
  const authored = authoredBlueprint();
  const authoredCells = authored.payload.cells ?? {};
  const authoredStableFacets = stableFacets(authoredCells);

  assert.deepEqual(Object.keys(authoredCells), [
    "portfolio-workspace",
    "http-proxy-access-gate",
    "holdings",
    "market-prices",
    "positions",
    "summary",
    "portfolio-status",
  ]);
  for (const [view, attention, placements] of [
    ["mobile", "glanceable", 3],
    ["mobile", "detailed", 5],
    ["laptop", "glanceable", 4],
    ["laptop", "detailed", 6],
    ["desktop", "glanceable", 4],
    ["desktop", "detailed", 6],
  ] as const) {
    const terminal = materializeBlueprint({
      blueprint: authored,
      externalContext: { view, attention, marketMode: "mock" },
    }).payload.terminalBlueprint;
    assert.deepEqual(stableFacets(terminal.payload.cells ?? {}), authoredStableFacets);
    assert.equal(terminal.payload.cells?.["portfolio-workspace"].view?.capability, "primitive:container");
    assert.equal(terminal.payload.cells?.["portfolio-workspace"].view?.props?.fill, true);
    assert.equal(terminal.payload.projections?.presentation?.placements?.length, placements);
  }
});

test("portfolio tracker falls back to desktop detailed without context", () => {
  const authored = authoredBlueprint();
  const terminal = materializeBlueprint({ blueprint: authored }).payload.terminalBlueprint;

  assert.equal(terminal.payload.cells?.["portfolio-workspace"].view?.capability, "primitive:container");
  assert.equal(terminal.payload.cells?.["portfolio-workspace"].view?.props?.ariaLabel, "Portfolio");
});

test("portfolio tracker declares complete HTTP service operation transforms", () => {
  const authored = authoredBlueprint();
  const operations = authored.payload.services?.["portfolio-market-data"]?.operations;

  assert.equal(operations?.checkHttpProxyAccess?.settlement?.transform.kind, "jsonata");
  assert.equal(operations?.checkHttpProxyAccess?.failureSettlement?.transform.kind, "jsonata");
  assert.equal(operations?.refreshPrices?.request?.transform.kind, "jsonata");
  assert.equal(operations?.refreshPrices?.settlement?.transform.kind, "jsonata");
});

test("portfolio tracker declares narrow UBX intents without transferring representation authority", async () => {
  const authored = authoredBlueprint();
  const blueprintRuntime = openBlueprint(authored);
  const state = new InMemoryStateModel(Object.keys(blueprintRuntime.state));
  state.apply(Object.entries(blueprintRuntime.state).map(([path, value]) => ({ op: "set" as const, path, value })));
  const lifecycle = createBlueprintAgentLifecycle(blueprintRuntime, state);
  const before = structuredClone(state.snapshot());
  const propose = lifecycle.tools.find(({ name }) => name === "use_blueprint_propose");
  const receipt = await propose?.handler({
    kind: "refresh-prices",
    target: {
      kind: "blueprint-instance",
      id: blueprintRuntime.blueprintId,
      instanceId: blueprintRuntime.instanceId,
    },
    payloadJson: JSON.stringify({ operation: "refreshPrices" }),
    rationale: "Refresh quotes through the declared market-data service.",
  }) as { status: string };

  assert.deepEqual(authored.payload.agentLifecycle?.profiles?.use?.intentKinds, ["set-holdings", "refresh-prices"]);
  assert.equal(receipt.status, "admitted");
  assert.deepEqual(state.snapshot(), before);
  assert.equal(authored.payload.agentLifecycle?.profiles?.use?.constraints?.some((value) => value.includes("external context")), true);
});

test("market mode selects contract-compatible live and mock service implementations", () => {
  const authored = authoredBlueprint();
  const live = materializeBlueprint({
    blueprint: authored,
    externalContext: { view: "desktop", attention: "detailed", marketMode: "live" },
  }).payload.terminalBlueprint.payload;
  const mock = materializeBlueprint({
    blueprint: authored,
    externalContext: { view: "desktop", attention: "detailed", marketMode: "mock" },
  }).payload.terminalBlueprint.payload;

  assert.deepEqual(stableFacets(mock.cells ?? {}), stableFacets(live.cells ?? {}));
  assert.equal(live.services?.["portfolio-market-data"]?.kind, "http-service");
  assert.equal(mock.services?.["portfolio-market-data"]?.kind, "deterministic-agent");
  assert.deepEqual(
    Object.fromEntries(Object.entries(live.services?.["portfolio-market-data"]?.operations ?? {}).map(([id, operation]) => [id, operation.contract])),
    Object.fromEntries(Object.entries(mock.services?.["portfolio-market-data"]?.operations ?? {}).map(([id, operation]) => [id, operation.contract])),
  );
});

test("implementation lowering rejects a service contract change", () => {
  const authored = authoredBlueprint();
  const incompatible = structuredClone(authored) as BlueprintArtifact<RepresentationLoweringRecipeDefinition>;
  const mock = incompatible.payload.recipes[0].implementationPrograms?.find(({ id }) => id === "mock-market");
  const declaration = mock?.services?.["portfolio-market-data"];
  if (!declaration || !("operations" in declaration)) throw new Error("Missing mock service declaration");
  declaration.operations.refreshPrices.contract = "incompatible/v1";

  assert.throws(
    () => materializeBlueprint({
      blueprint: incompatible,
      externalContext: { view: "desktop", attention: "detailed", marketMode: "mock" },
    }),
    /changes operation contracts/,
  );
});

test("mock market-data service produces repeatable generated prices", async () => {
  const request = {
    holdings: {
      MSFT: { ticker: "MSFT", quantity: 100, costBasis: 300 },
      NVDA: { ticker: "NVDA", quantity: 50, costBasis: 350 },
    },
  };
  const first = await mockMarketDataHandler("fetch-quotes", request, undefined);
  const second = await mockMarketDataHandler("fetch-quotes", request, undefined);

  assert.deepEqual(first, second);
  assert.equal((first as Record<string, unknown>).provider, MOCK_MARKET_DATA_PROVIDER);
  assert.equal(typeof ((first as { quotes: Record<string, { price: number }> }).quotes.MSFT.price), "number");
  assert.equal(typeof ((first as { quotes: Record<string, { price: number }> }).quotes.NVDA.price), "number");
});

test("mock mode refreshes quotes and derives positions and summary through the stable Cell graph", async () => {
  const authored = authoredBlueprint();
  const materialized = materializeBlueprint({
    blueprint: authored,
    externalContext: { view: "desktop", attention: "detailed", marketMode: "mock" },
  });
  const blueprintRuntime = openBlueprint(materialized.payload.terminalBlueprint);
  const portfolio = loadBundleRuntime(bundleFromJson({
    vocabulary: materialized.payload.vocabulary,
    program: materialized.payload.program,
    state: materialized.payload.initialState,
  }, {
    effectHandlers: effects,
    wrapOrchestrator: declarativeServiceOrchestrator(blueprintRuntime),
  }));

  await portfolio.controller.emit("http-proxy-access-gate", "accessRequested", {}, "raam");
  await portfolio.controller.emit("holdings", "save", {
    rows: [
      { ticker: "MSFT", quantity: 100, costBasis: 300 },
      { ticker: "NVDA", quantity: 50, costBasis: 350 },
    ],
  }, "raam");
  await portfolio.controller.settle();

  assert.equal(portfolio.state.get("portfolio.httpProxyAccessStatus"), "ready");
  const msftQuote = portfolio.state.get("portfolio.quotes.MSFT") as { price: number };
  const msftPosition = portfolio.state.get("portfolio.positions.MSFT") as {
    quantity: number;
    price: number;
    value: number;
    costBasis: number;
    gainLoss: number;
  };
  assert.equal(typeof msftQuote.price, "number");
  assert.equal(typeof (portfolio.state.get("portfolio.quotes.NVDA") as { price?: unknown })?.price, "number");
  assert.equal(msftPosition.quantity, 100);
  assert.equal(msftPosition.price, msftQuote.price);
  assert.equal(msftPosition.value, 100 * msftQuote.price);
  assert.equal(msftPosition.costBasis, 30000);
  assert.equal(msftPosition.gainLoss, msftPosition.value - msftPosition.costBasis);
  assert.equal(typeof portfolio.state.get("portfolio.summary.marketValue"), "number");
});
