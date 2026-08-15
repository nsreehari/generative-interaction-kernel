import assert from "node:assert/strict";
import { test } from "vitest";

import {
  InvocationClosedError,
  GIKClient,
  Kernel,
  KernelTransportHost,
  createInMemoryTransportPair,
  projectCellRunState,
  type InvocationControl,
  type InvocationProgress,
  type Orchestrator,
  type Patch,
  type TraceEvent,
  type CellRunState,
} from "../src/index";

const manifest = {
  version: "controlled-invocation-test/1",
  namespaces: ["work"],
  capabilities: { button: { emits: ["run"] } },
};

const document = {
  gik: "0.1",
  type: "program",
  payload: {
    root: {
      capability: "button",
      id: "worker",
      edges: {
        on: {
          run: [{ do: "invoke", control: { tool: "work", sourceId: "worker.source" } }],
        },
      },
    },
  },
};

test("controlled invoke publishes ordered progress and one later terminal patch", async () => {
  const orchestrator: Orchestrator = {
    async invoke(_effect, control) {
      await control.emitProgress({ name: "started" });
      await control.emitProgress({ name: "halfway", detail: { percent: 50 } });
      return { ops: [{ op: "set", path: "work.result", value: "done" }] };
    },
  };
  const kernel = new Kernel(manifest as any, document as any, { orchestrator });
  const patches: Patch[] = [];
  const progress: InvocationProgress[] = [];
  kernel.subscribePatches((patch) => patches.push(patch));
  kernel.subscribeProgress((message) => progress.push(message));

  const initiating = await kernel.dispatch({ node: "worker", name: "run" });
  assert.equal(initiating.rev, 1);
  assert.equal(initiating.ops.length, 1);
  const activeCell = (kernel.state().blueprintRunState as unknown as { cells: Record<string, CellRunState> }).cells.worker;
  assert.equal(projectCellRunState(activeCell).numSourcesRunning, 1);
  const requestToken = activeCell.sources[0].lastRequestedToken;
  assert.ok(requestToken);

  await kernel.whenIdle();
  assert.deepEqual(progress.map(({ seq, name }) => ({ seq, name })), [
    { seq: 0, name: "started" },
    { seq: 1, name: "halfway" },
  ]);
  assert.equal(progress[0].invocationId, progress[1].invocationId);
  assert.equal(patches.length, 2);
  assert.equal(patches[1].rev, 2);
  assert.deepEqual(patches[1].ops.map(({ path }) => path), ["work.result", "blueprintRunState.cells"]);
  const completedCell = (kernel.state().blueprintRunState as unknown as { cells: Record<string, CellRunState> }).cells.worker;
  assert.equal(projectCellRunState(completedCell).numSourcesRunning, 0);
  assert.deepEqual(completedCell.sources[0], {
    id: "worker.source",
    lastRequestedToken: requestToken,
    lastCompletedToken: requestToken,
    lastCompletionStatus: "success",
    queueRequestedToken: requestToken,
  });
});

