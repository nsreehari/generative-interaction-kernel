import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, test, vi } from "vitest";
import { createBlueprint, materializeBlueprint, runMaterializedTransition } from "gik-blueprint";
import { createMemoryStorage } from "gik-durable-runtime/storage/memory";
import type { Json } from "gik-kernel";
import { PresentationHost, PresentationHostProvider } from "../src/presentation-host";
import { BlueprintController } from "../src/blueprint-controller";
import { BlueprintHost, BlueprintProvider } from "../src/primitives/blueprint-host";
import {
  BlueprintHost as DurableBlueprintHost,
  BlueprintProvider as DurableBlueprintProvider,
} from "../src/primitives/durable-blueprint-host";
import { BlueprintRegion } from "../src/primitives/blueprint-regions";
import { bundleFromJson } from "../src/primitives/bundle";
import type { EmitFn } from "../src/render";
import type { ProjectionView, ProviderResolver } from "../src/registry";
import { GenUIRoot } from "../src/useGenUI";

const Dialog: ProjectionView = ({ node, emit, children, hostState }) => {
  const [localOpen, setLocalOpen] = React.useState(false);
  const controlled = typeof node.props.open === "boolean";
  const open = controlled ? node.props.open : localOpen;
  return (
    <section data-dialog={node.id} data-open={open} data-host-state={JSON.stringify(hostState)}>
      <button data-trigger={node.id} onClick={() => controlled ? emit("openChange", { open: !open }) : setLocalOpen(!open)}>
        Toggle
      </button>
      {children}
    </section>
  );
};
const Form: ProjectionView = ({ node, emit, hostState }) => (
  <button data-form={node.id} data-host-state={JSON.stringify(hostState)} onClick={() => emit("approve", { approved: true })}>
    {String(node.props.approved)}
  </button>
);
const resolveProvider: ProviderResolver = (from) => from === "test" ? { dialog: Dialog, form: Form } : undefined;
const primary = "action--primary--in-first";
const wrapper = `${primary}--wrap-0`;
const secondWrapper = "action--primary--in-second--wrap-0";
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

async function waitForDialog(renderer: TestRenderer.ReactTestRenderer): Promise<void> {
  await vi.waitFor(async () => {
    await act(async () => {
      assert.equal(renderer.root.findAllByProps({ "data-dialog": wrapper }).length, 1);
    });
  });
}

function artifact() {
  return createBlueprint({
    id: "presentation-events",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program", capabilities: [] }],
    projectionRecipes: [],
    runtime: {
      externals: { projectionViews: { ui: { from: "test", use: ["dialog", "form"] } } },
      state: { semantic: { open: false, approved: false } },
    },
    cells: {
      action: {
        id: "action",
        events: {
          openChange: { payloadSchema: { type: "object", required: ["open"], properties: { open: { type: "boolean" } } } },
          approve: { payloadSchema: { type: "object", required: ["approved"], properties: { approved: { type: "boolean" } } } },
        },
        behavior: { on: {
          openChange: [{ do: "assign", target: "semantic.open", args: { from: "$event.open" } }],
          approve: [{ do: "assign", target: "semantic.approved", args: { from: "$event.approved" } }],
        } },
        potentialViews: { primary: {
          capability: "ui:form",
          bindings: { approved: { from: "semantic.approved" } },
          region: ["first", "second"],
          wrap: [{ capability: "ui:dialog" }, { capability: "ui:dialog" }],
        } },
      },
    },
    presentation: {
      slots: ["first", { id: "second", region: "first" }],
      root: "first",
      allowedCapabilities: ["ui:form", "ui:dialog"],
      exportedRegions: [{ name: "primary", slot: "first", required: true }],
    },
  });
}

function host() {
  const presentation = new PresentationHost({
    state: { dialog: { open: false } },
    bindings: {
      [wrapper]: { props: { open: { from: "dialog.open" } }, on: { openChange: { effect: "dialog:set-open" } } },
      [`${primary}--wrap-1`]: { props: { open: { from: "dialog.open" } }, on: { openChange: { effect: "dialog:set-open" } } },
      [secondWrapper]: { props: { open: { from: "dialog.open" } }, on: { openChange: { effect: "dialog:set-open" } } },
    },
  });
  presentation.registerEffects({
    "dialog:set-open": ({ payload, set }) => {
      if (typeof payload?.open !== "boolean") throw new Error("Expected boolean open");
      set("dialog.open", payload.open);
    },
  });
  return presentation;
}

