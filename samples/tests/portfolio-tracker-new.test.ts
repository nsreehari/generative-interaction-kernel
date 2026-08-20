import assert from "node:assert/strict";
import {
  analyzeCellComposition,
  materializeBlueprint,
  runMaterializedTransition,
  type BlueprintArtifact,
  type CellDefinition,
} from "@gik/blueprint";
import { openBlueprint } from "@gik/controlface/blueprint";
import { runDeclarativeValidators } from "@gik/evaluators";
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

test("portfolio-tracker-new declares the canonical Cells and parent report metadata", () => {
  const blueprint = resolveSampleBlueprintSource("portfolio-tracker-new");
  const cells = blueprint.payload.cells as Record<string, CellDefinition>;

  assert.deepEqual(Object.keys(cells), [
    "portfolio-holdings",
    "market-prices",
    "portfolio-value-cell",
    "portfolio-intelligence",
    "portfolio-intelligence-context",
    "portfolio-intelligence-resolution",
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
    { token: "portfolio-analysis-context", as: "analysisContext", required: true },
    { token: "saved-portfolio-report-envelope", as: "savedReportEnvelope", required: true },
    { token: "portfolio.intelligenceRequest", as: "analysisRequest" },
  ]);
  assert.deepEqual(cells["portfolio-intelligence"].outputs, [{
    token: "generated-portfolio-report-envelope",
    from: "computed.generatedReport",
    when: "$exists(sources.`portfolio-semantic-intelligence.source`)",
  }]);
  assert.deepEqual(cells["portfolio-intelligence-context"].outputs, [
    { token: "portfolio-analysis-context", from: "computed.portfolio.analysisContext" },
    { token: "saved-portfolio-report-envelope", from: "computed.savedReportEnvelope" },
  ]);
  assert.deepEqual(cells["portfolio-intelligence-resolution"].inputs, [
    { token: "portfolio-analysis-context", as: "analysisContext", required: true },
    { token: "saved-portfolio-report-envelope", as: "savedReportEnvelope", required: true },
    { token: "generated-portfolio-report-envelope", as: "generatedReport", required: false },
  ]);
  assert.deepEqual(cells.board.inputs ?? [], []);
  assert.deepEqual(cells.board.outputs ?? [], []);
  assert.ok(blueprint.payload.runtime.capabilities["primitive:datetime"]);
  assert.ok(
    blueprint.payload.runtime.externals.projectionViews.primitive.use.includes("datetime"),
  );

  assert.deepEqual(blueprint.payload.tiers, [
    { id: "portfolio-logic", kind: "portfolio-domain" },
    { id: "portfolio-market", kind: "portfolio-domain" },
    { id: "portfolio-presentation", kind: "runtime-document" },
  ]);
  const composition = analyzeCellComposition(Object.values(cells));
  assert.deepEqual(composition.externalInputs, ["portfolio.intelligenceRequest"]);
  assert.deepEqual(composition.diagnostics, []);
});