test("source run state projects the count of distinct active sources", async () => {
  const controls = new Map<string, InvocationControl[]>();
  const releases: Array<() => void> = [];
  const orchestrator: Orchestrator = {
    invoke(effect, control) {
      if (effect.kind !== "invoke") return Promise.resolve();
      const sourceControls = controls.get(effect.control.sourceId!) ?? [];
      sourceControls.push(control);
      controls.set(effect.control.sourceId!, sourceControls);
      return new Promise<void>((resolve) => releases.push(resolve));
    },
  };
  const concurrentManifest = {
    ...manifest,
    capabilities: { button: { emits: ["runA", "runB"] } },
  };
  const concurrentDocument = {
    gik: "0.1",
    type: "program",
    payload: {
      root: {
        capability: "button",
        id: "worker-cell",
        edges: {
          on: {
            runA: [{ do: "invoke", control: { tool: "work-a", sourceId: "source.a" } }],
            runB: [{ do: "invoke", control: { tool: "work-b", sourceId: "source.b" } }],
          },
        },
      },
    },
  };
  const kernel = new Kernel(concurrentManifest as any, concurrentDocument as any, { orchestrator });
  const cellState = () => projectCellRunState((
    kernel.state().blueprintRunState as unknown as { cells: Record<string, CellRunState> }
  ).cells["worker-cell"]);

  await kernel.dispatch({ node: "worker-cell", name: "runA" });
  await kernel.dispatch({ node: "worker-cell", name: "runB" });
  await Promise.resolve();

  assert.equal(cellState().numSourcesRunning, 2);
  assert.deepEqual(cellState().sources.map(({ id, status }) => ({ id, status })), [
    { id: "source.a", status: "running" },
    { id: "source.b", status: "running" },
  ]);

  await controls.get("source.a")![0].emit();
  assert.equal(cellState().numSourcesRunning, 1);
  assert.equal(cellState().sources[0].status, "idle");

  await controls.get("source.b")![0].emit();
  assert.equal(cellState().numSourcesRunning, 0);
  assert.equal(cellState().sources[1].status, "idle");

  for (const release of releases) release();
  await kernel.whenIdle();
});

test("cancellation aborts the signal and revokes later provider output", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let control!: InvocationControl;
  const orchestrator: Orchestrator = {
    async invoke(_effect, invocationControl) {
      control = invocationControl;
      await gate;
      return { ops: [{ op: "set", path: "work.result", value: "too-late" }] };
    },
  };
  const kernel = new Kernel(manifest as any, document as any, { orchestrator });
  const patches: Patch[] = [];
  kernel.subscribePatches((patch) => patches.push(patch));

  await kernel.dispatch({ node: "worker", name: "run" });
  await Promise.resolve();
  const invocationId = kernel.effectsSince(0)[0].invocationId;
  assert.ok(invocationId);
  kernel.cancelInvocation(invocationId);
  assert.equal(control.signal.aborted, true);

  release();
  await kernel.whenIdle();
  assert.equal(kernel.state().work && (kernel.state().work as Record<string, unknown>).result, undefined);
  assert.equal(patches.length, 2);
  const cancelledCell = (kernel.state().blueprintRunState as unknown as { cells: Record<string, CellRunState> }).cells.worker;
  assert.equal(cancelledCell.sources[0].lastCompletionStatus, "failure");
  await assert.rejects(control.emitProgress({ name: "late" }), InvocationClosedError);
});

test("cancellation revokes terminal settlement waiting behind another mutation", async () => {
  let releaseInvocation!: () => void;
  const invocationGate = new Promise<void>((resolve) => {
    releaseInvocation = resolve;
  });
  let releaseCompensation!: () => void;
  const compensationGate = new Promise<void>((resolve) => {
    releaseCompensation = resolve;
  });
  let compensationStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    compensationStarted = resolve;
  });
  let control!: InvocationControl;
  const orchestrator: Orchestrator = {
    async invoke(_effect, invocationControl) {
      control = invocationControl;
      await invocationGate;
    },
    async compensate() {
      compensationStarted();
      await compensationGate;
    },
  };
  const kernel = new Kernel(manifest as any, document as any, { orchestrator });
  await kernel.dispatch({ node: "worker", name: "run" });
  await Promise.resolve();
  const invocationId = kernel.effectsSince(0)[0].invocationId;
  assert.ok(invocationId);

  const blockingMutation = kernel.compensate([
    { kind: "invoke", node: "worker", control: { tool: "work" }, data: {} },
  ]);
  await started;
  const settlement = control.emit({ ops: [{ op: "set", path: "work.result", value: "too-late" }] });
  await Promise.resolve();
  kernel.cancelInvocation(invocationId);
  releaseCompensation();

  await blockingMutation;
  await assert.rejects(settlement, InvocationClosedError);
  releaseInvocation();
  await kernel.whenIdle();
  assert.equal((kernel.state().work as Record<string, unknown>).result, undefined);
});

