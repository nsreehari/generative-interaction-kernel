import { describe, expect, it } from "vitest";
import {
  cellSources,
  evaluateCell,
  evalSyncJsonata,
  runDeclarativeValidators,
  validateCell,
} from "../../packages/evaluators/src";
import { unwrap } from "../../kernel/src";
import {
  applyBlueprintPatches,
  createBlueprint,
  createBlueprintDurableBootstrapEvent,
  createBlueprintDurableEffectSettlementEvent,
  createBlueprintDurableTransitionAdapter,
  createBlueprintSenseSignalEvent,
  materializeBlueprint,
  runMaterializedTransition,
  type CellDefinition,
  type DppManifest,
} from "../src";
import { prepareQueuedCellSourceEffect, settleQueuedCellSourceEffect } from "../src/worker";

const manifest: DppManifest = {
  "manifest-version": "0.1",
  participant: { "stable-id": "portfolio-understanding", "human-readable-name": "Portfolio understanding" },
  "durable-charter": {
    "identity-and-viability": {
      "why-this-participant-exists": "Improve informed decisions consistent with the owner's objectives.",
      "what-must-remain-true-for-it-to-remain-this-participant": "Distinguish facts, estimates and assessments.",
    },
    "value-creation": {
      "beneficial-change-it-exists-to-create": "Better evidence-grounded portfolio understanding.",
      "who-benefits-from-that-change": ["Portfolio owner"],
    },
    participation: { relationships: [] },
    "authority-and-boundaries": {
      "what-it-may-adapt-within-this-charter": ["Research priorities"],
      "what-it-may-do-without-asking": ["Read authorized evidence"],
      "what-requires-human-decision": ["Trades"],
      "what-it-must-never-do": ["Invent evidence"],
    },
    steward: {
      responsibility: "Preserve evidence and uncertainty.",
      "permitted-services-and-tools": ["Authorized context store"],
      "evidence-and-decision-recording": "Retain references and as-of dates.",
    },
  },
  "evolving-working-model": {
    "currency-hypotheses": {},
    "viability-tensions": [],
    "current-strategy-and-priorities": {},
    "operating-rhythm": {},
    "learned-context-references": [],
  },
  "context-store": { query: "Earlier assessments and unresolved questions.", ingest: "Material evidence and assessments." },
};

function actor(): CellDefinition {
  return {
    id: "participant",
    inputs: [{ token: "snapshot" }],
    dpp: {
      manifest: structuredClone(manifest),
      context: {
        sources: [
          {
            id: "history", service: "context", operation: "query",
            when: "$not($exists(fetched_sources.history))",
            input: { kind: "jsonata", expr: "{'scope':'portfolio-1','requestKey':inputs.snapshot.id,'query':{'guidance':computed.guidance},'limit':5}" },
            output: { kind: "jsonata", expr: "response" },
          },
          {
            id: "remember", service: "context", operation: "ingest",
            when: "$exists(fetched_sources.history) and $not($exists(fetched_sources.remember))",
            input: { kind: "jsonata", expr: "{'scope':'portfolio-1','records':[{'id':inputs.snapshot.id,'kind':'assessment','observedAt':'2026-11-11T00:00:00Z','content':computed.contribution}]}" },
            output: { kind: "jsonata", expr: "response" },
          },
        ],
        senses: [],
      },
    },
    compute: [
      { id: "guidance", assign: "guidance", expression: "dpp.manifest.`context-store`.query" },
      { id: "contribution", assign: "contribution", expression: "{'value':inputs.snapshot.value,'history':fetched_sources.history.records}" },
    ],
    outputs: [{ token: "assessment", from: "computed.contribution", when: "$exists(fetched_sources.history)" }],
  };
}

function blueprint() {
  return createBlueprint({
    id: "purposeful-portfolio", kind: "test", version: "1",
    structureMode: "reconfigurable",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program", capabilities: [] }],
    projectionRecipes: [],
    runtime: { state: { snapshot: { id: "snapshot-1", value: 100 } } },
    services: {
      context: {
        kind: "context-store", version: "1", config: { storeRef: "test" },
        operations: {
          query: { operation: "query", contract: "context-store.query/v1", settlement: { transform: { kind: "jsonata", expr: "{'ops':[]}" } } },
          ingest: { operation: "ingest", contract: "context-store.ingest/v1", settlement: { transform: { kind: "jsonata", expr: "{'ops':[]}" } } },
        },
      },
    },
    cells: {
      participant: actor(),
      valuation: {
        id: "valuation", inputs: [{ token: "snapshot" }],
        compute: [{ id: "value", assign: "valuation", expression: "inputs.snapshot.value" }],
        outputs: [{ token: "portfolio-value", from: "computed.valuation" }],
      },
    },
  });
}