test("portfolio semantic intelligence hydrates saved output and runs only after an explicit request", () => {
  const blueprint = resolveSampleBlueprintSource("portfolio-tracker-new");
  const cells = blueprint.payload.cells as Record<string, CellDefinition>;
  const savedReports = blueprint.payload.services["portfolio-saved-reports"];

  assert.deepEqual(savedReports.blueprint, {
    $ref: "blueprint:portfolio-intelligence-assets@1.0.0",
  });
  assert.equal(savedReports.operations.getSavedReport.operation, "get-report");
  assert.equal(savedReports.operations.putSavedReport.operation, "put-report");
  assert.equal(
    cells["portfolio-intelligence"].behavior?.on?.press?.[0]?.target,
    "portfolio.intelligenceRequest",
  );
  assert.match(
    cells["portfolio-intelligence-context"].compute?.find(
      ({ id }) => id === "portfolio-analysis-context",
    )?.expression ?? "",
    /\$string\(inputs\.`portfolio-value`\)/,
  );
  assert.equal(
    cells["portfolio-intelligence-resolution"].sources?.[0]?.when,
    "inputs.generatedReport != null",
  );

  const implementationPrograms = blueprint.payload.recipes[1].implementationPrograms ?? [];
  const semanticPrograms = implementationPrograms.filter(({ id }) => id.startsWith("semantic-"));
  assert.equal(semanticPrograms.length, 4);
  for (const program of semanticPrograms) {
    const source = program.cells?.["portfolio-intelligence"].sources?.find(
      ({ id }) => id === "portfolio-semantic-intelligence.source",
    );
    assert.match(source?.when ?? "", /inputs\.analysisRequest\.portfolioKey = inputs\.analysisContext\.portfolioKey/);
    assert.match(source?.when ?? "", /inputs\.analysisRequest\.analysisKey = inputs\.analysisContext\.analysisKey/);
    assert.match(source?.input?.expr ?? "", /requestId/);

    const savedSource = program.cells?.["portfolio-intelligence-context"].sources?.[0];
    assert.equal(savedSource?.operation, "getSavedReport");
    assert.match(savedSource?.output?.expr ?? "", /'found':response != null/);
  }
  assert.match(
    cells["portfolio-intelligence-resolution"].compute?.[0]?.expression ?? "",
    /inputs\.savedReportEnvelope/,
  );
});

