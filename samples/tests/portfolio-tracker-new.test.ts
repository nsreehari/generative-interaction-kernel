import assert from "node:assert/strict";
import {
  analyzeCellComposition,
  materializeBlueprint,
  runMaterializedTransition,
  type CellDefinition,
} from "@gik/blueprint";
import { openBlueprint } from "@gik/controlface/blueprint";
import {
  InMemoryStateModel,
  Kernel,
  projectCellRunState,
  unwrap,
  type BlueprintRunState,
  type ResolvedNode,
} from "@gik/kernel";
import { BlueprintController } from "@gik/react";
import { test } from "vitest";

import {
  resolveSampleBlueprintSource,
  resolveSampleLaunchExternalContext,
} from "../catalog/blueprint-catalog";
import { resolveSampleNativeServices } from "../apps/node-host/native-services";
import {
  createNodeBlueprintServiceHost,
  nodeServiceOrchestrator,
} from "../apps/node-host/service-host";
import { resolveBlueprintNativeFromMaterialized } from "../apps/browser-host/src/runtime/sample-bundles";

const emptyOrchestrator = {} as Parameters<ReturnType<typeof nodeServiceOrchestrator>>[0];

function serviceHandler(config: unknown): unknown {
  return config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>).handler
    : undefined;
}

function findNode(node: ResolvedNode, id: string): ResolvedNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const match = findNode(child, id);
    if (match) return match;
  }
  return undefined;
}

test("portfolio-tracker-new declares the canonical five-Cell contract", () => {
  const blueprint = resolveSampleBlueprintSource("portfolio-tracker-new");
  const cells = blueprint.payload.cells as Record<string, CellDefinition>;

  assert.deepEqual(Object.keys(cells), [
    "portfolio-holdings",
    "market-prices",
    "portfolio-value-cell",
    "portfolio-intelligence",
    "board",
  ]);
  assert.deepEqual(cells["portfolio-holdings"].inputs ?? [], []);
  assert.deepEqual(cells["portfolio-holdings"].outputs, [
    { token: "holdings", from: "portfolio.holdings" },
  ]);
  assert.deepEqual(cells["market-prices"].inputs, [{ token: "holdings" }]);
  assert.deepEqual(cells["market-prices"].outputs, [
    { token: "stock-quotes", from: "computed.portfolio.stockQuotes" },
  ]);
  assert.deepEqual(cells["portfolio-value-cell"].inputs, [
    { token: "holdings" },
    { token: "stock-quotes" },
  ]);
  assert.deepEqual(cells["portfolio-value-cell"].outputs, [
    {
      token: "portfolio-value",
      from: "computed.portfolio.value",
      when: "$count(inputs.holdings.*) = $count(inputs.`stock-quotes`.*) and $count(inputs.holdings.*[$exists($lookup($$.inputs.`stock-quotes`, ticker).price)]) = $count(inputs.holdings.*)",
    },
  ]);
  assert.deepEqual(cells["portfolio-intelligence"].inputs, [
    { token: "portfolio-value" },
  ]);
  assert.deepEqual(cells["portfolio-intelligence"].outputs, [
    { token: "portfolio-intelligence", from: "computed.portfolio.intelligence" },
  ]);
  assert.deepEqual(cells.board.inputs, [
    { token: "holdings" },
    { token: "stock-quotes" },
    { token: "portfolio-value" },
    { token: "portfolio-intelligence" },
  ]);
  assert.deepEqual(cells.board.outputs ?? [], []);

  assert.deepEqual(blueprint.payload.tiers, [
    { id: "portfolio-logic", kind: "portfolio-domain" },
    { id: "portfolio-presentation", kind: "runtime-document" },
  ]);
  const composition = analyzeCellComposition(Object.values(cells));
  assert.deepEqual(composition.externalInputs, []);
  assert.deepEqual(composition.diagnostics, []);
});

