import { describe, expect, it } from "vitest";
import { InMemoryStateModel, unwrap } from "@gik/kernel";
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
  defineExploration,
  formatBlueprintReference,
  HOSTED_BLUEPRINT_CAPABILITY,
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
} from "../src/index";

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

describe("@gik/blueprint", () => {
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

    expect(HOSTED_BLUEPRINT_CAPABILITY).toBe("gik:hosted-blueprint");
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
    const hostedTree = (content: string) => ({
      capability: HOSTED_BLUEPRINT_CAPABILITY,
      id: "child",
      props: { hostedBlueprint: { inline: child }, content },
      visible: true,
      children: [],
    });

    await reconciler.reconcile(hostedTree("first"));
    await reconciler.reconcile(hostedTree("first"));
    await reconciler.reconcile(hostedTree("second"));
    await reconciler.reconcile({ capability: "ui:empty", id: "root", props: {}, visible: true, children: [] });

    expect(mounted).toEqual(["parent:1/cells/child:first", "parent:1/cells/child:second"]);
    expect(unmounted).toEqual(["parent:1/cells/child", "parent:1/cells/child"]);
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
    expect(program.root.capability).toBe(HOSTED_BLUEPRINT_CAPABILITY);
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
    expect(program.root?.capability).toBe(HOSTED_BLUEPRINT_CAPABILITY);
  });

  it("preserves a Cell source predicate on its generated refresh invocation", () => {
    const source = createBlueprint({
      ...blueprint("conditional-source").payload,
      cells: {
        quotes: {
          id: "quotes",
          sources: [{
            id: "quotes.source",
            service: "market-data",
            operation: "refreshPrices",
            contract: "quotes/v1",
            when: "portfolio.marketMode = 'live'",
          }],
          view: { capability: "primitive:container" },
        },
      },
      projections: { presentation: { roots: ["quotes"] } },
    });

    const program = composeCellProgram(
      { cells: source.payload.cells ?? {}, projections: source.payload.projections },
      compileCellTopology(source.payload.id, source.payload.cells ?? {}),
    );

    expect(program.root?.edges?.on?.refresh).toEqual([{
      do: "invoke",
      args: { tool: "refreshPrices" },
      guard: "portfolio.marketMode = 'live'",
    }]);
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
          behavior: {
            events: {
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

    expect(result).toEqual({ state: { counter: { value: 2 } } });
    expect(shared.snapshot()).toEqual({ shared: { value: "updated" } });
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
          behavior: {
            events: {
              increment: [{ do: "assign", target: "counter.value", args: { value: 2 } }],
            },
          },
        },
      },
    });

    const materialized = materializeBlueprint({ blueprint: artifact });
    expect(unwrap(materialized.payload.program)).toEqual({
      handlers: [{ id: "counter", on: artifact.payload.cells?.counter.behavior?.events }],
    });

    const result = await runMaterializedTransition({
      materializedBlueprint: materialized,
      state: materialized.payload.initialState,
      events: [{ node: "counter", name: "increment" }],
    });
    expect(result.state).toEqual({ counter: { value: 2 } });
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

  it("retains source refresh handlers and rejects projection-hosted children in headless programs", () => {
    const artifact = createBlueprint({
      ...blueprint("headless-source").payload,
      cells: {
        source: {
          id: "source",
          sources: [{ id: "orders", service: "orders", contract: "orders/v1", operation: "orders.list" }],
        },
      },
    });
    expect(unwrap(materializeBlueprint({ blueprint: artifact }).payload.program)).toEqual({
      handlers: [{ id: "source", on: { refresh: [{ do: "invoke", args: { tool: "orders.list" } }] } }],
    });

    artifact.payload.cells!.source.blueprint = { inline: blueprint("child") };
    expect(() => materializeBlueprint({ blueprint: artifact })).toThrow(
      "Headless Blueprint 'headless-source' cannot host child Blueprint Cell 'source'",
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
          behavior: {
            events: {
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
    expect(result.state).toEqual({ counter: { value: 2 } });
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
          behavior: {
            events: {
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
    expect(materializedBlueprint.payload.initialState).toEqual({ local: {} });
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
          behavior: {
            events: {
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

    expect(result.state).toEqual({ counter: { value: 2 } });
    expect(result.effects).toEqual([]);
    expect(adapter.applySpecUpdates({ spec, updates: [] })).toEqual(spec);
  });
});