test("portfolio semantic Generate event starts the gated agent source", async () => {
  const materialized = materializeBlueprint({
    blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
    externalContext: {
      ai: "copilot",
      "intelligence-model": "semantic",
      "market-prices": "mock",
      semantic: "simple-markdown",
      view: "desktop",
    },
  });
  const runtime = openBlueprint(materialized.payload.terminalBlueprint);
  const ready = await runMaterializedTransition({
    materializedBlueprint: materialized,
    state: materialized.payload.initialState,
    syncExternal: true,
    events: [],
    createOrchestrator: (state) => {
      const host = createNodeBlueprintServiceHost(runtime, state, {});
      return nodeServiceOrchestrator(runtime, host, state)(emptyOrchestrator, state);
    },
  });
  const requested = await runMaterializedTransition({
    materializedBlueprint: materialized,
    state: ready.state,
    syncExternal: true,
    events: [{
      node: "portfolio-intelligence",
      name: "press",
      actorId: "portfolio-test",
      payload: {},
    }],
  });
  const portfolio = requested.state.portfolio as Record<string, any>;
  const runState = requested.state.blueprintRunState as unknown as BlueprintRunState;

  assert.deepEqual(portfolio.intelligenceRequest, {
    portfolioKey: JSON.stringify(portfolio.value),
    analysisKey: "copilot/simple-markdown",
    requestId: portfolio.intelligenceRequest.requestId,
    requestedAt: portfolio.intelligenceRequest.requestedAt,
  });
  assert.equal(
    projectCellRunState(runState.cells["portfolio-intelligence"]).numSourcesRunning,
    1,
  );
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
    semantic: "simple-markdown",
    view: "desktop",
  });

  for (const ai of ["foundry", "copilot"] as const) {
    for (const intelligenceModel of ["simple", "mock", "semantic"] as const) {
      for (const semantic of ["simple-markdown", "rich-components"] as const) {
        for (const view of ["desktop", "mobile"] as const) {
      const materialized = materializeBlueprint({
        blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
        externalContext: {
          ai,
          "intelligence-model": intelligenceModel,
          "market-prices": "mock",
          semantic,
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
        intelligenceModel === "semantic"
          ? "inputs.`portfolio-value`.summary.marketValue > 0 and inputs.analysisRequest.portfolioKey = inputs.analysisContext.portfolioKey and inputs.analysisRequest.analysisKey = inputs.analysisContext.analysisKey"
          : "false",
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
            ? "Portfolio-Semantic-Intelligence-Agent"
            : "Portfolio-Intelligence-Agent",
        );
      }
      assert.equal(
        terminal.cells?.["portfolio-intelligence"].view?.capability,
        intelligenceModel === "semantic" ? "fluent:button" : "primitive:markdown",
      );
      if (intelligenceModel === "semantic") {
        assert.match(
          activeSource?.input?.expr ?? "",
          /acceptedCapabilities/,
        );
        assert.match(activeSource?.input?.expr ?? "", /authoringBrief/);
        assert.match(activeSource?.input?.expr ?? "", /sectionMap/);
        assert.match(activeSource?.input?.expr ?? "", /positiveCurrency/);
        assert.match(activeSource?.input?.expr ?? "", /negativeCurrency/);
        assert.match(activeSource?.input?.expr ?? "", /artifactScaffold/);
        assert.match(activeSource?.input?.expr ?? "", /slotPolicy/);
        if (semantic === "simple-markdown") {
          assert.match(activeSource?.input?.expr ?? "", /DELIMITER-CHECK/);
        }
        assert.equal(
          (activeSource?.input?.expr ?? "").includes("'portfolioValue'"),
          false,
        );
        assert.match(
          activeSource?.input?.expr ?? "",
          new RegExp(`'presentationMode':'${semantic}'`),
        );
        assert.equal(
          (activeSource?.input?.expr ?? "").includes("'fluent:table'"),
          semantic === "rich-components",
        );
        assert.equal(
          (activeSource?.input?.expr ?? "").includes("'primitive:markdown'"),
          semantic === "simple-markdown",
        );
        assert.equal(
          (activeSource?.input?.expr ?? "").includes("'primitive:chart'"),
          semantic === "rich-components",
        );
        assert.equal(
          (activeSource?.input?.expr ?? "").includes("'semantic:narrative'"),
          semantic === "rich-components",
        );
        assert.equal(
          (activeSource?.input?.expr ?? "").includes("$now()"),
          false,
        );
        assert.match(activeSource?.output?.expr ?? "", /'found':true/);
        assert.match(activeSource?.output?.expr ?? "", /'requestId':inputs\.analysisRequest\.requestId/);
        const semanticOperation = Array.isArray(activeService?.operations)
          ? undefined
          : activeService?.operations?.[
            "generateReport"
          ];
        assert.match(semanticOperation?.request?.transform?.expr ?? "", /'acceptedCapabilities':input\.acceptedCapabilities/);
        assert.match(semanticOperation?.request?.transform?.expr ?? "", /'authoringBrief':input\.authoringBrief/);
        assert.match(semanticOperation?.request?.transform?.expr ?? "", /'presentationMode':input\.presentationMode/);
        assert.match(
          semanticOperation?.settlement?.transform?.expr ?? "",
          /'path':'portfolio\.intelligenceRequest','value':null/,
        );
        assert.deepEqual(
          terminal.cells?.["portfolio-intelligence-resolution"].view?.bindings?.blueprint,
          { from: "portfolio.resolvedIntelligenceEnvelope.report" },
        );
        assert.equal(
          terminal.cells?.["portfolio-intelligence-resolution"].view?.visibility,
          "portfolio.resolvedIntelligenceEnvelope.report != null",
        );
        assert.deepEqual(
          terminal.cells?.["portfolio-intelligence-resolution"].view?.before?.[0]?.bindings?.value,
          { from: "portfolio.resolvedIntelligenceEnvelope.asOf" },
        );
        assert.equal(
          terminal.cells?.["portfolio-intelligence-resolution"].view?.before?.[0]?.capability,
          "primitive:datetime",
        );
        assert.equal(
          terminal.cells?.["portfolio-intelligence-resolution"].view?.before?.[0]?.visibility,
          "portfolio.resolvedIntelligenceEnvelope.asOf != null",
        );
        assert.deepEqual(
          semanticOperation?.response?.validators?.map(({ code }) => code),
          [
            "semantic-report-blueprint",
            "semantic-report-capability-catalog",
            "semantic-report-admission",
          ],
        );
        if (semantic === "rich-components") {
          assert.equal(
            semanticOperation?.response?.validators?.some(
             (validator) => validator.code === "provider-structured-output",
            ),
            false,
          );
          assert.equal(
            semanticOperation?.response?.validators?.some(
             (validator) => validator.code === "semantic-report-admission",
            ),
            true,
          );
          assert.equal(
            (activeService?.config as Record<string, unknown>)?.responseMode,
            "json",
          );
        }
      } else {
        assert.deepEqual(
          terminal.cells?.["portfolio-intelligence"].view?.bindings?.value,
          { from: "portfolio.intelligence.markdown" },
        );
        assert.equal(terminal.cells?.["portfolio-intelligence-resolution"].view?.visibility, "false");
      }
      assert.equal(terminal.cells?.board.inputs, undefined);
      assert.deepEqual(terminal.cells?.["portfolio-intelligence"].outputs, [{
        token: "generated-portfolio-report-envelope",
        from: "computed.generatedReport",
        when: "$exists(sources.`portfolio-semantic-intelligence.source`)",
      }]);
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
      if (intelligenceModel === "semantic") {
        assert.equal(rootChildren[3]?.id, "portfolio-intelligence--decorated");
        assert.equal(rootChildren[4]?.id, "portfolio-intelligence-resolution--decorated");
      } else {
        assert.equal(rootChildren[3]?.id, "portfolio-intelligence--decorated");
      }
      assert.deepEqual(Object.keys(terminal.cells ?? {}), [
        "portfolio-holdings",
        "market-prices",
        "portfolio-value-cell",
        "portfolio-intelligence",
        "portfolio-intelligence-context",
        "portfolio-intelligence-resolution",
        "board",
      ]);
        }
      }
    }
  }
}, 15_000);

