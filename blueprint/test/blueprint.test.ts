import { describe, expect, it, vi } from "vitest";
import { InMemoryStateModel, unwrap, type Json, type ResolvedNode } from "@gik/kernel";
import {
  analyzeCellImpact,
  analyzeExploration,
  admitAdaptiveProgramPatch,
  admitBlueprintPatch,
  applyBlueprintPatch,
  applyBlueprintPatches,
  assembleBlueprint,
  compileCellTopology,
  composeCellProgram,
  createBlueprintDurableTransitionAdapter,
  createBlueprint,
  defineLoweringCell,
  defineCell,
  defineExploration,
  evaluateBlueprintCell,
  evaluateBlueprintCellId,
  formatBlueprintReference,
  BLUEPRINT_CAPABILITY,
  PRESENTATION_FRAGMENT_CAPABILITY,
  HostedBlueprintReconciler,
  inspectExploration,
  lowerBlueprint,
  materializeBlueprint,
  parseBlueprintJson,
  parseBlueprintReference,
  readHostedBlueprintDeclaration,
  resolveHostedBlueprint,
  runMaterializedTransition,
  runTransition,
  stringifyBlueprint,
  tokenPattern,
  validateBlueprintArtifact,
  validateBlueprintForAuthoring,
  type BlueprintArtifact,
  type HostedBlueprintMount,
} from "../src/index";
import { settleQueuedCellSourceEffect } from "../src/worker";

const runtime = {
  version: "test/1",
  capabilities: {},
};

function blueprint(id = "test"): BlueprintArtifact {
  return createBlueprint({
    id,
    kind: "test",
    version: "1",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime,
  });
}

function runState(cells: Record<string, string[]>) {
  return {
    blueprintRunState: {
      cells: Object.fromEntries(Object.entries(cells).map(([id, sources]) => [id, {
        sources: sources.map((sourceId) => ({
          id: sourceId,
          lastRequestedToken: null,
          lastCompletedToken: null,
          lastCompletionStatus: null,
          queueRequestedToken: null,
        })),
      }])),
    },
  };
}