describe("DPP Cell participation", () => {
  it("requires a full manifest and bounded query/ingest contracts", () => {
    const report = (value: unknown) => runDeclarativeValidators([{ kind: "blueprint-cell", message: "Invalid Cell" }], value as never);
    expect(report(actor()).ok).toBe(true);
    expect(report({ id: "incomplete", dpp: { manifest: { purpose: "A sentence" }, context: { sources: [] } } }).ok).toBe(false);
    const candidate = blueprint();
    candidate.payload.services!.context.operations.ingest.contract = "unrelated/v1";
    expect(() => materializeBlueprint({ blueprint: candidate })).toThrow("context-store.ingest/v1");
  });

  it("rejects collisions across ordinary and context sources and Senses", () => {
    const candidate = actor();
    candidate.sources = [{ id: "history", service: "context", operation: "query" }];
    candidate.senses = [{ id: "remember", service: "context", operation: "watch", on: {} }];
    const errors = validateCell(candidate).errors;
    expect(errors.filter(({ code }) => code === "duplicate-service-use")).toHaveLength(2);
    const other = { ...actor(), id: "another-participant" };
    expect(validateCell(other).ok).toBe(true);
  });

  it("exposes the manifest and all settled results without the old source-data alias", () => {
    const candidate = actor();
    candidate.sources = [{ id: "prices", service: "market", operation: "quote" }];
    candidate.compute = [...candidate.compute!, { id: "price", assign: "price", expression: "fetched_sources.prices" }];
    const result = evaluateCell({
      materializedProgramCell: candidate,
      inputs: { snapshot: { id: "snapshot-1", value: 100 } },
      settledSources: { prices: 200, history: { records: [{ id: "earlier" }] } },
      systemContext: { cellId: candidate.id, blueprintRunState: { cells: {} } },
    });
    expect(result.computed.price).toBe(200);
    expect(result.computed.guidance).toBe(manifest["context-store"].query);
    expect(result.effects.find(({ source }) => source.id === "remember")?.sourceInputs).not.toHaveProperty("sources");
    candidate.compute = [{ id: "legacy", assign: "legacy", expression: "sources.history" }];
    expect(validateCell(candidate).errors.some(({ detail }) => detail.includes("Unknown evaluator expression root 'sources'"))).toBe(true);
    expect(cellSources(candidate).map(({ id }) => id)).toEqual(["prices", "history", "remember"]);
  });

  it("settles context operations through the existing graph and becomes idle", async () => {
    const materializedBlueprint = materializeBlueprint({ blueprint: blueprint() });
    const first = await runMaterializedTransition({ materializedBlueprint, state: materializedBlueprint.payload.initialState, events: [] });
    expect(first.effects?.map((effect) => effect.kind === "invoke" && effect.control.sourceId)).toEqual(["history"]);
    const request = await prepareQueuedCellSourceEffect(first.effects![0]);
    expect(request.data).toMatchObject({ scope: "portfolio-1", query: { guidance: manifest["context-store"].query } });
    const history = await settleQueuedCellSourceEffect(first.effects![0], { sourceOutput: { records: [{ id: "earlier" }] } }, first.state);
    const second = await runMaterializedTransition({
      materializedBlueprint, state: first.state, events: [],
      sourceSettlements: [{ effect: first.effects![0], result: history! }],
    });
    expect(second.state.assessment).toEqual({ value: 100, history: [{ id: "earlier" }] });
    expect(second.effects?.map((effect) => effect.kind === "invoke" && effect.control.sourceId)).toEqual(["remember"]);
    const remembered = await settleQueuedCellSourceEffect(second.effects![0], { sourceOutput: { status: "stored", recordIds: ["snapshot-1"] } }, second.state);
    const third = await runMaterializedTransition({
      materializedBlueprint, state: second.state, events: [],
      sourceSettlements: [{ effect: second.effects![0], result: remembered! }],
    });
    expect(third.effects).toBeUndefined();
  });

  it.each(["immediate", "queued"])("correlates %s source results with the immutable launch context", async (mode) => {
    const authored = blueprint();
    authored.payload.cells!.participant.dpp!.context.sources[0].output = {
      kind: "jsonata",
      expr: "{'requestKey':inputs.snapshot.id,'guidance':computed.guidance,'participant':dpp.manifest.participant.`stable-id`,'records':response.records}",
    };
    const materializedBlueprint = materializeBlueprint({ blueprint: authored });
    const first = await runMaterializedTransition({
      materializedBlueprint, state: materializedBlueprint.payload.initialState, events: [],
    });
    const effect = first.effects![0];
    const changedState = { ...first.state, snapshot: { id: "snapshot-2", value: 250 } };
    const response = { sourceOutput: { records: [{ id: "evidence" }] } };
    const settlement = mode === "queued"
      ? await settleQueuedCellSourceEffect(effect, response, changedState)
      : response;
    const second = await runMaterializedTransition({
      materializedBlueprint, state: changedState, events: [],
      sourceSettlements: [{ effect, result: settlement! }],
    });
    expect(second.state.blueprintRunState).toMatchObject({
      cells: { participant: { sourceValues: { history: {
        requestKey: "snapshot-1",
        guidance: manifest["context-store"].query,
        participant: manifest.participant["stable-id"],
        records: [{ id: "evidence" }],
      } } } },
    });
  });

  it("withdraws the actor without blocking valuation or admitting its late settlement", async () => {
    const authored = blueprint();
    const materializedBlueprint = materializeBlueprint({ blueprint: authored });
    const first = await runMaterializedTransition({ materializedBlueprint, state: materializedBlueprint.payload.initialState, events: [] });
    const withdrawn = applyBlueprintPatches({
      blueprint: authored, state: first.state, origin: "authorized",
      patch: [{ op: "removeCell", cellId: "participant" }],
    });
    const result = await runMaterializedTransition({
      materializedBlueprint: withdrawn.materializedBlueprint,
      state: { ...withdrawn.state, snapshot: { id: "snapshot-2", value: 250 } },
      events: [], sourceSettlements: [{ effect: first.effects![0], result: { ops: [{ op: "set", path: "assessment", value: "late" }] } }],
    });
    expect(result.state["portfolio-value"]).toBe(250);
    expect(result.state.assessment).toBeUndefined();
    expect(result.effects).toBeUndefined();
    const reintroduced = applyBlueprintPatches({
      blueprint: withdrawn.blueprint, state: result.state, origin: "authorized",
      patch: [{ op: "addCell", cell: actor() }],
    });
    const resumed = await runMaterializedTransition({
      materializedBlueprint: reintroduced.materializedBlueprint, state: reintroduced.state, events: [],
    });
    expect(resumed.effects).toHaveLength(1);
    expect((await prepareQueuedCellSourceEffect(resumed.effects![0])).data.scope).toBe("portfolio-1");
  });

  it("uses the same context settlement and tracking in durable execution", async () => {
    const adapter = createBlueprintDurableTransitionAdapter({ blueprint: blueprint() });
    const spec = adapter.initialSpec();
    const first = await adapter.transition({ spec, state: adapter.initialState(), events: [createBlueprintDurableBootstrapEvent()] });
    const effect = first.effects[0];
    expect(effect.kind === "invoke" && effect.control.sourceId).toBe("history");
    const settlement = await settleQueuedCellSourceEffect(effect, { sourceOutput: { records: [] } }, first.state);
    const second = await adapter.transition({
      spec, state: first.state,
      events: [createBlueprintDurableEffectSettlementEvent("query-result", settlement!, effect)],
    });
    expect(second.effects.map((next) => next.kind === "invoke" && next.control.sourceId)).toEqual(["remember"]);
  });

  it("lowers context implementations without changing their identity, contracts or manifest", () => {
    const authored = blueprint();
    const sources = structuredClone(authored.payload.cells!.participant.dpp!.context.sources);
    sources[0].input = { kind: "jsonata", expr: "{'scope':'portfolio-1','requestKey':'lowered','query':{},'limit':1}" };
    authored.payload.serviceTiers = [{ id: "purpose", kind: "purpose" }, { id: "runtime", kind: "runtime-program" }];
    authored.payload.serviceRecipes = [{
      id: "purpose-to-runtime", from: "purpose", to: "runtime", fallback: "selected",
      implementationPrograms: [{ id: "selected", cells: { participant: { dpp: { context: { sources } } } } }],
    }];
    const terminal = materializeBlueprint({ blueprint: authored }).payload.terminalBlueprint;
    expect(terminal.payload.cells!.participant.dpp!.manifest).toEqual(manifest);
    expect(terminal.payload.cells!.participant.dpp!.context.sources[0].input).toEqual(sources[0].input);
    const withdrawn = applyBlueprintPatches({
      blueprint: authored, state: {}, origin: "authorized",
      patch: [{ op: "removeCell", cellId: "participant" }],
    });
    expect(withdrawn.materializedBlueprint.payload.terminalBlueprint.payload.cells).not.toHaveProperty("participant");
    sources[0].id = "changed";
    expect(() => materializeBlueprint({ blueprint: authored })).toThrow("changes source contracts");
  });

  it("scopes fetched data and manifests in views without rewriting literal text", () => {
    const authored = blueprint();
    authored.payload.presentation = { slots: ["report"], root: "report", allowedCapabilities: ["test:report"] };
    const participant = authored.payload.cells!.participant;
    participant.dpp!.manifest["context-store"].query = "Keep $& and systemInputs.numSourcesRunning as text.";
    participant.systemInputs = ["numSourcesRunning"];
    participant.potentialViews = {
      primary: {
        capability: "test:report", region: "report",
        bindings: { value: { expression: "{'guidance':$lookup(dpp,'manifest').`context-store`.query,'records':$lookup(fetched_sources,'history').records,'literal':'fetched_sources.history'}" } },
      },
    };
    const materialized = materializeBlueprint({ blueprint: authored });
    const root = unwrap(materialized.payload.program).root!;
    const children = root.edges?.children;
    const view = Array.isArray(children) ? children[0] : undefined;
    const expression = view?.edges?.readExpr?.value;
    expect(typeof expression).toBe("string");
    const value = evalSyncJsonata(expression!, {
      blueprintRunState: { cells: { participant: { sourceValues: { history: { records: [{ id: "evidence" }] } } } } },
    });
    expect(value).toEqual({
      guidance: participant.dpp!.manifest["context-store"].query,
      records: [{ id: "evidence" }],
      literal: "fetched_sources.history",
    });
  });

  it("reconciles context Senses through ordinary bindings and retires them on withdrawal", async () => {
    const authored = blueprint();
    authored.payload.runtime.state!.notifications = 0;
    authored.payload.services!.context.operations.watch = {
      operation: "watch", contract: "context-store.watch/v1",
      sense: { kind: "resource", signals: { changed: { payloadSchema: { type: "object" } } } },
      settlement: { transform: { kind: "jsonata", expr: "{'ops':[]}" } },
    };
    const participant = authored.payload.cells!.participant;
    participant.dpp!.context.senses = [{
      id: "context-change", service: "context", operation: "watch", on: { changed: "context-changed" },
    }];
    participant.events = { "context-changed": { payloadSchema: { type: "object" } } };
    participant.behavior = { on: {
      "context-changed": [{ do: "assign", target: "notifications", args: { from: "notifications + 1" } }],
    } };
    const adapter = createBlueprintDurableTransitionAdapter({ blueprint: authored, instanceId: "portfolio-instance" });
    let spec = adapter.initialSpec();
    const first = await adapter.transition({ spec, state: adapter.initialState(), events: [createBlueprintDurableBootstrapEvent()] });
    spec = adapter.applySpecUpdates({ spec, updates: first.specUpdates ?? [] });
    const binding = Object.values(spec.senses!.bindings)[0];
    expect(binding.sense.id).toBe("context-change");
    const signal = createBlueprintSenseSignalEvent(binding, { id: "change-1", name: "changed", payload: {} });
    const second = await adapter.transition({ spec, state: first.state, events: [signal] });
    expect(second.state.notifications).toBe(1);
    spec = adapter.applySpecUpdates({ spec, updates: [{ patch: [{ op: "removeCell", cellId: "participant" }], origin: "authorized" }] });
    expect(spec.senses!.bindings).toEqual({});
    const late = await adapter.transition({ spec, state: second.state, events: [signal] });
    expect(late.state.notifications).toBe(1);
    expect(late.effects).toEqual([]);
  });

  it("reintroduces a durable actor without accepting a previous incarnation's result", async () => {
    const adapter = createBlueprintDurableTransitionAdapter({ blueprint: blueprint() });
    let spec = adapter.initialSpec();
    const first = await adapter.transition({ spec, state: adapter.initialState(), events: [createBlueprintDurableBootstrapEvent()] });
    const previousEffect = first.effects[0];
    spec = adapter.applySpecUpdates({
      spec,
      updates: [
        { patch: [{ op: "removeCell", cellId: "participant" }], origin: "authorized" },
        { patch: [{ op: "addCell", cell: actor() }], origin: "authorized" },
      ],
    });
    const lateSettlement = await settleQueuedCellSourceEffect(previousEffect, {
      sourceOutput: { records: [{ id: "old-incarnation" }] },
    }, first.state);
    const resumed = await adapter.transition({
      spec, state: first.state,
      events: [createBlueprintDurableEffectSettlementEvent("old-query", lateSettlement!, previousEffect)],
    });
    expect(resumed.state.assessment).toBeUndefined();
    expect(resumed.effects.map((effect) => effect.kind === "invoke" && effect.control.sourceId)).toEqual(["history"]);
    expect(resumed.effects[0].kind === "invoke" && previousEffect.kind === "invoke"
      && resumed.effects[0].control.sourceRequestToken).not.toBe(previousEffect.kind === "invoke" && previousEffect.control.sourceRequestToken);
  });
});