test("portfolio semantic presentation context is inert outside semantic intelligence mode", () => {
  for (const intelligenceModel of ["mock", "simple"] as const) {
    const materialize = (semantic: "simple-markdown" | "rich-components") =>
      materializeBlueprint({
        blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
        externalContext: {
          ai: "foundry",
          "intelligence-model": intelligenceModel,
          "market-prices": "mock",
          semantic,
          view: "desktop",
        },
      }).payload.terminalBlueprint;

    assert.deepEqual(materialize("simple-markdown"), materialize("rich-components"));
  }
});

test("portfolio semantic presentation defaults to simple Markdown when omitted", () => {
  const terminal = materializeBlueprint({
    blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
    externalContext: {
      ai: "foundry",
      "intelligence-model": "semantic",
      "market-prices": "mock",
      view: "desktop",
    },
  }).payload.terminalBlueprint.payload;
  const source = terminal.cells?.["portfolio-intelligence"].sources?.[1];

  assert.equal(source?.service, "portfolio-semantic-intelligence");
  assert.equal(source?.operation, "generateReport");
  assert.equal(source?.contract, "portfolio-semantic-intelligence/v1");
  assert.match(source?.input?.expr ?? "", /'acceptedCapabilities':\['primitive:markdown'\]/);
  assert.equal(
    (terminal.services?.["portfolio-semantic-intelligence"]?.config as Record<string, unknown>)?.agent,
    "Portfolio-Semantic-Intelligence-Agent",
  );
  assert.equal(terminal.cells?.["portfolio-intelligence"].view?.capability, "fluent:button");
  assert.equal(terminal.cells?.["portfolio-intelligence-resolution"].view?.capability, "gik:blueprint");
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
          presentation: { roots: ["report"], composition: {} },
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
            sections: [{ heading: "Concentration", body: "MSFT represents the largest position by value.", kind: "fact" }],
            markdown: "# Concentration deserves attention\n\nMSFT is the largest supplied position.",
          },
        },
      },
      cells: { report: { id: "report", kind: "semantic-report" } },
    },
  };
  const portfolio = resolveSampleBlueprintSource("portfolio-tracker-new");
  const operation = portfolio.payload.services?.["portfolio-semantic-intelligence"]
    ?.operations.generateReport;
  const report = runDeclarativeValidators(
    operation?.response?.validators ?? [],
    reportBlueprint,
    {
      bindings: {
        request: {
          presentationMode: "simple-markdown",
          acceptedCapabilities: ["primitive:markdown"],
          authoringBrief: {
            blueprintProfile: {
              tiers: [
                { id: "report-semantic", kind: "semantic-report-model" },
                { id: "runtime-document", kind: "runtime-document" },
              ],
              behavior: "inert",
            },
          },
        },
      },
    },
  );
  assert.equal(report.ok, true, JSON.stringify(report.errors));

  const materialized = materializeBlueprint({ blueprint: reportBlueprint });
  assert.equal(materialized.payload.terminalBlueprint.payload.cells?.report.view?.capability, "primitive:markdown");
  assert.equal(materialized.payload.terminalBlueprint.payload.runtime.state?.report.markdown,
    "# Concentration deserves attention\n\nMSFT is the largest supplied position.");
});

