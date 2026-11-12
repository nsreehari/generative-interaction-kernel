import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, test, vi } from "vitest";
import { createBlueprint, materializeBlueprint, runMaterializedTransition } from "gik-blueprint";
import { createMemoryStorage } from "gik-durable-runtime/storage/memory";
import type { Json, ResolvedNode } from "gik-kernel";
import {
  definePresentationEffect, PresentationHost, PresentationHostProvider, type PresentationEffectContext,
} from "../src/presentation-host";
import { BlueprintController } from "../src/blueprint-controller";
import { BlueprintHost, BlueprintProvider } from "../src/primitives/blueprint-host";
import {
  BlueprintHost as DurableBlueprintHost,
  BlueprintProvider as DurableBlueprintProvider,
} from "../src/primitives/durable-blueprint-host";
import { BlueprintRegion } from "../src/primitives/blueprint-regions";
import { bundleFromJson } from "../src/primitives/bundle";
import { renderNode, type EmitFn } from "../src/render";
import { createRegistry, type ProjectionView } from "../src/registry";

const Report: ProjectionView = ({ node, emit, children, hostState }) => {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <article data-report={node.id} data-host-state={hostState}>
      <button data-expand={node.id} onClick={() => setExpanded(!expanded)}>{expanded ? "Collapse" : "Expand"}</button>
      {["ledger", "receipts"].map((fileId) => (
        <span key={fileId} data-finding={`${node.id}:${fileId}`}
          onMouseEnter={() => emit("previewRequested", { fileId })}
          onMouseLeave={() => emit("previewEnded", { fileId })}>
          Finding for {fileId}
        </span>
      ))}
      {children}
    </article>
  );
};
const FileList: ProjectionView = ({ node, emit, hostState }) => (
  <ul data-files={node.id} data-host-state={hostState}>
    {["ledger", "receipts"].map((fileId) => (
      <li key={fileId} data-file={`${node.id}:${fileId}`} data-highlighted={node.props.highlightedFileId === fileId}>
        <button onClick={() => emit("selectFile", { fileId })}>{fileId}</button>
      </li>
    ))}
  </ul>
);
const native = { projectionViews: { report: Report, files: FileList } };
const reportId = "report--primary--in-report";
const filesId = "files--primary--in-files";
const mounted: TestRenderer.ReactTestRenderer[] = [];

afterEach(async () => {
  await act(async () => { for (const renderer of mounted.splice(0)) renderer.unmount(); });
});

async function mount(element: React.ReactElement): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(element); });
  mounted.push(renderer);
  return renderer;
}

async function waitForReport(renderer: TestRenderer.ReactTestRenderer, count = 1): Promise<void> {
  await vi.waitFor(async () => {
    await act(async () => { assert.equal(renderer.root.findAllByProps({ "data-report": reportId }).length, count); });
  });
}

function artifact() {
  return createBlueprint({
    id: "presentation-coordination",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program", capabilities: [] }],
    projectionRecipes: [],
    runtime: {
      externals: { projectionViews: { ui: { from: "self", use: ["report", "files"] } } },
      state: { semantic: { selectedFileId: null, previewed: false } },
    },
    cells: {
      report: {
        id: "report",
        potentialViews: { primary: { capability: "ui:report", region: ["report", "report-copy"] } },
        events: { previewRequested: { payloadSchema: { type: "object" } } },
        behavior: { on: { previewRequested: [{ do: "assign", target: "semantic.previewed", args: { value: true } }] } },
      },
      files: {
        id: "files",
        events: {
          selectFile: {
            payloadSchema: { type: "object", required: ["fileId"], properties: { fileId: { type: "string" } } },
          },
        },
        behavior: { on: {
          selectFile: [{ do: "assign", target: "semantic.selectedFileId", args: { from: "$event.fileId" } }],
        } },
        potentialViews: { primary: {
          capability: "ui:files", region: "files", bindings: { selectedFileId: { from: "semantic.selectedFileId" } },
        } },
      },
    },
    presentation: {
      slots: ["workspace", ...["report", "report-copy", "files"].map((id) => ({ id, region: "workspace" }))],
      root: "workspace",
      allowedCapabilities: ["ui:report", "ui:files"],
      exportedRegions: [{ name: "primary", slot: "workspace", required: true }],
    },
  });
}