describe("@gik/blueprint", () => {
  it("materializes and purely evaluates candidate Cell JSON for preflight", () => {
    const artifact = createBlueprint({
      id: "cell-preflight",
      kind: "test",
      version: "1",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: {
        ...runtime,
        externals: { services: { market: { version: "1", operations: ["quote"] } } },
      },
      cells: {
        quote: {
          id: "quote",
          inputs: [{ token: "position", as: "position" }],
          compute: [{ id: "symbol", expression: "inputs.position.symbol", assign: "symbol" }],
          outputs: [{ token: "result", from: "computed.symbol" }],
        },
      },
    });
    const candidate = {
      id: "quote",
      inputs: [{ token: "position", as: "position" }],
      sources: [{
        id: "market.quote",
        service: "market",
        operation: "quote",
        contract: "quote/v1",
        when: "true",
        input: { kind: "jsonata" as const, expr: "{'symbol':inputs.position.symbol}" },
        output: { kind: "jsonata" as const, expr: "response.price" },
      }],
      compute: [
        { id: "symbol", expression: "inputs.position.symbol", assign: "symbol" },
        { id: "total", expression: "sources.`market.quote` * inputs.position.quantity", assign: "total" },
      ],
      outputs: [{ token: "result", from: "computed.total" }],
    };
    const state = {
      position: { symbol: "MSFT", quantity: 2 },
      blueprintRunState: {
        cells: {
          quote: { sourceValues: { "market.quote": 421.5 } },
        },
      },
    } satisfies Record<string, Json>;
    const originalState = structuredClone(state);

    const result = evaluateBlueprintCell({ blueprint: artifact, state, cell: candidate });

    expect(result).toMatchObject({
      status: "evaluated",
      missingInputs: [],
      computed: { symbol: "MSFT", total: 843 },
      outputs: { result: 843 },
      effects: [{ kind: "source", cellId: "quote", source: { id: "market.quote" } }],
      materializedProgramCell: { id: "quote", compute: candidate.compute },
    });
    expect(state).toEqual(originalState);
    expect(artifact.payload.cells?.quote.compute).toHaveLength(1);
  });

  it("reports a blocked Cell preflight without computing or admitting effects", () => {
    const artifact = createBlueprint({
      id: "blocked-cell-preflight",
      kind: "test",
      version: "1",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime,
      cells: {
        summary: {
          id: "summary",
          inputs: [{ token: "document" }],
          compute: [{ id: "title", expression: "inputs.document.title", assign: "title" }],
          outputs: [{ token: "summary", from: "computed.title" }],
        },
      },
    });
    const cell = artifact.payload.cells!.summary;

    expect(evaluateBlueprintCell({ blueprint: artifact, state: {}, cell })).toMatchObject({
      status: "blocked",
      missingInputs: ["document"],
      computed: {},
      outputs: {},
      effects: [],
    });
    expect(evaluateBlueprintCellId({ blueprint: artifact, state: {}, cellId: "summary" }))
      .toEqual(evaluateBlueprintCell({ blueprint: artifact, state: {}, cell }));
    expect(() => evaluateBlueprintCellId({ blueprint: artifact, state: {}, cellId: "missing" }))
      .toThrow("Blueprint 'blocked-cell-preflight' has no Cell 'missing'");
  });

  it("evaluates Cells through runTransition and recomputes from narrowed source values", async () => {
    const artifact = createBlueprint({
      id: "cell-evaluator",
      kind: "test",
      version: "1",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: {
        ...runtime,
        externals: { services: { market: { version: "1", operations: ["quote"] } } },
      },
      cells: {
        quote: {
          id: "quote",
          inputs: [{ token: "position", as: "position" }],
          sources: [{
            id: "market.quote",
            service: "market",
            operation: "quote",
            contract: "quote/v1",
            when: "$not($exists(sources.`market.quote`))",
            input: { kind: "jsonata", expr: "{'symbol': inputs.position.symbol}" },
            output: { kind: "jsonata", expr: "response.meta.price" },
          }],
          compute: [
            { id: "symbol", expression: "inputs.position.symbol", assign: "symbol" },
            { id: "price", expression: "sources.`market.quote`", assign: "price" },
          ],
          outputs: [
            { token: "selected-symbol", from: "computed.symbol" },
            { token: "market-price", from: "computed.price" },
          ],
        },
      },
    });
    const materialized = materializeBlueprint({ blueprint: artifact });
    const first = await runMaterializedTransition({
      state: { position: { symbol: "MSFT" } },
      materializedBlueprint: materialized,
      events: [],
    });

    expect(first.state["selected-symbol"]).toBe("MSFT");
    expect(first.effects).toHaveLength(1);
    expect(first.effects?.[0]).toMatchObject({
      kind: "invoke",
      control: {
        sourceId: "market.quote",
        sourceCellId: "quote",
        sourceInputTransform: { expr: "{'symbol': inputs.position.symbol}" },
        sourceOutputTransform: { expr: "response.meta.price" },
      },
      data: {},
    });

    const effect = first.effects![0];
    const settlement = await settleQueuedCellSourceEffect(effect, {
      sourceOutput: { meta: { price: 421.5, currency: "USD" }, history: [419, 420, 421.5] },
    }, first.state);
    const second = await runMaterializedTransition({
      state: first.state,
      materializedBlueprint: materialized,
      events: [],
      sourceSettlements: [{ effect, result: settlement! }],
    });

    expect(second.state["market-price"]).toBe(421.5);
    expect(second.effects).toBeUndefined();
    expect(JSON.stringify(second.state)).not.toContain("history");
  });

  it("creates, serializes, and parses a Blueprint artifact", () => {
    const artifact = blueprint();
    expect(parseBlueprintJson(stringifyBlueprint(artifact))).toEqual(artifact);
  });

  it.each(["fixed", "reconfigurable", "adaptive"] as const)(
    "round-trips the %s Blueprint structure mode",
    (structureMode) => {
      const artifact = createBlueprint({ ...blueprint().payload, structureMode });
      expect(parseBlueprintJson(stringifyBlueprint(artifact)).payload.structureMode).toBe(structureMode);
    },
  );

  it("enforces fixed and authorized reconfigurable structure modes", () => {
    const fixed = createBlueprint({ ...blueprint().payload, structureMode: "fixed" });
    const reconfigurable = createBlueprint({ ...blueprint().payload, structureMode: "reconfigurable" });
    const patch = [{ op: "addCell" as const, cell: { id: "added" } }];

    expect(admitBlueprintPatch(fixed, { origin: "authorized", patch })).toEqual({
      accepted: false,
      reason: "fixed-structure",
    });
    expect(admitBlueprintPatch(reconfigurable, { origin: "runtime", patch })).toEqual({
      accepted: false,
      reason: "authorization-required",
    });
    expect(admitBlueprintPatch(reconfigurable, { origin: "authorized", patch }).accepted).toBe(true);
    expect(applyBlueprintPatch(reconfigurable, patch).payload.cells?.added.id).toBe("added");
  });

  it("admits adaptive Blueprint and program patches only through authored policy", () => {
    const adaptive = createBlueprint({
      ...blueprint().payload,
      structureMode: "adaptive",
      structurePolicy: {
        allowedBlueprintOperations: ["addCell"],
        allowedProgramOperations: ["setRoot"],
      },
    });
    const add = [{ op: "addCell" as const, cell: { id: "added" } }];
    const remove = [{ op: "removeCell" as const, cellId: "added" }];

    expect(admitBlueprintPatch(adaptive, { origin: "runtime", patch: add }).accepted).toBe(true);
    expect(admitBlueprintPatch(adaptive, { origin: "runtime", patch: remove })).toEqual({
      accepted: false,
      reason: "policy-rejected",
    });
    expect(admitAdaptiveProgramPatch(adaptive, [{ op: "setRoot", root: { capability: "surface", id: "next" } }])).not.toBe(false);
    expect(admitAdaptiveProgramPatch(adaptive, [{ op: "removeRoot" }])).toBe(false);
  });

  it("parks nested child Blueprint mutations while preserving assembled children", () => {
    const parent = createBlueprint({ ...blueprint("parent").payload, structureMode: "reconfigurable" });
    expect(() => applyBlueprintPatch(parent, [{
      op: "addCell",
      cell: { id: "child", blueprint: { inline: blueprint("child") } },
    }])).toThrow("Nested child Blueprint mutations are not supported");
  });

  it("assembles referenced child Blueprints without mutating the source", () => {
    const child = blueprint("child");
    const parent = createBlueprint({
      ...blueprint("parent").payload,
      cells: {
        child: { id: "child", blueprint: { $ref: "./child.blueprint.json" } },
      },
    });

    const assembled = assembleBlueprint(parent, (ref, context) => {
      expect(ref).toBe("./child.blueprint.json");
      expect(context).toEqual({ parentBlueprintId: "parent", cellId: "child" });
      return child;
    });

    expect(assembled.payload.cells?.child.blueprint).toEqual({ inline: child });
    expect(parent.payload.cells?.child.blueprint).toEqual({ $ref: "./child.blueprint.json" });
  });

  it("exposes hosted Blueprint composition as a renderer-neutral contract", async () => {
    const child = blueprint("child");
    const context = { parentBlueprintId: "parent", parentInstanceId: "parent:1", cellId: "child" };
    const registry = {
      resolveArtifact: () => child,
      resolve: (reference: ReturnType<typeof parseBlueprintReference>, received: typeof context) => {
        expect(received).toEqual(context);
        return { reference, blueprint: child };
      },
    };

    expect(BLUEPRINT_CAPABILITY).toBe("gik:blueprint");
    const declaration = readHostedBlueprintDeclaration({ $ref: "blueprint:child@1" });
    expect(declaration).toEqual({ $ref: "blueprint:child@1" });
    if (!declaration) throw new Error("Expected a hosted Blueprint declaration");
    await expect(resolveHostedBlueprint(declaration, registry, context)).resolves.toEqual({
      reference: { scheme: "blueprint", id: "child", version: "1" },
      blueprint: child,
    });
  });

  it("reconciles hosted Blueprint mount, input remount, and removal", async () => {
    const child = blueprint("child");
    const mounted: string[] = [];
    const unmounted: string[] = [];
    const reconciler = new HostedBlueprintReconciler("parent", "parent:1", undefined, {
      mount(hosted) {
        mounted.push(`${hosted.instanceId}:${String(hosted.inputs.content)}`);
        return hosted.instanceId;
      },
      unmount(instance) {
        unmounted.push(instance);
      },
    });
    const hostedTree = (content: string): ResolvedNode => ({
      capability: BLUEPRINT_CAPABILITY,
      id: "child",
      props: { hostedBlueprint: { inline: child as unknown as Json }, content },
      visible: true,
      fallback: false,
      children: [],
    });

    await reconciler.reconcile(hostedTree("first"));
    await reconciler.reconcile(hostedTree("first"));
    await reconciler.reconcile(hostedTree("second"));
    await reconciler.reconcile({
      capability: "ui:empty",
      id: "root",
      props: {},
      visible: true,
      fallback: false,
      children: [],
    });

    expect(mounted).toEqual(["parent:1/cells/child:first", "parent:1/cells/child:second"]);
    expect(unmounted).toEqual(["parent:1/cells/child", "parent:1/cells/child"]);
  });

  it("skips an empty hosted Blueprint declaration until one is available", async () => {
    const child = blueprint("child");
    const mounted: string[] = [];
    const reconciler = new HostedBlueprintReconciler("parent", "parent:1", undefined, {
      mount(hosted) {
        mounted.push(hosted.definition.blueprint.payload.id);
        return hosted.instanceId;
      },
      unmount() {},
    });
    const node = (blueprintValue: Json): ResolvedNode => ({
      capability: BLUEPRINT_CAPABILITY,
      id: "child",
      props: { blueprint: blueprintValue },
      visible: true,
      fallback: false,
      children: [],
    });

    await reconciler.reconcile(node(null));
    expect(mounted).toEqual([]);

    await reconciler.reconcile(node(child as unknown as Json));
    expect(mounted).toEqual(["child"]);
  });

  it("strips the public blueprint prop from mounted child inputs", async () => {
    const child = blueprint("child");
    const mounted: HostedBlueprintMount[] = [];
    const reconciler = new HostedBlueprintReconciler("parent", "parent:1", undefined, {
      mount(hosted) {
        mounted.push(hosted);
        return hosted.instanceId;
      },
      unmount() {},
    });

    await reconciler.reconcile({
      capability: BLUEPRINT_CAPABILITY,
      id: "child",
      props: { blueprint: child as unknown as Json, content: "first" },
      visible: true,
      fallback: false,
      children: [],
    });

    expect(mounted).toHaveLength(1);
    expect(mounted[0]?.inputs).toEqual({ content: "first" });
    expect(mounted[0]?.inputs).not.toHaveProperty("blueprint");
    expect(mounted[0]?.inputs).not.toHaveProperty("hostedBlueprint");
  });

  it("separates hosted external context and instance identity from child inputs", async () => {
    const child = blueprint("child");
    const mounted: HostedBlueprintMount[] = [];
    const reconciler = new HostedBlueprintReconciler("parent", "parent:1", undefined, {
      mount(hosted) {
        mounted.push(hosted);
        return hosted.instanceId;
      },
      unmount() {},
    });

    await reconciler.reconcile({
      capability: BLUEPRINT_CAPABILITY,
      id: "child",
      props: {
        blueprint: child as unknown as Json,
        externalContext: { view: "mobile" },
        instanceKey: "mobile-preview",
        content: "first",
      },
      visible: true,
      fallback: false,
      children: [],
    });

    expect(mounted[0]?.externalContext).toEqual({ view: "mobile" });
    expect(mounted[0]?.inputs).toEqual({ content: "first" });
    expect(mounted[0]?.instanceId).toBe(
      "parent:1/cells/child/instances/mobile-preview",
    );
  });

  it("requires parent cells to bind required child Blueprint inputs", () => {
    const child = createBlueprint({
      ...blueprint("child").payload,
      interface: { inputs: { report: { required: true, schema: { type: "string" } } } },
    });
    const parent = createBlueprint({
      ...blueprint("parent").payload,
      cells: {
        child: {
          id: "child",
          view: { capability: "host:hosted-blueprint" },
          blueprint: { $ref: "blueprint:child" },
        },
      },
    });

    expect(() => assembleBlueprint(parent, () => child)).toThrow("missing required child input(s): report");
    parent.payload.cells!.child.view!.bindings = { report: { from: "source.report" } };
    expect(assembleBlueprint(parent, () => child).payload.cells?.child.blueprint).toHaveProperty("inline");
  });

  it("preserves a child Blueprint declaration in its lowered presentation node", () => {
    const parent = createBlueprint({
      ...blueprint("parent").payload,
      cells: {
        child: {
          id: "child",
          view: { props: { mode: "compact" } },
          blueprint: { $ref: "blueprint:analysis@1.0.0" },
        },
      },
      projections: { presentation: { roots: ["child"] } },
    });

    const program = composeCellProgram(
      { cells: parent.payload.cells ?? {}, projections: parent.payload.projections },
      compileCellTopology("parent", parent.payload.cells ?? {}),
    );
    expect(program.root).toBeDefined();
    if (!program.root) throw new Error("Expected a projected program");
    expect(program.root.props).toEqual({
      mode: "compact",
      hostedBlueprint: { $ref: "blueprint:analysis@1.0.0" },
    });
    expect(program.root.capability).toBe(BLUEPRINT_CAPABILITY);
  });

  it("preserves authored order when lowering multiple presentation roots", () => {
    const artifact = createBlueprint({
      ...blueprint("multi-root").payload,
      cells: {
        analysis: { id: "analysis", view: { capability: "sample:analysis" } },
        drawer: { id: "drawer", view: { capability: "primitive:drawer" } },
      },
      projections: { presentation: { roots: ["analysis", "drawer"] } },
    });

    const program = composeCellProgram(
      { cells: artifact.payload.cells ?? {}, projections: artifact.payload.projections },
      compileCellTopology("multi-root", artifact.payload.cells ?? {}),
    );

    expect(program.root).toMatchObject({
      capability: PRESENTATION_FRAGMENT_CAPABILITY,
      edges: {
        children: [
          { id: "analysis", capability: "sample:analysis" },
          { id: "drawer", capability: "primitive:drawer" },
        ],
      },
    });
  });

  it.each([
    [{ from: "runtime.analysisBlueprint" }, "{'$ref':runtime.analysisBlueprint}"],
    [{ expression: "externalContext.analysisBlueprint" }, "{'$ref':(externalContext.analysisBlueprint)}"],
  ] as const)("lowers a bound child Blueprint reference", (binding, expectedExpression) => {
    const parent = createBlueprint({
      ...blueprint("parent").payload,
      cells: {
        child: {
          id: "child",
          inputs: [{ token: "analysis-blueprint", as: "analysisBlueprint", required: true }],
          view: { bindings: { report: { from: "runtime.report" } } },
          blueprint: { $ref: binding },
        },
      },
      projections: { presentation: { roots: ["child"] } },
    });

    const assembled = assembleBlueprint(parent);
    expect(assembled.payload.cells?.child.blueprint).toEqual({ $ref: binding });
    const program = composeCellProgram(
      { cells: assembled.payload.cells ?? {}, projections: assembled.payload.projections },
      compileCellTopology("parent", assembled.payload.cells ?? {}),
    );

    expect(program.root?.props).toBeUndefined();
    expect(program.root?.edges?.readExpr?.hostedBlueprint).toBe(expectedExpression);
    expect(program.root?.edges?.read?.report).toBe("runtime.report");
    expect(program.root?.capability).toBe(BLUEPRINT_CAPABILITY);
  });

  it("binds an inline artifact through the public gik:blueprint capability", () => {
    const parent = createBlueprint({
      ...blueprint("parent").payload,
      cells: {
        report: {
          id: "report",
          view: {
            capability: "gik:blueprint",
            bindings: { blueprint: { from: "runtime.reportBlueprint" } },
          },
        },
      },
      projections: { presentation: { roots: ["report"] } },
    });

    const program = composeCellProgram(
      { cells: parent.payload.cells ?? {}, projections: parent.payload.projections },
      compileCellTopology("parent", parent.payload.cells ?? {}),
    );

    expect(program.root?.capability).toBe("gik:blueprint");
    expect(program.root?.edges?.read?.blueprint).toBe("runtime.reportBlueprint");
  });

  it("resolves a direct inline artifact without consulting the host registry", async () => {
    const child = blueprint("generated-report");
    const registry = {
      resolveArtifact: vi.fn(),
      resolve: vi.fn(() => { throw new Error("inline artifact must not use the catalog"); }),
    };

    const resolved = await resolveHostedBlueprint({ inline: child }, registry, {
      parentBlueprintId: "parent",
      parentInstanceId: "parent-instance",
      cellId: "report",
    });

    expect(resolved.blueprint).toBe(child);
    expect(resolved.reference).toMatchObject({ id: "generated-report" });
    expect(registry.resolve).not.toHaveBeenCalled();
  });

  it("lowers Cell sources into evaluator nodes and scopes run-state expressions", () => {
    const source = createBlueprint({
      ...blueprint("conditional-source").payload,
      cells: {
        quotes: {
          id: "quotes",
          inputs: [{ token: "market-mode", as: "marketMode" }],
          systemInputs: ["numSourcesRunning"],
          sources: [{
            id: "quotes.source",
            service: "market-data",
            operation: "refreshPrices",
            contract: "quotes/v1",
            when: "inputs.marketMode = 'live'",
          }],
          events: { analyze: { payloadSchema: { type: "object" } } },
          behavior: {
            on: {
              analyze: [{
                do: "invoke",
                control: { tool: "refreshPrices" },
                guard: "systemInputs.numSourcesRunning = 0",
              }],
            },
          },
          view: {
            capability: "primitive:container",
            visibility: "systemInputs.numSourcesRunning != 0",
          },
        },
      },
      projections: { presentation: { roots: ["quotes"] } },
    });

    const program = composeCellProgram(
      { cells: source.payload.cells ?? {}, projections: source.payload.projections },
      compileCellTopology(source.payload.id, source.payload.cells ?? {}),
    );

    expect(program.graph?.nodes[0]).toMatchObject({
      id: "quotes-evaluate",
      operation: {
        kind: "extension",
        name: "evaluate-cell",
        config: { sources: [{ id: "quotes.source", when: "inputs.marketMode = 'live'" }] },
      },
    });
    expect(program.root?.edges?.on?.analyze).toEqual([{
      do: "invoke",
      control: {
        tool: "refreshPrices",
        sourceId: "quotes.source",
        sourceCellId: "quotes",
      },
      guard: "($count(($lookup(blueprintRunState.cells, \"quotes\").sources)[lastRequestedToken != null and lastRequestedToken != lastCompletedToken])) = 0",
    }]);
    expect(program.root?.edges?.gate).toBe(
      "($count(($lookup(blueprintRunState.cells, \"quotes\").sources)[lastRequestedToken != null and lastRequestedToken != lastCompletedToken])) != 0",
    );
  });

  it("lowers input-driven Cell sources with JSONata acceptance gates", () => {
    const cells = {
      selection: {
        id: "selection",
        inputs: [{ token: "shell.selectedReport", as: "report" }],
        compute: [{ id: "report", expression: "inputs.report", assign: "report" }],
        outputs: [{ token: "selected_report", from: "report" }],
      },
      analyzer: {
        id: "analyzer",
        inputs: [{ token: "selected_report", as: "report", required: true }],
        sources: [{
          id: "analysis.source",
          service: "analysis",
          operation: "analyze",
          contract: "analysis/v1",
          when: "inputs.report.enabled",
        }],
      },
    };

    const program = composeCellProgram({ cells }, compileCellTopology("shell", cells));

    expect(program.graph?.inputs).toEqual([
      "shell.selectedReport",
      "blueprintRunState.cells.analyzer.sourceValues",
    ]);
    expect(program.graph?.nodes[1]).toMatchObject({
      id: "analyzer-evaluate",
      inputs: { report: "selected_report" },
      operation: {
        kind: "extension",
        name: "evaluate-cell",
        config: { sources: [{ id: "analysis.source", when: "inputs.report.enabled" }] },
      },
    });
  });

  it("lowers hosted Blueprint outputs to event-fed graph ports", () => {
    const cells = {
      analyzer: {
        id: "analyzer",
        blueprint: { $ref: "blueprint:incident-analyzer@1.0.0" },
        outputs: [{ token: "analysis_report", from: "analysis_report" }],
      },
      cache: {
        id: "cache",
        inputs: [{ token: "analysis_report", required: true }],
      },
    };

    const program = composeCellProgram({
      cells,
      projections: { presentation: { roots: ["analyzer"] } },
    }, compileCellTopology("shell", cells));

    expect(program.graph?.nodes).toEqual([
      {
        id: "analyzer-hosted-output",
        trigger: { event: "gik-hosted-blueprint-output", node: "analyzer" },
        outputs: { analysis_report: "analysis_report" },
        operation: { kind: "compute", expression: '$lookup(event, "analysis_report")' },
      },
    ]);
    expect(program.graph?.ports).toEqual({ analysis_report: { mode: "signal" } });
  });

  it("parses and formats canonical hosted Blueprint references", () => {
    expect(parseBlueprintReference("blueprint:incident-report-explorer-2@1.0.0")).toEqual({
      scheme: "blueprint",
      id: "incident-report-explorer-2",
      version: "1.0.0",
    });
    expect(parseBlueprintReference("blueprint:local/deeper-incident-report-explorer")).toEqual({
      scheme: "blueprint",
      id: "local/deeper-incident-report-explorer",
    });
    expect(formatBlueprintReference({ scheme: "blueprint", id: "analysis", version: "2-preview.1" }))
      .toBe("blueprint:analysis@2-preview.1");
  });

  it.each([
    "./child.blueprint.json",
    "blueprint:",
    "blueprint:/child",
    "blueprint:child/",
    "blueprint:child@",
    "blueprint:child@1/2",
  ])("rejects invalid hosted Blueprint reference '%s'", (reference) => {
    expect(() => parseBlueprintReference(reference)).toThrow("Invalid Blueprint reference");
  });

  it("rejects invalid tier and lowering recipe references", () => {
    const artifact = {
      ...blueprint(),
      payload: {
        ...blueprint().payload,
        recipes: [{
          id: "missing",
          from: "domain",
          to: "runtime",
          patch: [{ op: "removeCell", cellId: "missing" }],
          metadata: { executor: "test" },
        }],
      },
    };
    expect(() => validateBlueprintArtifact(artifact)).toThrow("unknown tier 'domain'");
  });

  it("uses tier terminology for Lowering Cells", () => {
    expect(defineLoweringCell({
      id: "domain-to-runtime",
      kind: "transform",
      fromTier: "domain",
      toTier: "runtime",
    })).toMatchObject({ fromTier: "domain", toTier: "runtime" });
  });

  it("validates standalone Cells through the evaluator contract", () => {
    expect(defineCell({
      id: "summary",
      compute: [{ id: "value", expression: "1", assign: "value" }],
      outputs: [{ token: "summary", from: "computed.value" }],
    })).toMatchObject({ id: "summary" });
    expect(() => defineCell({
      id: "summary",
      outputs: [{ token: "summary", from: "missing" }],
    })).toThrow("references a value not produced by compute");
  });

  it("retains Cell token composition behavior", () => {
    expect(tokenPattern("holding:$TICKER").match("holding:AAPL")).toEqual({ TICKER: "AAPL" });
    expect(compileCellTopology("prices", {
      holdings: { id: "holdings", outputs: [{ token: "holding" }] },
      prices: { id: "prices", inputs: [{ token: "holding" }] },
    }).edges).toEqual([{
      token: "holding",
      providerCellId: "holdings",
      consumerCellId: "prices",
    }]);
  });

  it("connects every Cell that currently provides a token", () => {
    const topology = compileCellTopology("incident-analysis", {
      "cache-retriever": {
        id: "cache-retriever",
        outputs: [{ token: "cached_analysis_envelope" }],
      },
      "cache-writer": {
        id: "cache-writer",
        outputs: [{ token: "cached_analysis_envelope" }],
      },
      presentation: {
        id: "presentation",
        inputs: [{ token: "cached_analysis_envelope" }],
      },
    });

    expect(topology.diagnostics).toEqual([]);
    expect(topology.providers.cached_analysis_envelope).toEqual(["cache-retriever", "cache-writer"]);
    expect(topology.edges).toEqual([
      {
        token: "cached_analysis_envelope",
        providerCellId: "cache-retriever",
        consumerCellId: "presentation",
      },
      {
        token: "cached_analysis_envelope",
        providerCellId: "cache-writer",
        consumerCellId: "presentation",
      },
    ]);
  });

  it("analyzes downstream Cell impact without mutating topology", () => {
    const topology = compileCellTopology("portfolio", {
      portfolio: { id: "portfolio", outputs: [{ token: "portfolio" }] },
      gains: { id: "gains", inputs: [{ token: "portfolio" }], outputs: [{ token: "gains" }] },
      prices: { id: "prices", inputs: [{ token: "portfolio" }], outputs: [{ token: "prices" }] },
      recommendation: {
        id: "recommendation",
        inputs: [{ token: "gains" }, { token: "prices" }],
      },
    });

    expect(analyzeCellImpact(topology, { changedCells: ["portfolio"] })).toEqual({
      changedCells: ["portfolio"],
      affectedCells: ["gains", "prices", "recommendation"],
      stages: [["gains", "prices"], ["recommendation"]],
      blockers: [],
    });
    expect(topology.cells).toHaveLength(4);
  });

  it("reports Cell impact blockers and rejects unknown Cells", () => {
    const topology = compileCellTopology("portfolio", {
      portfolio: { id: "portfolio", outputs: [{ token: "portfolio" }] },
      gains: { id: "gains", inputs: [{ token: "portfolio" }], outputs: [{ token: "gains" }] },
      prices: { id: "prices", inputs: [{ token: "portfolio" }], outputs: [{ token: "prices" }] },
      recommendation: {
        id: "recommendation",
        inputs: [{ token: "gains" }, { token: "prices" }],
      },
    });

    expect(analyzeCellImpact(topology, { changedCells: ["gains"] }).blockers).toEqual([
      { cellId: "recommendation", waitingOn: ["prices"] },
    ]);
    expect(() => analyzeCellImpact(topology, { changedCells: ["missing"] })).toThrow("Unknown Cell 'missing'");
  });

  it("analyzes an exploration snapshot without owning Blueprint state", () => {
    const exploration = defineExploration({
      id: "education",
      nodes: {
        tenthComplete: { id: "tenthComplete", unlocks: ["chooseStream"] },
        engineering: { id: "engineering" },
        medicine: { id: "medicine" },
      },
      choices: {
        chooseStream: {
          id: "chooseStream",
          label: "Choose stream",
          requires: ["tenthComplete"],
          options: [
            { id: "mpc", label: "MPC", unlocks: ["engineering"] },
            { id: "bpc", label: "BPC", unlocks: ["medicine"] },
          ],
        },
      },
    });

    expect(analyzeExploration(exploration, {
      completed: ["tenthComplete"],
      selections: { chooseStream: "mpc" },
    })).toMatchObject({
      unlocked: ["chooseStream", "engineering", "tenthComplete"],
      availableChoices: [{ id: "chooseStream" }],
    });
    expect(inspectExploration(exploration).edges).toContainEqual({
      from: "chooseStream",
      to: "engineering",
      kind: "option",
      optionId: "mpc",
    });
  });

  it("rejects invalid exploration definitions and state", () => {
    expect(() => defineExploration({
      id: "invalid",
      nodes: { start: { id: "start", unlocks: ["missing"] } },
      choices: {},
    })).toThrow("unknown participant 'missing'");

    const exploration = defineExploration({
      id: "choice",
      nodes: { start: { id: "start" }, result: { id: "result" } },
      choices: {
        choose: {
          id: "choose",
          label: "Choose",
          requires: ["start"],
          options: [{ id: "one", label: "One", unlocks: ["result"] }],
        },
      },
    });
    expect(() => analyzeExploration(exploration, {
      completed: [],
      selections: { choose: "one" },
    })).toThrow("choice 'choose' is not available");
  });

  it("lowers a headless Blueprint through Kernel validation", () => {
    const message = lowerBlueprint(blueprint(), () => ({
      graph: {
        inputs: ["request"],
        outputs: ["response"],
        nodes: [{
          id: "respond",
          inputs: { request: "request" },
          outputs: { response: "response" },
          operation: { kind: "compute", expression: "$inputs.request" },
        }],
      },
    }));

    expect(message.type).toBe("program");
    expect(message.payload.graph?.nodes[0].id).toBe("respond");
  });

  it("lowers a projected Blueprint through the same Kernel path", () => {
    const message = lowerBlueprint(blueprint(), () => ({
      root: { id: "root", capability: "screen" },
    }));

    expect(message.payload.root).toEqual({ id: "root", capability: "screen" });
  });

  it("runs events through the canonical Blueprint transition engine", async () => {
    const artifact = createBlueprint({
      id: "counter",
      kind: "runtime-blueprint",
      version: "1",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: { namespaces: ["counter"], contexts: ["shared"], capabilities: {} },
      cells: {
        root: {
          id: "root",
          view: { capability: "screen" },
          events: { increment: { payloadSchema: { type: "object" } } },
          behavior: {
            on: {
              increment: [
                { do: "assign", target: "counter.value", args: { value: 2 } },
                { do: "assign", target: "shared.value", args: { value: "updated" } },
              ],
            },
          },
        },
      },
      projections: { presentation: { roots: ["root"] } },
    });
    const shared = new InMemoryStateModel(["shared"]);
    shared.apply([{ op: "set", path: "shared.value", value: "initial" }]);

    const result = await runTransition({
      blueprint: artifact,
      state: { counter: { value: 1 } },
      events: [{ node: "root", name: "increment" }],
      contexts: { shared },
    });

    expect(result.state).toEqual({ counter: { value: 2 }, ...runState({ root: [] }) });
    expect(result.completedWithinRun).toEqual([
      { kind: "assign", node: "root", target: "counter.value", value: 2 },
      { kind: "assign", node: "root", target: "shared.value", value: "updated" },
    ]);
    expect(shared.snapshot()).toEqual({ shared: { value: "updated" } });
  });

  it("publishes state-backed outputs from a Cell with no declared inputs", async () => {
    const initialHoldings = { AAPL: { ticker: "AAPL", quantity: 2 } };
    const updatedHoldings = { GOOG: { ticker: "GOOG", quantity: 3 } };
    const artifact = createBlueprint({
      id: "state-backed-output",
      kind: "runtime-blueprint",
      version: "1",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: {
        namespaces: ["portfolio"],
        capabilities: {},
        state: { portfolio: { holdings: initialHoldings } },
      },
      cells: {
        holdings: {
          id: "holdings",
          outputs: [{ token: "holdings", from: "portfolio.holdings" }],
          events: { save: { payloadSchema: { type: "object" } } },
          behavior: {
            on: {
              save: [{ do: "assign", target: "portfolio.holdings", args: { from: "$event.rows" } }],
            },
          },
        },
      },
    });
    const materialized = materializeBlueprint({ blueprint: artifact });

    const initial = await runMaterializedTransition({
      materializedBlueprint: materialized,
      state: materialized.payload.initialState,
      events: [],
    });
    expect(initial.state.holdings).toEqual(initialHoldings);

    const updated = await runMaterializedTransition({
      materializedBlueprint: materialized,
      state: initial.state,
      events: [{ node: "holdings", name: "save", payload: { rows: updatedHoldings } }],
    });
    expect(updated.state.holdings).toEqual(updatedHoldings);
    expect(artifact.payload.cells?.holdings.inputs).toBeUndefined();
  });

  it("materializes and executes a Blueprint without a presentation projection", async () => {
    const artifact = createBlueprint({
      id: "headless-counter",
      kind: "runtime-blueprint",
      version: "1",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: { namespaces: ["counter"], capabilities: {}, state: { counter: { value: 1 } } },
      cells: {
        counter: {
          id: "counter",
          events: { increment: { payloadSchema: { type: "object" } } },
          behavior: {
            on: {
              increment: [{ do: "assign", target: "counter.value", args: { value: 2 } }],
            },
          },
        },
      },
    });

    const materialized = materializeBlueprint({ blueprint: artifact });
    expect(unwrap(materialized.payload.program)).toEqual({
      handlers: [{ id: "counter", on: artifact.payload.cells?.counter.behavior?.on }],
    });

    const result = await runMaterializedTransition({
      materializedBlueprint: materialized,
      state: materialized.payload.initialState,
      events: [{ node: "counter", name: "increment" }],
    });
    expect(result.state).toEqual({ counter: { value: 2 }, ...runState({ counter: [] }) });
    expect(result.completedWithinRun).toEqual([
      { kind: "assign", node: "counter", target: "counter.value", value: 2 },
    ]);
  });

  it("returns a reusable non-mutating authoring validation report", () => {
    const artifact = blueprint("authoring-report");
    expect(validateBlueprintForAuthoring(artifact)).toMatchObject({
      valid: true,
      artifact,
      errors: [],
      execution: {
        sourceTier: "runtime",
        terminalTier: "runtime",
        stages: [],
        status: "runtime-ready",
      },
    });
    expect(validateBlueprintForAuthoring("not json")).toMatchObject({
      valid: false,
      artifact: null,
      execution: { status: "invalid" },
    });
  });

  it("lowers headless sources through Cell evaluation and rejects projection-hosted children", () => {
    const artifact = createBlueprint({
      ...blueprint("headless-source").payload,
      cells: {
        source: {
          id: "source",
          sources: [{ id: "orders", service: "orders", contract: "orders/v1", operation: "orders.list" }],
        },
      },
    });
    expect(unwrap(materializeBlueprint({ blueprint: artifact }).payload.program).graph?.nodes[0]).toMatchObject({
      id: "source-evaluate",
      operation: { kind: "extension", name: "evaluate-cell" },
    });

    artifact.payload.cells!.source.blueprint = { inline: blueprint("child") };
    expect(() => materializeBlueprint({ blueprint: artifact })).toThrow(
      "Blueprint 'headless-source' without a presentation projection cannot host child Blueprint Cell 'source'",
    );
  });

  it("materializes deterministically into a portable value and runs the trusted fast path", async () => {
    const artifact = createBlueprint({
      id: "materialized-counter",
      kind: "runtime-blueprint",
      version: "1",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: { namespaces: ["counter"], capabilities: {}, state: { counter: { value: 1 } } },
      cells: {
        root: {
          id: "root",
          view: { capability: "screen" },
          events: { increment: { payloadSchema: { type: "object" } } },
          behavior: {
            on: {
              increment: [{ do: "assign", target: "counter.value", args: { from: "externalContext.policy.nextValue" } }],
            },
          },
        },
      },
      projections: { presentation: { roots: ["root"] } },
    });
    const externalContext = { policy: { nextValue: 2 } };
    const first = materializeBlueprint({ blueprint: artifact, externalContext });
    const second = materializeBlueprint({ blueprint: artifact, externalContext });

    expect(JSON.parse(JSON.stringify(first))).toEqual(second);
    externalContext.policy.nextValue = 99;
    const result = await runMaterializedTransition({
      materializedBlueprint: first,
      state: first.payload.initialState,
      events: [{ node: "root", name: "increment" }],
    });
    expect(result.state).toEqual({ counter: { value: 2 }, ...runState({ root: [] }) });
  });


  it("keeps externalContext read-only and outside returned mutable state", async () => {
    const artifact = createBlueprint({
      id: "context-write",
      kind: "runtime-blueprint",
      version: "1",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: { namespaces: ["local"], capabilities: {}, state: { local: {} } },
      cells: {
        root: {
          id: "root",
          view: { capability: "screen" },
          events: { mutate: { payloadSchema: { type: "object" } } },
          behavior: {
            on: {
              mutate: [{ do: "assign", target: "externalContext.policy.allowed", args: { value: false } }],
            },
          },
        },
      },
      projections: { presentation: { roots: ["root"] } },
    });
    const materializedBlueprint = materializeBlueprint({
      blueprint: artifact,
      externalContext: { policy: { allowed: true } },
    });

    await expect(runMaterializedTransition({
      materializedBlueprint,
      state: materializedBlueprint.payload.initialState,
      events: [{ node: "root", name: "mutate" }],
    })).rejects.toThrow("externalContext is read-only");
    expect(materializedBlueprint.payload.initialState).toEqual({ local: {}, ...runState({ root: [] }) });
  });

  it("applies semantic patches to the authored Blueprint and rematerializes", () => {
    const artifact = createBlueprint({
      id: "reconfigurable",
      kind: "runtime-blueprint",
      version: "1",
      structureMode: "reconfigurable",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: { capabilities: {}, state: {} },
      cells: { root: { id: "root", view: { capability: "screen" } } },
      projections: { presentation: { roots: ["root"] } },
    });
    const applied = applyBlueprintPatches({
      blueprint: artifact,
      externalContext: { tenant: "one" },
      state: {},
      origin: "authorized",
      patch: [{ op: "addCell", cell: { id: "added" } }],
    });

    expect(artifact.payload.cells?.added).toBeUndefined();
    expect(applied.blueprint.payload.cells?.added?.id).toBe("added");
    expect(applied.materializedBlueprint.payload.terminalBlueprint).toEqual(applied.blueprint);
    expect(applied.materializedBlueprint.payload.externalContext).toEqual({ tenant: "one" });
  });

  it("provides a portable adapter spec for stateless durable transition hosts", async () => {
    const artifact = createBlueprint({
      id: "durable-counter",
      kind: "runtime-blueprint",
      version: "1",
      tiers: [{ id: "runtime", kind: "runtime-program" }],
      recipes: [],
      runtime: { namespaces: ["counter"], capabilities: {}, state: { counter: { value: 1 } } },
      cells: {
        root: {
          id: "root",
          view: { capability: "screen" },
          events: { increment: { payloadSchema: { type: "object" } } },
          behavior: {
            on: {
              increment: [{ do: "assign", target: "counter.value", args: { from: "externalContext.nextValue" } }],
            },
          },
        },
      },
      projections: { presentation: { roots: ["root"] } },
    });
    const adapter = createBlueprintDurableTransitionAdapter({
      blueprint: artifact,
      externalContext: { nextValue: 2 },
    });
    const spec = JSON.parse(JSON.stringify(adapter.initialSpec()));
    const result = await adapter.transition({
      spec,
      state: adapter.initialState(),
      events: [{ node: "root", name: "increment" }],
    });

    expect(result.state).toEqual({ counter: { value: 2 }, ...runState({ root: [] }) });
    expect(result.effects).toEqual([]);
    expect(adapter.applySpecUpdates({ spec, updates: [] })).toEqual(spec);
  });
});