test("nested wrapper effects update shared host-local presentation without dispatching to the Cell", async () => {
  const source = new BlueprintController(artifact());
  const emit = vi.spyOn(source, "emit");
  const presentation = host();
  const renderer = await mount(
    <PresentationHostProvider host={presentation}>
      <GenUIRoot source={source} registry={{
        get: (name) => name === "ui:dialog" ? Dialog : Form,
        fallback: Form,
        getStructural: (name) => name === "gik:presentation-fragment" ? ({ children }) => <>{children}</> : undefined,
      }} />
    </PresentationHostProvider>,
  );
  await waitForDialog(renderer);
  const before = source.getState();
  await act(async () => { await renderer.root.findByProps({ "data-trigger": wrapper }).props.onClick(); });
  assert.equal(emit.mock.calls.length, 0);
  assert.deepEqual(source.getState(), before);
  for (const id of [wrapper, `${primary}--wrap-1`, secondWrapper]) {
    assert.equal(renderer.root.findByProps({ "data-dialog": id }).props["data-open"], true);
  }
  assert.deepEqual(JSON.parse(renderer.root.findByProps({ "data-form": primary }).props["data-host-state"]), {
    dialog: { open: true },
  });
  assert.equal(source.getTree()?.children[1]?.props.open, undefined);
});

test("explicit semantic bindings retain event/payload validation and headless behavior", async () => {
  const blueprint = artifact();
  const materialized = materializeBlueprint({ blueprint });
  const presentation = new PresentationHost({
    bindings: {
      [wrapper]: { on: {
        confirm: { event: { node: primary, name: "approve" } },
        unknown: { event: { node: primary, name: "notDeclared" } },
      } },
    },
  });
  let payload: Record<string, Json> = { approved: true };
  let resultState: Record<string, Json> | undefined;
  const dispatch = vi.fn<EmitFn>(async (node, name, received, actorId) => {
    assert.deepEqual(received, payload);
    assert.equal(actorId, "actor");
    const result = await runMaterializedTransition({
      materializedBlueprint: materialized,
      state: materialized.payload.initialState,
      events: [{ node, name, payload, actorId }],
    });
    resultState = result.state;
    return result;
  });
  await presentation.emit(dispatch, wrapper, "confirm", payload, "actor");
  assert.deepEqual(dispatch.mock.calls[0], [primary, "approve", payload, "actor"]);
  assert.deepEqual(resultState?.semantic, { open: false, approved: true });
  payload = { approved: "invalid" };
  await assert.rejects(presentation.emit(dispatch, wrapper, "confirm", payload, "actor"), /Invalid payload/);
  await assert.rejects(presentation.emit(dispatch, wrapper, "unknown", payload, "actor"), /undeclared event/);

  const { presentation: _presentation, ...headless } = blueprint.payload;
  const { potentialViews: _views, ...headlessCell } = headless.cells!.action;
  const headlessMaterialized = materializeBlueprint({
    blueprint: createBlueprint({ ...headless, cells: { action: headlessCell } }),
  });
  const result = await runMaterializedTransition({
    materializedBlueprint: headlessMaterialized,
    state: headlessMaterialized.payload.initialState,
    events: [{ node: "action", name: "approve", payload: { approved: true } }],
  });
  assert.deepEqual(result.state.semantic, { open: false, approved: true });
  assert.equal(materialized.payload.eventNodeOwners[wrapper], undefined);
});

test("registered host effects fail explicitly and do not fall through to semantic dispatch", async () => {
  const presentation = new PresentationHost({
    bindings: { [wrapper]: { on: { openChange: { effect: "dialog:open" } } } },
  });
  const dispatch = vi.fn<EmitFn>();
  await assert.rejects(presentation.emit(dispatch, wrapper, "openChange"), /not registered/);
  assert.equal(dispatch.mock.calls.length, 0);
  const unregister = presentation.registerEffects({ "dialog:open": () => { throw new Error("Dialog unavailable"); } });
  assert.throws(() => presentation.registerEffects({ "dialog:open": () => {} }), /already registered/);
  await assert.rejects(presentation.emit(dispatch, wrapper, "openChange"), /Dialog unavailable/);
  unregister();
  const handle = vi.fn();
  presentation.registerEffects({ "dialog:open": handle });
  unregister();
  await presentation.emit(dispatch, wrapper, "openChange");
  assert.equal(handle.mock.calls.length, 1);
  assert.throws(() => presentation.registerEffects({ unnamed: () => {} }), /namespaced/);
});

test("component-internal interactions require no named effect and unbound semantic events retain their route", async () => {
  const presentation = new PresentationHost();
  const dispatch = vi.fn<EmitFn>();
  await presentation.emit(dispatch, primary, "approve", { approved: true }, "actor");
  assert.deepEqual(dispatch.mock.calls, [[primary, "approve", { approved: true }, "actor"]]);

  const renderer = await mount(<BlueprintHost blueprint={artifact()} resolveLeavesProvider={resolveProvider} presentationHost={presentation} />);
  await waitForDialog(renderer);
  await act(async () => { await renderer.root.findByProps({ "data-trigger": wrapper }).props.onClick(); });
  assert.equal(renderer.root.findByProps({ "data-dialog": wrapper }).props["data-open"], true);
  assert.deepEqual(presentation.getState(), {});
});