test("portfolio rich semantic admission enforces its capability catalog", () => {
  const listView = (from: string) => ({
    capability: "fluent:list",
    bindings: { items: { from } },
  });
  const cell = (id: string) => ({ id, kind: "semantic-report" });
  const richBlueprint: BlueprintArtifact = {
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
          id: "rich-report",
          views: {
            "report-root": { capability: "primitive:container", props: { variant: "column", gap: "m" } },
            headline: { capability: "fluent:text", bindings: { value: { from: "report.headline" } }, props: { as: "h1", variant: "title", block: true } },
            summary: { capability: "fluent:text", bindings: { value: { from: "report.summary" } }, props: { block: true } },
            allocation: {
              capability: "primitive:chart",
              bindings: { points: { from: "report.allocation" } },
              props: {
                variant: "standard",
                spec: {
                  kind: "bar",
                  title: "Position market values",
                  description: "Market value by supplied position",
                  fields: { label: "ticker", value: "value" },
                },
              },
            },
            positions: {
              capability: "fluent:table",
              bindings: { rows: { from: "report.positions" } },
              props: {
                columns: [
                  { id: "ticker", label: "Ticker" },
                  { id: "quantity", label: "Quantity" },
                  { id: "price", label: "Price" },
                  { id: "value", label: "Value" },
                  { id: "gainLoss", label: "Gain/loss" },
                ],
              },
            },
            facts: listView("report.facts"),
            judgments: listView("report.judgments"),
            risks: listView("report.risks"),
            uncertainties: listView("report.uncertainties"),
          },
          presentation: {
            roots: ["report-root"],
            composition: {
              "report-root": {
                slots: {
                  overview: ["headline", "summary"],
                  composition: ["allocation", "positions"],
                  performance: ["facts"],
                  risks: ["risks", "uncertainties"],
                  interpretation: ["judgments"],
                },
              },
            },
          },
        }],
        fallback: "rich-report",
      }],
      runtime: {
        expression: "jsonata",
        namespaces: ["report"],
        actions: [],
        capabilities: {
          "primitive:container": { propsSchema: { type: "object", additionalProperties: true }, slots: ["children"] },
          "primitive:chart": { propsSchema: { type: "object", additionalProperties: true }, dataProp: "points" },
          "fluent:text": { propsSchema: { type: "object", additionalProperties: true }, dataProp: "value" },
          "fluent:list": { propsSchema: { type: "object", additionalProperties: true }, dataProp: "items" },
          "fluent:table": { propsSchema: { type: "object", additionalProperties: true }, dataProp: "rows" },
        },
        externals: {
          projectionViews: {
            primitive: { from: "primitive", use: ["container", "chart"] },
            fluent: { from: "fluent", use: ["text", "list", "table"] },
          },
        },
        state: {
          report: {
            headline: "Portfolio snapshot",
            summary: "Supplied portfolio facts only.",
            allocation: [{ ticker: "AAPL", value: 425.86 }],
            positions: [{ id: "AAPL", cells: { ticker: "AAPL", value: 425.86 } }],
            facts: [{ value: "market-value", label: "Market value is $1,499.29." }],
            judgments: [{ value: "concentration", label: "MSFT is the larger position." }],
            risks: [{ value: "two-position-risk", label: "The supplied portfolio has two positions." }],
            uncertainties: [{ value: "profile-missing", label: "No investor profile was supplied." }],
          },
        },
      },
      cells: {
        "report-root": cell("report-root"),
        headline: cell("headline"),
        summary: cell("summary"),
        allocation: cell("allocation"),
        positions: cell("positions"),
        facts: cell("facts"),
        judgments: cell("judgments"),
        risks: cell("risks"),
        uncertainties: cell("uncertainties"),
      },
    },
  };
  const portfolio = resolveSampleBlueprintSource("portfolio-tracker-new");
  const validators = portfolio.payload.services?.["portfolio-semantic-intelligence"]
    ?.operations.generateReport.response?.validators ?? [];

  const validatorOptions = {
    bindings: {
      request: {
        presentationMode: "rich-components",
        acceptedCapabilities: [
          "primitive:container",
          "primitive:chart",
          "fluent:text",
          "fluent:list",
          "fluent:table",
        ],
        authoringBrief: {
          blueprintProfile: {
            tiers: [
              { id: "report-semantic", kind: "semantic-report-model" },
              { id: "runtime-document", kind: "runtime-document" },
            ],
            presentation: {
              root: "portfolio-report",
              sectionSlots: ["overview", "composition", "performance", "risks", "interpretation"],
            },
            behavior: "inert",
          },
        },
      },
    },
  };
  assert.equal(runDeclarativeValidators(validators, richBlueprint, validatorOptions).ok, true);
  assert.equal(
    materializeBlueprint({ blueprint: richBlueprint }).payload.terminalBlueprint
      .payload.cells?.["report-root"].view?.capability,
    "primitive:container",
  );

  const semanticComposition = structuredClone(richBlueprint);
  semanticComposition.payload.recipes[0].representations[0].views.facts = {
    capability: "semantic:narrative",
    bindings: { sections: { from: "report.facts" } },
    props: {
      variant: "briefing",
      spec: { fields: { id: "id", heading: "heading", body: "body" } },
    },
  };
  semanticComposition.payload.runtime.capabilities["semantic:narrative"] = {
    propsSchema: { type: "object", additionalProperties: true },
    dataProp: "sections",
  };
  semanticComposition.payload.runtime.externals.projectionViews.semantic = {
    from: "semantic",
    use: ["narrative"],
  };
  semanticComposition.payload.runtime.state.report.facts = [{
    id: "market-value",
    heading: "Market value",
    body: "Market value is $1,499.29.",
  }];
  const semanticOptions = structuredClone(validatorOptions);
  semanticOptions.bindings.request.acceptedCapabilities.push("semantic:narrative");
  assert.equal(
    runDeclarativeValidators(validators, semanticComposition, semanticOptions).ok,
    true,
  );

  const forbidden = structuredClone(richBlueprint);
  forbidden.payload.runtime.capabilities["primitive:alert"] = {
    propsSchema: { type: "object", additionalProperties: true },
  };
  forbidden.payload.recipes[0].representations[0].views.headline.capability = "primitive:alert";
  const report = runDeclarativeValidators(validators, forbidden, validatorOptions);
  assert.equal(report.ok, false);
  assert.equal(
    report.errors.some((error) => error.code === "semantic-report-capability-catalog"),
    true,
  );

  const unauthorizedButKnown = structuredClone(richBlueprint);
  unauthorizedButKnown.payload.runtime.capabilities["primitive:markdown"] = {
    propsSchema: { type: "object", additionalProperties: true },
  };
  unauthorizedButKnown.payload.recipes[0].representations[0].views.headline.capability = "primitive:markdown";
  const authorizationReport = runDeclarativeValidators(validators, unauthorizedButKnown, validatorOptions);
  assert.equal(authorizationReport.ok, false);
  assert.equal(
    authorizationReport.errors.some((error) => error.code === "semantic-report-admission"),
    true,
  );

  const missingSection = structuredClone(richBlueprint);
  delete missingSection.payload.recipes[0].representations[0]
    .presentation.composition["report-root"].slots.interpretation;
  const sectionReport = runDeclarativeValidators(validators, missingSection, validatorOptions);
  assert.equal(sectionReport.ok, false);
  assert.equal(
    sectionReport.errors.some((error) => error.code === "semantic-report-admission"),
    true,
  );
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