test("portfolio-tracker-new fetches quotes, calculates value, and produces mock intelligence", async () => {
  const materialized = materializeBlueprint({
    blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
    externalContext: { "intelligence-model": "mock", view: "desktop" },
  });
  const runtime = openBlueprint(materialized.payload.terminalBlueprint);
  const nativeServices = resolveSampleNativeServices("portfolio-tracker-new");
  const result = await runMaterializedTransition({
    materializedBlueprint: materialized,
    state: materialized.payload.initialState,
    syncExternal: true,
    events: [{
      node: "portfolio-holdings",
      name: "save",
      actorId: "portfolio-test",
      payload: {
        rows: [
          { ticker: "AAPL", quantity: 2, costBasis: 90 },
          { ticker: "MSFT", quantity: 3, costBasis: 180 },
        ],
      },
    }],
    createOrchestrator: (state) => {
      const host = createNodeBlueprintServiceHost(runtime, state, {}, nativeServices);
      return nodeServiceOrchestrator(runtime, host, state)(emptyOrchestrator, state);
    },
  });
  const portfolio = result.state.portfolio as Record<string, any>;

  assert.deepEqual(portfolio.stockQuotes, {
    AAPL: { ticker: "AAPL", price: 212.93 },
    MSFT: { ticker: "MSFT", price: 357.81 },
  });
  assert.deepEqual(portfolio.value, {
    positions: {
      AAPL: {
        ticker: "AAPL",
        quantity: 2,
        price: 212.93,
        value: 425.86,
        costBasis: 180,
        gainLoss: 245.86,
      },
      MSFT: {
        ticker: "MSFT",
        quantity: 3,
        price: 357.81,
        value: 1073.43,
        costBasis: 540,
        gainLoss: 533.43,
      },
    },
    summary: { marketValue: 1499.29, costBasis: 720, gainLoss: 779.29 },
  });
  assert.equal(portfolio.intelligence.provider, "portfolio-intelligence-mock");
  assert.deepEqual(portfolio.intelligence.observations, [
    "Largest position: MSFT",
    "Market value: 1499.29",
    "Gain/loss: 779.29",
  ]);
});

test("portfolio-tracker-new produces predictable mock intelligence from current values", async () => {
  const materialized = materializeBlueprint({
    blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
    externalContext: { "intelligence-model": "mock", view: "desktop" },
  });
  const runtime = openBlueprint(materialized.payload.terminalBlueprint);
  const nativeServices = resolveSampleNativeServices("portfolio-tracker-new");
  const result = await runMaterializedTransition({
    materializedBlueprint: materialized,
    state: materialized.payload.initialState,
    syncExternal: true,
    events: [],
    createOrchestrator: (state) => {
      const host = createNodeBlueprintServiceHost(runtime, state, {}, nativeServices);
      return nodeServiceOrchestrator(runtime, host, state)(emptyOrchestrator, state);
    },
  });
  const intelligence = (result.state.portfolio as Record<string, any>).intelligence;

  assert.equal(intelligence.provider, "portfolio-intelligence-mock");
  assert.equal(intelligence.summary, "Mock intelligence response for the current portfolio snapshot.");
  assert.deepEqual(intelligence.observations, [
    "Largest position: MSFT",
    "Market value: 1499.29",
    "Gain/loss: 779.29",
  ]);
  assert.deepEqual(intelligence.risks, ["mock response; not model-generated", "current snapshot only"]);
  assert.deepEqual(intelligence.evidence, ["portfolio.positions", "portfolio.summary"]);
  assert.equal(intelligence.asOf, "mock-current-snapshot");
});

test("portfolio-tracker-new shows each generated spinner while its Cell sources are pending", async () => {
  const materialized = materializeBlueprint({
    blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
    externalContext: { "intelligence-model": "mock", view: "desktop" },
  });
  const pending = await runMaterializedTransition({
    materializedBlueprint: materialized,
    state: materialized.payload.initialState,
    syncExternal: true,
    events: [],
  });
  const runState = pending.state.blueprintRunState as unknown as BlueprintRunState;
  assert.equal(projectCellRunState(runState.cells["market-prices"]).numSourcesRunning, 1);
  assert.equal(Object.hasOwn(runState.cells["market-prices"], "numSourcesRunning"), false);

  const store = new InMemoryStateModel(unwrap(materialized.payload.vocabulary).namespaces ?? []);
  store.apply(Object.entries(pending.state).map(([path, value]) => ({ op: "set", path, value })));
  const kernel = new Kernel(materialized.payload.vocabulary, materialized.payload.program, { state: store });
  const spinner = findNode(await kernel.resolve(), "market-prices--before-0");
  assert.equal(spinner?.capability, "fluent:spinner");
  assert.equal(spinner?.visible, true);

  const intelligencePendingState = structuredClone(pending.state);
  const intelligenceRunState = intelligencePendingState.blueprintRunState as unknown as BlueprintRunState;
  const marketSource = intelligenceRunState.cells["market-prices"].sources[0];
  marketSource.lastCompletedToken = marketSource.lastRequestedToken;
  const intelligenceSource = intelligenceRunState.cells["portfolio-intelligence"].sources[0];
  intelligenceSource.lastRequestedToken = "portfolio-intelligence-request";
  assert.equal(projectCellRunState(intelligenceRunState.cells["portfolio-intelligence"]).numSourcesRunning, 1);
  assert.equal(Object.hasOwn(intelligenceRunState.cells["portfolio-intelligence"], "numSourcesRunning"), false);

  const intelligenceStore = new InMemoryStateModel(unwrap(materialized.payload.vocabulary).namespaces ?? []);
  intelligenceStore.apply(Object.entries(intelligencePendingState).map(([path, value]) => ({ op: "set", path, value })));
  const intelligenceKernel = new Kernel(materialized.payload.vocabulary, materialized.payload.program, {
    state: intelligenceStore,
  });
  const intelligenceTree = await intelligenceKernel.resolve();
  assert.equal(findNode(intelligenceTree, "market-prices--before-0")?.visible, false);
  assert.equal(findNode(intelligenceTree, "portfolio-intelligence--before-0")?.visible, true);
});