test("a synchronous provider failure remains detached from the committed dispatch", async () => {
  const traces: TraceEvent[] = [];
  const kernel = new Kernel(manifest as any, document as any, {
    orchestrator: {
      invoke() {
        throw new Error("provider failed synchronously");
      },
    },
    sink: (trace) => traces.push(trace),
  });

  const patch = await kernel.dispatch({ node: "worker", name: "run" });
  assert.equal(patch.rev, 1);
  await assert.rejects(kernel.whenIdle(), /provider failed synchronously/);
  assert.ok(traces.some((trace) => String(trace.detail?.message).includes("provider failed synchronously")));
});

test("a guarded source rejected during graph activation emits a skipped outcome", async () => {
  const traces: TraceEvent[] = [];
  let invocations = 0;
  const kernel = new Kernel(manifest as any, {
    gik: "0.1",
    type: "program",
    payload: {
      graph: {
        inputs: ["work.accept"],
        nodes: [{
          id: "worker-source-0",
          inputs: { accept: "work.accept" },
          operation: {
            kind: "actions",
            actions: [{
              do: "invoke",
              control: { tool: "work", sourceId: "worker.source", sourceCellId: "worker" },
              guard: "$inputs.accept",
            }],
          },
        }],
      },
    },
  } as any, {
    orchestrator: { async invoke() { invocations += 1; } },
    sink: (trace) => traces.push(trace),
  });

  await kernel.publish({ "work.accept": false });
  await kernel.whenIdle();

  assert.equal(invocations, 0);
  assert.ok(traces.some((trace) =>
    trace.event === "effect"
    && trace.node === "worker-source-0"
    && trace.detail?.phase === "outcome"
    && trace.detail?.outcome === "skipped"
    && trace.detail?.sourceId === "worker.source"
    && trace.detail?.reason === "when-false"
  ));
});

test("an input-driven source keeps only the latest pending activation without cancelling the active request", async () => {
  const controls: InvocationControl[] = [];
  const effects: Array<{ control: { sourceRequestToken?: string } }> = [];
  const kernel = new Kernel(manifest as any, {
    gik: "0.1",
    type: "program",
    payload: {
      graph: {
        inputs: ["work.request"],
        nodes: [{
          id: "worker-source-0",
          inputs: { request: "work.request" },
          operation: {
            kind: "actions",
            actions: [{
              do: "invoke",
              control: { tool: "work", sourceId: "worker.source", sourceCellId: "worker" },
              guard: "$inputs.request.enabled",
            }],
          },
        }],
      },
    },
  } as any, {
    orchestrator: {
      invoke(effect, control) {
        if (effect.kind === "invoke") effects.push(effect);
        controls.push(control);
        return new Promise<void>(() => {});
      },
    },
  });

  await kernel.publish({ "work.request": { id: 1, enabled: true } });
  await Promise.resolve();
  await kernel.publish({ "work.request": { id: 2, enabled: true } });
  await Promise.resolve();
  const stateAfterB = (kernel.state().blueprintRunState as unknown as { cells: Record<string, CellRunState> }).cells.worker.sources[0];
  await kernel.publish({ "work.request": { id: 3, enabled: true } });
  await Promise.resolve();
  const stateAfterC = (kernel.state().blueprintRunState as unknown as { cells: Record<string, CellRunState> }).cells.worker.sources[0];

  assert.equal(controls.length, 1);
  assert.equal(kernel.execution().runningInvocations.length, 1);
  assert.notEqual(stateAfterB.queueRequestedToken, stateAfterB.lastRequestedToken);
  assert.notEqual(stateAfterC.queueRequestedToken, stateAfterB.queueRequestedToken);
  assert.equal(controls[0].signal.aborted, false);

  await controls[0].emit();
  await Promise.resolve();

  assert.equal(controls.length, 2);
  assert.equal(effects[1].control.sourceRequestToken, stateAfterC.queueRequestedToken);
  assert.equal(kernel.execution().runningInvocations.length, 1);
  kernel.dispose();
});