function host() {
  return new PresentationHost({
    attention: ["related-file"],
    bindings: {
      "ui:report": { on: {
        previewRequested: { attention: { channel: "related-file", set: { from: "fileId" } } },
        previewEnded: { attention: { channel: "related-file", clear: true } },
      } },
      "ui:files": { props: { highlightedFileId: { attention: "related-file" } } },
    },
  });
}

function runtime() {
  const ref = `b64:${Buffer.from(JSON.stringify({ kind: "memory", value: crypto.randomUUID() })).toString("base64url")}`;
  return {
    runtimeId: crypto.randomUUID(),
    providers: { memory: createMemoryStorage() },
    refs: { stateRef: ref, journalRef: ref, effectsQueueRef: ref },
  };
}

function node(capability = "ui:report", id = reportId): ResolvedNode {
  return { id, capability, props: {}, children: [], fallback: false, visible: true };
}

test.each(["memory", "remote"] as const)("%s report hover coordinates a different file component without semantic execution", async (placement) => {
  const presentation = host();
  const remoteRuntime = runtime();
  const provider = remoteRuntime.providers.memory;
  const append = vi.spyOn(provider, "appendJournal");
  const onTransition = vi.fn();
  const renderer = await mount(placement === "memory"
    ? <BlueprintHost blueprint={artifact()} native={native} presentationHost={presentation} onTransition={onTransition} />
    : <DurableBlueprintHost blueprint={artifact()} native={native} runtime={remoteRuntime} presentationHost={presentation} />);
  await waitForReport(renderer);
  const request = { ...remoteRuntime.refs, runtimeId: remoteRuntime.runtimeId };
  const before = placement === "remote" ? await provider.readSnapshot(request) : undefined;
  const entries = append.mock.calls.length;
  const transitions = onTransition.mock.calls.length;
  const highlighted = () => renderer.root.findAll((instance) => instance.props["data-highlighted"] === true)
    .map((instance) => instance.props["data-file"]);
  for (const fileId of ["ledger", "receipts"]) {
    await act(async () => { await renderer.root.findByProps({ "data-finding": `${reportId}:${fileId}` }).props.onMouseEnter(); });
    assert.deepEqual(highlighted(), [`${filesId}:${fileId}`]);
    await act(async () => { await renderer.root.findByProps({ "data-finding": `${reportId}:${fileId}` }).props.onMouseLeave(); });
    assert.deepEqual(highlighted(), []);
  }
  await act(async () => {
    presentation.setAttention("related-file", "host-owner", "ledger");
  });
  assert.deepEqual(highlighted(), [`${filesId}:ledger`]);
  assert.equal(onTransition.mock.calls.length, transitions);
  assert.equal(append.mock.calls.length, entries);
  if (placement === "remote") {
    assert.deepEqual(await provider.readSnapshot(request), before);
    assert.equal(await provider.leaseQueueItem?.({ effectsQueueRef: remoteRuntime.refs.effectsQueueRef }), null);
  }
});

test("capability bindings work across slots and nested wrappers without inheriting Cell handlers", async () => {
  const blueprint = artifact();
  blueprint.payload.cells!.files.potentialViews!.primary.wrap = [
    { capability: "ui:report" }, { capability: "ui:report" },
  ];
  const materialized = materializeBlueprint({ blueprint });
  const presentation = host();
  const renderer = await mount(<BlueprintHost blueprint={blueprint} native={native} presentationHost={presentation} />);
  await waitForReport(renderer);
  for (const id of ["report--primary--in-report-copy", `${filesId}--wrap-0`, `${filesId}--wrap-1`]) {
    await act(async () => { await renderer.root.findByProps({ "data-finding": `${id}:ledger` }).props.onMouseEnter(); });
    assert.equal(renderer.root.findByProps({ "data-file": `${filesId}:ledger` }).props["data-highlighted"], true);
    if (id.includes("--wrap-")) assert.equal(materialized.payload.eventNodeOwners[id], undefined);
  }
});

