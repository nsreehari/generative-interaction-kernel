import assert from "node:assert/strict";
import {
  analyzeCellComposition,
  materializeBlueprint,
  runMaterializedTransition,
  type BlueprintArtifact,
  type CellDefinition,
} from "@gik/blueprint";
import Ajv from "ajv";
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
import {
  createNodeBlueprintServiceHost,
  nodeServiceOrchestrator,
} from "../apps/node-host/service-host";
import { resolveBlueprintNativeFromMaterialized } from "../apps/browser-host/src/runtime/sample-bundles";

const emptyOrchestrator = {} as Parameters<ReturnType<typeof nodeServiceOrchestrator>>[0];

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
  assert.deepEqual(cells["portfolio-intelligence"].outputs ?? [], []);
  assert.deepEqual(cells.board.inputs ?? [], []);
  assert.deepEqual(cells.board.outputs ?? [], []);

  assert.deepEqual(blueprint.payload.tiers, [
    { id: "portfolio-logic", kind: "portfolio-domain" },
    { id: "portfolio-market", kind: "portfolio-domain" },
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
      const host = createNodeBlueprintServiceHost(runtime, state, {});
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
  assert.match(portfolio.intelligence.markdown, /Largest position: MSFT/);
  assert.match(portfolio.intelligence.markdown, /Market value: 1499.29/);
  assert.match(portfolio.intelligence.markdown, /Gain\/loss: 779.29/);
});

test("portfolio-tracker-new produces predictable mock intelligence from current values", async () => {
  const materialized = materializeBlueprint({
    blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
    externalContext: { "intelligence-model": "mock", view: "desktop" },
  });
  const runtime = openBlueprint(materialized.payload.terminalBlueprint);
  const result = await runMaterializedTransition({
    materializedBlueprint: materialized,
    state: materialized.payload.initialState,
    syncExternal: true,
    events: [],
    createOrchestrator: (state) => {
      const host = createNodeBlueprintServiceHost(runtime, state, {});
      return nodeServiceOrchestrator(runtime, host, state)(emptyOrchestrator, state);
    },
  });
  const intelligence = (result.state.portfolio as Record<string, any>).intelligence;

  assert.equal(intelligence.provider, "portfolio-intelligence-mock");
  assert.equal(
    intelligence.markdown,
    "# Mock portfolio intelligence\n\nLargest position: MSFT\n\n- Market value: 1499.29\n- Gain/loss: 779.29\n\n> Deterministic mock response for the current snapshot; not model-generated.",
  );
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
    ai: "foundry",
    "intelligence-model": "simple",
    "market-prices": "mock",
    view: "desktop",
  });

  for (const ai of ["foundry", "copilot"] as const) {
    for (const intelligenceModel of ["simple", "mock", "semantic"] as const) {
      for (const view of ["desktop", "mobile"] as const) {
      const materialized = materializeBlueprint({
        blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
        externalContext: {
          ai,
          "intelligence-model": intelligenceModel,
          "market-prices": "mock",
          view,
        },
      });
      const terminal = materialized.payload.terminalBlueprint.payload;
      const intelligenceSources = terminal.cells?.["portfolio-intelligence"].sources ?? [];
      assert.equal(
        intelligenceSources[0]?.when,
        intelligenceModel === "semantic" ? "false" : "inputs.`portfolio-value`.summary.marketValue > 0",
      );
      assert.equal(
        intelligenceSources[1]?.when,
        intelligenceModel === "semantic" ? "inputs.`portfolio-value`.summary.marketValue > 0" : "false",
      );
      const activeSource = intelligenceSources[intelligenceModel === "semantic" ? 1 : 0];
      const activeService = terminal.services?.[activeSource?.service ?? ""];
      if (intelligenceModel === "mock") {
        assert.equal(activeService?.kind, undefined);
        assert.deepEqual(activeService?.blueprint, {
          $ref: "blueprint:portfolio-tracker-mock@1.0.0",
        });
        assert.equal(activeService?.config, undefined);
      } else {
        assert.equal(activeService?.kind, `${ai}-agent`);
        assert.equal(
          (activeService?.config as Record<string, unknown>)?.agent,
          intelligenceModel === "semantic"
            ? "Portfolio-Intelligence-2-Agent"
            : "Portfolio-Intelligence-Agent",
        );
      }
      assert.equal(
        terminal.cells?.["portfolio-intelligence"].view?.capability,
        intelligenceModel === "semantic" ? "gik:blueprint" : "primitive:markdown",
      );
      if (intelligenceModel === "semantic") {
        assert.match(activeSource?.input?.expr ?? "", /componentCatalog/);
        const semanticOperation = Array.isArray(activeService?.operations)
          ? undefined
          : activeService?.operations?.requestIntelligence2;
        assert.deepEqual(
          terminal.cells?.["portfolio-intelligence"].view?.bindings?.blueprint,
          { from: "portfolio.intelligence" },
        );
        if (ai === "foundry") {
          const responseSchema = semanticOperation?.response?.validators?.find(
            (validator) => validator.code === "provider-structured-output" && "schema" in validator,
          );
          assert.equal(responseSchema && "schema" in responseSchema
            ? (responseSchema.schema as Record<string, unknown>).required?.toString()
            : undefined, "gik,type,payload");
        }
      } else {
        assert.deepEqual(
          terminal.cells?.["portfolio-intelligence"].view?.bindings?.value,
          { from: "portfolio.intelligence.markdown" },
        );
      }
      assert.equal(terminal.cells?.board.inputs, undefined);
      assert.equal(terminal.cells?.["portfolio-intelligence"].outputs, undefined);
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
  }
});