test("subscriber failures do not reject dispatch or prevent invocation settlement", async () => {
  const traces: TraceEvent[] = [];
  const kernel = new Kernel(manifest as any, document as any, {
    orchestrator: {
      async invoke(_effect, control) {
        await control.emitProgress({ name: "started" });
        return { ops: [{ op: "set", path: "work.result", value: "done" }] };
      },
    },
    sink: (trace) => traces.push(trace),
  });
  kernel.subscribePatches(() => {
    throw new Error("patch listener failed");
  });
  kernel.subscribeProgress(() => {
    throw new Error("progress listener failed");
  });

  await kernel.dispatch({ node: "worker", name: "run" });
  await kernel.whenIdle();
  assert.equal((kernel.state().work as Record<string, unknown>).result, "done");
  assert.ok(traces.some((trace) => trace.detail?.phase === "patch-listener-error"));
  assert.ok(traces.some((trace) => trace.detail?.phase === "progress-listener-error"));
});

test("transported clients receive progress before the terminal patch", async () => {
  const orchestrator: Orchestrator = {
    async invoke(_effect, control) {
      await control.emitProgress({ name: "started" });
      await control.emitProgress({ name: "halfway" });
      return { ops: [{ op: "set", path: "work.result", value: "done" }] };
    },
  };
  const kernel = new Kernel(manifest as any, document as any, { orchestrator });
  const [hostTransport, clientTransport] = createInMemoryTransportPair();
  const client = new GIKClient(clientTransport);
  const progress: InvocationProgress[] = [];
  client.subscribeProgress((message) => progress.push(message));
  client.start();
  const host = new KernelTransportHost(manifest as any, document as any, kernel, hostTransport);
  await host.start();

  await host.dispatch({ node: "worker", name: "run" });
  await host.whenIdle();

  assert.deepEqual(progress.map((message) => message.name), ["started", "halfway"]);
  assert.equal(client.getRev(), 2);
  assert.equal(client.get("work.result"), "done");
});

test("direct source invocation stores transformed output before completion", async () => {
  const sourceDocument = structuredClone(document) as any;
  sourceDocument.payload.root.edges.on.run[0].control.sourceOutputTransform = {
    kind: "jsonata",
    expr: "response.value",
  };
  const kernel = new Kernel(manifest as any, sourceDocument, {
    orchestrator: {
      async invoke() {
        return { sourceOutput: { value: 42 } };
      },
    },
  });

  await kernel.dispatch({ node: "worker", name: "run" });
  await kernel.whenIdle();

  const cell = (kernel.state().blueprintRunState as unknown as {
    cells: Record<string, CellRunState & { sourceValues?: Record<string, unknown> }>;
  }).cells.worker;
  assert.equal(cell.sourceValues?.["worker.source"], 42);
  assert.equal(projectCellRunState(cell).numSourcesRunning, 0);
});

test("detached invocation state changes republish into the graph", async () => {
  const graphDocument = structuredClone(document) as any;
  delete graphDocument.payload.root.edges.on.run[0].control.sourceId;
  graphDocument.payload.graph = {
    inputs: ["work.result"],
    outputs: ["observed-result"],
    nodes: [{
      id: "observe-result",
      inputs: { value: "work.result" },
      outputs: { value: "observed-result" },
      operation: { kind: "compute", expression: "$inputs.value" },
    }],
  };
  const kernel = new Kernel(manifest as any, graphDocument, {
    orchestrator: {
      async invoke() {
        return { ops: [{ op: "set", path: "work.result", value: "done" }] };
      },
    },
  });

  await kernel.dispatch({ node: "worker", name: "run" });
  await kernel.whenIdle();

  assert.equal(kernel.execution().tokens["observed-result"].value, "done");
});