test("attention channels are source-owned, clear on unmount, and never require highlight effect registrations", async () => {
  const presentation = host();
  const emit = vi.fn<EmitFn>();
  const registry = createRegistry({ "ui:report": Report, "ui:files": FileList }, () => null);
  const tree = (first: boolean, second: boolean, capability = "ui:report") => <PresentationHostProvider host={presentation}>
    {first && renderNode(node(capability), registry, emit)}
    {second && renderNode(node("ui:report", "report-copy"), registry, emit)}
    {renderNode(node("ui:files", filesId), registry, emit)}
  </PresentationHostProvider>;
  const renderer = await mount(tree(true, true));
  await act(async () => { await presentation.emit(emit, node(), "previewRequested", { fileId: "ledger" }); });
  await act(async () => {
    await presentation.emit(emit, node("ui:report", "report-copy"), "previewRequested", { fileId: "receipts" });
    await presentation.emit(emit, node(), "previewEnded");
  });
  assert.equal(presentation.getState().attention["related-file"], "receipts");
  await act(async () => { renderer.update(tree(false, true)); });
  assert.equal(presentation.getState().attention["related-file"], "receipts");
  await act(async () => { renderer.update(tree(false, false)); });
  assert.equal(presentation.getState().attention["related-file"], null);
  assert.equal(renderer.root.findByProps({ "data-file": `${filesId}:receipts` }).props["data-highlighted"], false);
  await act(async () => { renderer.update(tree(true, false)); });
  await act(async () => { await presentation.emit(emit, node(), "previewRequested", { fileId: "ledger" }); });
  await act(async () => { renderer.update(tree(true, false, "ui:files")); });
  assert.equal(presentation.getState().attention["related-file"], null);
  assert.throws(() => presentation.setAttention("undeclared", "host", "ledger"), /not declared/);
  await assert.rejects(presentation.emit(emit, node(), "previewRequested", {}), /Missing attention input/);
  assert.equal(emit.mock.calls.length, 0);
});

test("host providers declare effects; admission, parsing, and authorization precede execution", async () => {
  const presentation = new PresentationHost({
    effects: { files: ["open"] },
    bindings: { "ui:files": { on: {
      openRequested: { effect: "files:open" },
      removeRequested: { effect: "files:remove" },
    } } },
  });
  const dispatch = vi.fn<EmitFn>();
  await assert.rejects(presentation.emit(dispatch, node("ui:files"), "openRequested"), /not registered/);
  const handle = vi.fn();
  const authorize = vi.fn((context: { actorId?: string }) => context.actorId === "owner");
  const parseInput = vi.fn((data: Readonly<Record<string, Json>>) => {
    if (typeof data.fileId !== "string") throw new Error("Expected fileId");
    return { fileId: data.fileId.trim() };
  });
  const provider = { id: "files", effects: {
    open: definePresentationEffect({ parseInput, authorize, handle }),
    remove: definePresentationEffect({ parseInput, authorize, handle }),
  } };
  assert.throws(() => new PresentationHost().registerProvider(provider), /not admitted/);
  assert.throws(() => new PresentationHost({ effects: { files: ["unknown"] } }).registerProvider(provider), /not declared/);
  const unregister = presentation.registerProvider(provider);
  assert.throws(() => presentation.registerProvider(provider), /already registered/);
  await assert.rejects(presentation.emit(dispatch, node("ui:files"), "removeRequested", { fileId: "ledger" }, "owner"), /not admitted/);
  assert.equal(parseInput.mock.calls.length, 0);
  await assert.rejects(presentation.emit(dispatch, node("ui:files"), "openRequested", { fileId: 7 }, "owner"), /Expected fileId/);
  assert.equal(authorize.mock.calls.length, 0);
  await assert.rejects(presentation.emit(dispatch, node("ui:files"), "openRequested", { fileId: "ledger" }, "guest"), /not authorized/);
  assert.equal(handle.mock.calls.length, 0);
  await presentation.emit(dispatch, node("ui:files"), "openRequested", { fileId: "ledger" }, "owner");
  assert.deepEqual(handle.mock.calls, [[{
    node: { id: reportId, capability: "ui:files" }, event: "openRequested", actorId: "owner",
  }, { fileId: "ledger" }]]);
  assert.deepEqual(presentation.getState(), { attention: {} });
  assert.equal(dispatch.mock.calls.length, 0);
  provider.id = "changed-after-registration";
  unregister();
  await assert.rejects(presentation.emit(dispatch, node("ui:files"), "openRequested"), /not registered/);
  presentation.registerProvider({ id: "files", effects: {
    open: definePresentationEffect({
      parseInput, authorize: () => true, handle: () => { throw new Error("Host unavailable"); },
    }),
  } });
  unregister();
  await assert.rejects(presentation.emit(dispatch, node("ui:files"), "openRequested", { fileId: "ledger" }), /Host unavailable/);
});