test("portfolio-tracker-new browser controller publishes its pending spinner tree", async () => {
  const blueprint = resolveSampleBlueprintSource("portfolio-tracker-new");
  const externalContext = { "intelligence-model": "mock", view: "desktop" };
  const materialized = materializeBlueprint({ blueprint, externalContext });
  const controller = new BlueprintController(blueprint, {
    externalContext,
    materializedBlueprint: materialized,
    native: resolveBlueprintNativeFromMaterialized("portfolio-tracker-new", materialized),
  });
  const spinnerPublished = new Promise<void>((resolve) => {
    const unsubscribe = controller.subscribe(() => {
      const tree = controller.getTree();
      if (tree && findNode(tree, "market-prices--before-0")?.visible) {
        unsubscribe();
        resolve();
      }
    });
  });

  await controller.start();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      spinnerPublished,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Pending spinner tree was not published")), 5_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  controller.stop();
});

test("portfolio-tracker-new selects intelligence and board behavior from explicit external context", () => {
  assert.deepEqual(resolveSampleLaunchExternalContext("portfolio-tracker-new"), {
    "intelligence-model": "simple",
    view: "desktop",
  });

  for (const intelligenceModel of ["simple", "mock", "semantic"] as const) {
    for (const view of ["desktop", "mobile"] as const) {
      const materialized = materializeBlueprint({
        blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
        externalContext: { "intelligence-model": intelligenceModel, view },
      });
      const terminal = materialized.payload.terminalBlueprint.payload;

      assert.equal(
        terminal.services?.["portfolio-intelligence"]?.kind,
        intelligenceModel === "mock" ? "deterministic-agent" : "foundry-agent",
      );
      const intelligenceService = terminal.services?.["portfolio-intelligence"];
      const semanticService = terminal.services?.["portfolio-intelligence-2"];
      assert.equal(
        serviceHandler(intelligenceService?.config),
        intelligenceModel === "mock" ? "portfolio-intelligence-mock" : undefined,
      );
      assert.equal(
        intelligenceModel === "mock"
          ? undefined
          : (intelligenceService?.config as Record<string, unknown>)?.agent,
        intelligenceModel === "mock" ? undefined : "Portfolio-Intelligence-Agent",
      );
      assert.equal(semanticService?.kind, "foundry-agent");
      assert.equal(
        (semanticService?.config as Record<string, unknown>)?.agent,
        "Portfolio-Intelligence-2-Agent",
      );
      assert.equal(
        Array.isArray(intelligenceService?.operations)
          ? undefined
          : intelligenceService?.operations?.requestIntelligence?.contract,
        "portfolio-intelligence/v1",
      );
      assert.equal(
        Array.isArray(semanticService?.operations)
          ? undefined
          : semanticService?.operations?.requestIntelligence2?.contract,
        "portfolio-intelligence-2/v1",
      );
      const intelligenceSources = terminal.cells?.["portfolio-intelligence"].sources ?? [];
      assert.deepEqual(
        intelligenceSources.map(({ id, service, contract }) => ({ id, service, contract })),
        [
          {
            id: "portfolio-intelligence.source",
            service: "portfolio-intelligence",
            contract: "portfolio-intelligence/v1",
          },
          {
            id: "portfolio-intelligence-2.source",
            service: "portfolio-intelligence-2",
            contract: "portfolio-intelligence-2/v1",
          },
        ],
      );
      assert.equal(
        intelligenceSources[0]?.when,
        intelligenceModel === "semantic" ? "false" : "inputs.`portfolio-value`.summary.marketValue > 0",
      );
      assert.equal(
        intelligenceSources[1]?.when,
        intelligenceModel === "semantic" ? "inputs.`portfolio-value`.summary.marketValue > 0" : "false",
      );
      assert.equal(
        terminal.cells?.["portfolio-intelligence"].view?.capability,
        intelligenceModel === "semantic" ? "portfolio:intelligence-projections" : "primitive:markdown",
      );
      if (intelligenceModel === "semantic") {
        const semanticOperation = Array.isArray(semanticService?.operations)
          ? undefined
          : semanticService?.operations?.requestIntelligence2;
        assert.equal(
          semanticOperation?.settlement?.transform.expr,
          "{'ops':[{'op':'set','path':'portfolio.intelligence','value':response}],'detail':{'provider':'foundry-agent','agentName':'Portfolio-Intelligence-2-Agent'}}",
        );
        assert.deepEqual(
          terminal.cells?.["portfolio-intelligence"].view?.bindings?.value,
          { from: "portfolio.intelligence" },
        );
        assert.equal(
          terminal.cells?.["portfolio-intelligence"].view?.props?.presentationContext,
          view === "desktop" ? "portfolio-advisor" : "portfolio-overview",
        );
      }
      assert.equal(
        terminal.cells?.board.view?.props?.variant,
        view === "desktop" ? "stack" : "column",
      );
      assert.equal(terminal.cells?.["portfolio-value-cell"].view?.capability, "primitive:chart");
      assert.equal(
        terminal.cells?.["portfolio-value-cell"].view?.props?.variant,
        view === "desktop" ? "standard" : "compact",
      );
      assert.equal(
        "table" in (terminal.cells?.["portfolio-value-cell"].view?.props?.spec as Record<string, unknown>),
        view === "desktop",
      );
      for (const sourceBackedCellId of ["market-prices", "portfolio-intelligence"]) {
        assert.deepEqual(terminal.cells?.[sourceBackedCellId].view?.before, [{
          capability: "fluent:spinner",
          props: { label: "Loading" },
          visibility: "systemInputs.numSourcesRunning > 0",
        }]);
      }
      for (const plainCellId of ["portfolio-holdings", "portfolio-value-cell", "board"]) {
        assert.equal(terminal.cells?.[plainCellId].view?.before, undefined);
      }
      const rootChildren = unwrap(materialized.payload.program).root?.edges?.children ?? [];
      assert.equal(rootChildren[0]?.id, "portfolio-holdings");
      assert.equal(rootChildren[1]?.id, "market-prices--decorated");
      assert.equal(rootChildren[1]?.edges?.children?.[0]?.capability, "fluent:spinner");
      assert.equal(
        rootChildren[1]?.edges?.children?.[0]?.edges?.gate,
        '($count(($lookup(blueprintRunState.cells, "market-prices").sources)[lastRequestedToken != null and lastRequestedToken != lastCompletedToken])) > 0',
      );
      assert.equal(rootChildren[3]?.id, "portfolio-intelligence--decorated");
      assert.deepEqual(Object.keys(terminal.cells ?? {}), [
        "portfolio-holdings",
        "market-prices",
        "portfolio-value-cell",
        "portfolio-intelligence",
        "board",
      ]);
    }
  }
});

test("portfolio-holdings save settles declaratively before host source execution", async () => {
  const materialized = materializeBlueprint({
    blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
    externalContext: { "intelligence-model": "simple", view: "desktop" },
  });
  const result = await runMaterializedTransition({
    materializedBlueprint: materialized,
    state: materialized.payload.initialState,
    syncExternal: true,
    events: [{
      node: "portfolio-holdings",
      name: "save",
      payload: {
        rows: [
          { ticker: "goog", quantity: 4, costBasis: 150 },
        ],
      },
    }],
  });

  assert.deepEqual((result.state.portfolio as Record<string, any>).holdings, {
    GOOG: { ticker: "GOOG", quantity: 4, costBasis: 150 },
  });
  assert.equal(
    result.effects?.some((effect) => effect.kind === "invoke" && effect.node === "portfolio-holdings"),
    false,
  );
});