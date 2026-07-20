import assert from "node:assert/strict";
import { test } from "vitest";

import {
  InvocationClosedError,
  GIKClient,
  Kernel,
  KernelTransportHost,
  createInMemoryTransportPair,
  type InvocationControl,
  type InvocationProgress,
  type Orchestrator,
  type Patch,
  type TraceEvent,
} from "../src/index";

const manifest = {
  version: "controlled-invocation-test/1",
  namespaces: ["work"],
  capabilities: { button: { emits: ["run"] } },
};

const document = {
  gik: "0.1",
  type: "document",
  payload: {
    root: {
      capability: "button",
      id: "worker",
      edges: {
        on: {
          run: [{ do: "invoke", args: { tool: "work" } }],
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
  assert.deepEqual(initiating, { rev: 1, ops: [] });

  await kernel.whenIdle();
  assert.deepEqual(progress.map(({ seq, name }) => ({ seq, name })), [
    { seq: 0, name: "started" },
    { seq: 1, name: "halfway" },
  ]);
  assert.equal(progress[0].invocationId, progress[1].invocationId);
  assert.deepEqual(patches[1], {
    rev: 2,
    ops: [{ op: "set", path: "work.result", value: "done" }],
  });
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
  assert.equal(patches.length, 1);
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
    { kind: "invoke", node: "worker", tool: "work", args: {} },
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