test.each(["removed", "replaced"] as const)("a provider %s during authorization cannot start its retired handler", async (registration) => {
  const presentation = new PresentationHost({
    effects: { files: ["open"] },
    bindings: { "ui:files": { on: { openRequested: { effect: "files:open" } } } },
  });
  let finishAuthorization!: (allowed: boolean) => void;
  const authorization = new Promise<boolean>((resolve) => { finishAuthorization = resolve; });
  const handle = vi.fn();
  const provider = { id: "files", effects: {
    open: definePresentationEffect({
      parseInput: (data) => data, authorize: () => authorization, handle,
    }),
  } };
  const unregister = presentation.registerProvider(provider);
  const dispatch = vi.fn<EmitFn>();
  const pending = presentation.emit(dispatch, node("ui:files"), "openRequested", { fileId: "ledger" });
  const rejected = assert.rejects(pending, /no longer registered/);
  unregister();
  if (registration === "replaced") presentation.registerProvider(provider);
  finishAuthorization(true);
  await rejected;
  assert.equal(handle.mock.calls.length, 0);
  if (registration === "replaced") {
    unregister();
    await presentation.emit(dispatch, node("ui:files"), "openRequested", { fileId: "receipts" });
    assert.equal(handle.mock.calls.length, 1);
  }
  assert.equal(dispatch.mock.calls.length, 0);
});

test("local effects reject non-JSON data and semantic results instead of silently crossing execution boundaries", async () => {
  const presentation = new PresentationHost({
    effects: { files: ["open"] },
    bindings: { "ui:files": { on: { openRequested: { effect: "files:open" } } } },
  });
  const handler = vi.fn<() => void>(() => ({ events: [{ node: filesId, name: "selectFile" }] }));
  presentation.registerProvider({ id: "files", effects: {
    open: definePresentationEffect({ parseInput: (data) => data, authorize: () => true, handle: handler }),
  } });
  const dispatch = vi.fn<EmitFn>();
  await assert.rejects(presentation.emit(dispatch, node("ui:files"), "openRequested", { fileId: () => {} }), /only JSON/);
  assert.equal(handler.mock.calls.length, 0);
  await assert.rejects(presentation.emit(dispatch, node("ui:files"), "openRequested", { fileId: "ledger" }), /must not return semantic results/);
  assert.deepEqual(presentation.getState(), { attention: {} });
  assert.equal(dispatch.mock.calls.length, 0);
});

test("provider declarations preserve parsed input types and method receivers", async () => {
  const opened: string[] = [];
  class FileOperation {
    private readonly actor = "owner";
    parseInput(data: Readonly<Record<string, Json>>) {
      if (typeof data.fileId !== "string") throw new Error("Expected fileId");
      return { fileId: data.fileId.trim() };
    }
    authorize(context: PresentationEffectContext) { return context.actorId === this.actor; }
    handle(_context: PresentationEffectContext, input: { fileId: string }) { opened.push(input.fileId); }
  }
  const operation = definePresentationEffect(new FileOperation());
  const presentation = new PresentationHost({
    effects: { files: ["open"] },
    bindings: { "ui:files": { on: { openRequested: { effect: "files:open" } } } },
  });
  presentation.registerProvider({ id: "files", effects: { open: operation } });
  await presentation.emit(vi.fn<EmitFn>(), node("ui:files"), "openRequested", { fileId: " ledger " }, "owner");
  assert.deepEqual(opened, ["ledger"]);
});