function runtime() {
  const ref = `b64:${Buffer.from(JSON.stringify({ kind: "memory", value: crypto.randomUUID() })).toString("base64url")}`;
  return {
    runtimeId: crypto.randomUUID(),
    providers: { memory: createMemoryStorage() },
    refs: { stateRef: ref, journalRef: ref, effectsQueueRef: ref },
  };
}

test.each(["memory", "remote"] as const)("%s BlueprintHost handles presentation effects without worker execution", async (placement) => {
  const presentation = host();
  const onTransition = vi.fn();
  const remoteRuntime = runtime();
  const provider = remoteRuntime.providers.memory;
  const append = vi.spyOn(provider, "appendJournal");
  const element = placement === "memory"
    ? <BlueprintHost blueprint={artifact()} resolveLeavesProvider={resolveProvider} presentationHost={presentation} onTransition={onTransition} />
    : <DurableBlueprintHost blueprint={artifact()} runtime={remoteRuntime} resolveLeavesProvider={resolveProvider} presentationHost={presentation} onTransition={onTransition} />;
  const renderer = await mount(element);
  await waitForDialog(renderer);
  const transitions = onTransition.mock.calls.length;
  const journalEntries = append.mock.calls.length;
  const snapshotRequest = { ...remoteRuntime.refs, runtimeId: remoteRuntime.runtimeId };
  const snapshot = placement === "remote" ? await provider.readSnapshot(snapshotRequest) : undefined;
  await act(async () => { await renderer.root.findByProps({ "data-trigger": wrapper }).props.onClick(); });
  assert.equal(renderer.root.findByProps({ "data-dialog": wrapper }).props["data-open"], true);
  assert.equal(onTransition.mock.calls.length, transitions);
  assert.equal(append.mock.calls.length, journalEntries);
  if (placement === "remote") {
    assert.deepEqual(await provider.readSnapshot(snapshotRequest), snapshot);
    assert.equal(await provider.leaseQueueItem?.({ effectsQueueRef: remoteRuntime.refs.effectsQueueRef }), null);
  }
});

test.each(["memory", "remote"] as const)("%s region providers share host state but nested Blueprint instances do not inherit it", async (placement) => {
  const presentation = host();
  presentation.set("dialog.open", true);
  const props = { blueprint: artifact(), resolveLeavesProvider: resolveProvider, presentationHost: presentation };
  const children = <>
    <BlueprintRegion name="primary" />
    <BlueprintHost blueprint={artifact()} resolveLeavesProvider={resolveProvider} />
  </>;
  const renderer = await mount(placement === "memory"
    ? <BlueprintProvider {...props}>{children}</BlueprintProvider>
    : <DurableBlueprintProvider {...props} runtime={runtime()}>{children}</DurableBlueprintProvider>);
  await vi.waitFor(async () => {
    await act(async () => { assert.equal(renderer.root.findAllByProps({ "data-dialog": wrapper }).length, 2); });
  });
  const dialogs = renderer.root.findAllByProps({ "data-dialog": wrapper });
  assert.equal(dialogs[0].props["data-open"], true);
  assert.equal(dialogs[1].props["data-open"], false);
  assert.equal(dialogs[1].props["data-host-state"], undefined);
  await act(async () => { presentation.set("dialog.open", false); });
  assert.equal(renderer.root.findAllByProps({ "data-dialog": wrapper })[0].props["data-open"], false);
});

test("companion organisms never inherit the primary instance's presentation bindings or state", async () => {
  const blueprint = artifact();
  const materialized = materializeBlueprint({ blueprint });
  const presentation = host();
  presentation.set("dialog.open", true);
  const renderer = await mount(
    <BlueprintHost
      blueprint={blueprint}
      resolveLeavesProvider={resolveProvider}
      presentationHost={presentation}
      companions={[{
        instanceId: "companion",
        source: new BlueprintController(blueprint),
        bundle: bundleFromJson({
          vocabulary: materialized.payload.vocabulary,
          program: materialized.payload.program,
          state: materialized.payload.initialState,
        }),
        structuralViews: { "gik:presentation-fragment": ({ children }) => <>{children}</> },
      }]}
    />,
  );
  await vi.waitFor(async () => {
    await act(async () => { assert.equal(renderer.root.findAllByProps({ "data-dialog": wrapper }).length, 2); });
  });
  const dialogs = renderer.root.findAllByProps({ "data-dialog": wrapper });
  assert.equal(dialogs[0].props["data-open"], true);
  assert.equal(dialogs[1].props["data-open"], false);
  assert.equal(dialogs[1].props["data-host-state"], undefined);
});