test("portfolio semantic response contract admits a self-contained report Blueprint", () => {
  const reportBlueprint: BlueprintArtifact = {
    gik: "0.1",
    type: "blueprint",
    payload: {
      id: "generated-semantic-report",
      kind: "semantic-report",
      version: "1.0.0",
      structureMode: "fixed",
      tiers: [
        { id: "report-semantic", kind: "semantic-report-model" },
        { id: "runtime-document", kind: "runtime-document" },
      ],
      recipes: [{
        id: "semantic-report-to-runtime",
        from: "report-semantic",
        to: "runtime-document",
        representations: [{
          id: "report",
          views: { report: { capability: "primitive:markdown", bindings: { value: { from: "report.markdown" } } } },
          presentation: { roots: ["report"], placements: [] },
        }],
        fallback: "report",
      }],
      runtime: {
        expression: "jsonata",
        namespaces: ["report"],
        actions: [],
        capabilities: { "primitive:markdown": { propsSchema: { type: "object", additionalProperties: true } } },
        externals: { projectionViews: { primitive: { from: "primitive", use: ["markdown"] } } },
        state: {
          report: {
            headline: "Concentration deserves attention",
            summary: "MSFT is the largest supplied position.",
            asOf: "supplied portfolio snapshot",
            sections: [{ heading: "Concentration", body: "MSFT represents the largest position by value.", kind: "fact" }],
            markdown: "# Concentration deserves attention\n\nMSFT is the largest supplied position.",
          },
        },
      },
      cells: { report: { id: "report", kind: "semantic-report" } },
    },
  };
  const portfolio = resolveSampleBlueprintSource("portfolio-tracker-new");
  const operation = portfolio.payload.services?.["portfolio-intelligence-2"]?.operations.requestIntelligence2;
  for (const code of ["provider-structured-output", "report-blueprint-shape"]) {
    const validator = operation?.response?.validators?.find(
      (candidate) => candidate.code === code && "schema" in candidate,
    );
    assert.ok(validator && "schema" in validator);
    const validate = new Ajv({ strict: false }).compile(validator.schema);
    assert.equal(validate(reportBlueprint), true, `${code}: ${JSON.stringify(validate.errors)}`);
  }

  const materialized = materializeBlueprint({ blueprint: reportBlueprint });
  assert.equal(materialized.payload.terminalBlueprint.payload.cells?.report.view?.capability, "primitive:markdown");
  assert.equal(materialized.payload.terminalBlueprint.payload.runtime.state?.report.markdown,
    "# Concentration deserves attention\n\nMSFT is the largest supplied position.");
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