test("explicit semantic dispatch retains Cell event validation and headless behavior", async () => {
  const blueprint = artifact();
  const materialized = materializeBlueprint({ blueprint });
  const presentation = new PresentationHost({
    bindings: { "ui:report": { on: {
      fileSelected: { event: { node: filesId, name: "selectFile" } },
      unknown: { event: { node: filesId, name: "notDeclared" } },
    } } },
  });
  let payload: Record<string, Json> = { fileId: "ledger" };
  let state: Record<string, Json> | undefined;
  const dispatch = vi.fn<EmitFn>(async (id, name, received, actorId) => {
    assert.deepEqual(received, payload);
    assert.equal(actorId, "owner");
    const result = await runMaterializedTransition({
      materializedBlueprint: materialized, state: materialized.payload.initialState,
      events: [{ node: id, name, payload, actorId }],
    });
    state = result.state;
  });
  await presentation.emit(dispatch, node(), "fileSelected", payload, "owner");
  assert.deepEqual(state?.semantic, { selectedFileId: "ledger", previewed: false });
  payload = { fileId: false };
  await assert.rejects(presentation.emit(dispatch, node(), "fileSelected", payload, "owner"), /Invalid payload/);
  await assert.rejects(presentation.emit(dispatch, node(), "unknown", payload, "owner"), /undeclared event/);
  const { presentation: _presentation, ...headless } = blueprint.payload;
  const headlessMaterialized = materializeBlueprint({ blueprint: createBlueprint({
    ...headless,
    cells: Object.fromEntries(Object.entries(headless.cells!).map(([id, { potentialViews: _views, ...cell }]) => [id, cell])),
  }) });
  const result = await runMaterializedTransition({
    materializedBlueprint: headlessMaterialized, state: headlessMaterialized.payload.initialState,
    events: [{ node: "files", name: "selectFile", payload: { fileId: "ledger" } }],
  });
  assert.deepEqual(result.state.semantic, { selectedFileId: "ledger", previewed: false });
});

test("component-local interaction needs no host effect; unbound semantic events retain the controller route", async () => {
  const presentation = host();
  const dispatch = vi.fn<EmitFn>();
  await presentation.emit(dispatch, node("ui:files", filesId), "selectFile", { fileId: "ledger" }, "owner");
  assert.deepEqual(dispatch.mock.calls, [[filesId, "selectFile", { fileId: "ledger" }, "owner"]]);
  const renderer = await mount(<BlueprintHost blueprint={artifact()} native={native} presentationHost={presentation} />);
  await waitForReport(renderer);
  await act(async () => { renderer.root.findByProps({ "data-expand": reportId }).props.onClick(); });
  assert.deepEqual(renderer.root.findByProps({ "data-expand": reportId }).children, ["Collapse"]);
  assert.equal(presentation.getState().attention["related-file"], null);
});

test.each(["memory", "remote"] as const)("%s regions share explicitly supplied host state while nested hosts reset scope", async (placement) => {
  const presentation = host();
  const props = { blueprint: artifact(), native, presentationHost: presentation };
  const children = <>
    <BlueprintRegion name="primary" />
    <BlueprintHost blueprint={artifact()} native={native} />
  </>;
  const renderer = await mount(placement === "memory"
    ? <BlueprintProvider {...props}>{children}</BlueprintProvider>
    : <DurableBlueprintProvider {...props} runtime={runtime()}>{children}</DurableBlueprintProvider>);
  await waitForReport(renderer, 2);
  await act(async () => {
    await renderer.root.findAllByProps({ "data-finding": `${reportId}:ledger` })[0].props.onMouseEnter();
  });
  const files = renderer.root.findAllByProps({ "data-file": `${filesId}:ledger` });
  assert.equal(files[0].props["data-highlighted"], true);
  assert.equal(files[1].props["data-highlighted"], false);
  assert.equal(renderer.root.findAllByProps({ "data-files": filesId })[1].props["data-host-state"], undefined);
});

test("companion organisms never inherit the primary instance's host bindings or state", async () => {
  const blueprint = artifact();
  const materialized = materializeBlueprint({ blueprint });
  const presentation = host();
  const renderer = await mount(<BlueprintHost blueprint={blueprint} native={native} presentationHost={presentation}
    companions={[{
      instanceId: "companion",
      source: new BlueprintController(blueprint),
      bundle: bundleFromJson({
        vocabulary: materialized.payload.vocabulary, program: materialized.payload.program,
        state: materialized.payload.initialState,
      }, native),
      structuralViews: { "gik:presentation-fragment": ({ children }) => <>{children}</> },
    }]} />);
  await waitForReport(renderer, 2);
  await act(async () => {
    await renderer.root.findAllByProps({ "data-finding": `${reportId}:ledger` })[0].props.onMouseEnter();
  });
  assert.equal(renderer.root.findAllByProps({ "data-file": `${filesId}:ledger` })[0].props["data-highlighted"], true);
  assert.equal(renderer.root.findAllByProps({ "data-file": `${filesId}:ledger` })[1].props["data-highlighted"], false);
});
