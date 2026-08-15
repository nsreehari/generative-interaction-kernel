import assert from "node:assert/strict";
import { test } from "vitest";
import {
  ContinuousGraphRuntime,
  JsonataExpressionProvider,
  Kernel,
  SyncJsonataExpressionProvider,
  type Orchestrator,
  type ProgramGraph,
} from "../src/index";

const graph: ProgramGraph = {
  inputs: ["seed"],
  outputs: ["settled"],
  nodes: [
    {
      id: "A",
      inputs: { value: "seed" },
      outputs: { next: "candidate" },
      operation: { kind: "compute", expression: "$inputs.value + 1" },
    },
    {
      id: "B",
      inputs: { candidate: "candidate" },
      outputs: { next: "evaluated" },
      operation: { kind: "compute", expression: "$inputs.candidate" },
    },
    {
      id: "D",
      inputs: { value: "evaluated" },
      outputs: { feedback: "seed", done: "settled" },
      operation: {
        kind: "decision",
        cases: [
          { when: "$inputs.value < 3", outputs: { feedback: "$inputs.value" } },
          { when: "$inputs.value >= 3", outputs: { done: "$inputs.value" } },
        ],
      },
    },
  ],
};

test("a feedback graph propagates until it exits and becomes quiescent", async () => {
  const runtime = new ContinuousGraphRuntime(graph, new JsonataExpressionProvider());
  const result = await runtime.publish({ seed: 0 });

  assert.equal(result.status, "quiescent");
  assert.equal(result.publications.settled, 3);
  assert.equal(runtime.snapshotTokens().seed.value, 2);
  assert.deepEqual(runtime.inspect().diagnostics.filter(({ kind }) => kind === "feedback-component"), [
    { kind: "feedback-component", nodes: ["A", "B", "D"] },
  ]);
});

test("unproduced tokens remain valid and become reachable after mutation", async () => {
  const runtime = new ContinuousGraphRuntime({
    inputs: [],
    nodes: [{
      id: "consumer",
      inputs: { value: "later" },
      outputs: { result: "result" },
      operation: { kind: "compute", expression: "$inputs.value" },
    }],
  }, new JsonataExpressionProvider());

  assert.deepEqual(runtime.inspect().diagnostics.filter(({ kind }) => kind === "unproduced-token"), [
    { kind: "unproduced-token", token: "later" },
  ]);
  runtime.mutate([{ op: "addNode", node: {
    id: "producer",
    inputs: { source: "source" },
    outputs: { value: "later" },
    operation: { kind: "compute", expression: "$inputs.source" },
  } }]);

  const result = await runtime.publish({ source: "ready" });
  assert.equal(result.publications.result, "ready");
});

test("a perpetual signal cycle yields instead of being rejected", async () => {
  const runtime = new ContinuousGraphRuntime({
    inputs: ["pulse"],
    ports: { pulse: { mode: "signal" } },
    nodes: [{
      id: "loop",
      inputs: { pulse: "pulse" },
      outputs: { pulse: "pulse" },
      operation: { kind: "compute", expression: "$inputs.pulse" },
    }],
  }, new JsonataExpressionProvider());

  const result = await runtime.publish({ pulse: true }, { maxNodeExecutions: 5 });
  assert.equal(result.status, "yielded");
  assert.equal(result.nodeExecutions, 5);
  assert.deepEqual(result.readyNodes, ["loop"]);
});

test("a consumed signal expires before unrelated value inputs change", async () => {
  const runtime = new ContinuousGraphRuntime({
    inputs: ["report", "selection"],
    ports: { report: { mode: "signal" } },
    outputs: ["observed"],
    nodes: [{
      id: "writer",
      inputs: { report: "report", selection: "selection" },
      outputs: { observed: "observed" },
      operation: { kind: "compute", expression: "$inputs" },
    }],
  }, new JsonataExpressionProvider());

  await runtime.publish({ selection: "a" });
  const report = await runtime.publish({ report: { id: 1 } });
  const selection = await runtime.publish({ selection: "b" });

  assert.equal(report.nodeExecutions, 1);
  assert.equal(selection.nodeExecutions, 0);
  assert.equal(runtime.snapshotTokens().report.status, "absent");
});

test("startup and event triggers enter the same dependency scheduler", async () => {
  const runtime = new ContinuousGraphRuntime({
    outputs: ["result"],
    nodes: [
      {
        id: "seed",
        trigger: { startup: true },
        outputs: { value: "seeded" },
        operation: { kind: "compute", expression: "1" },
      },
      {
        id: "event",
        trigger: { event: "run", node: "button" },
        inputs: { seed: { token: "seeded", optional: true } },
        outputs: { result: "result" },
        operation: { kind: "compute", expression: "$inputs.seed + $event.amount" },
      },
    ],
  }, new JsonataExpressionProvider());

  await runtime.start();
  const result = await runtime.dispatch({ node: "button", name: "run", payload: { amount: 2 } });
  assert.equal(result.publications.result, 3);
});

test("Kernel-context graph nodes bind $event to the event payload", async () => {
  const invoked: unknown[] = [];
  const kernel = new Kernel(
    { gik: "0.1", type: "vocabulary", payload: { version: "graph/1" } },
    { gik: "0.1", type: "program", payload: { graph: {
      nodes: [
        {
          id: "remember-event",
          trigger: { event: "run" },
          operation: {
            kind: "actions",
            actions: [{ do: "assign", target: "work.eventValue", args: { from: "$event.value" } }],
          },
        },
        {
          id: "invoke-event",
          trigger: { event: "run" },
          operation: { kind: "invoke", tool: "work", arguments: { value: "$event.value" } },
        },
      ],
    } } },
    { orchestrator: { async invoke(effect) { invoked.push(effect.data.value); return { outputs: {} }; } } },
  );

  await kernel.dispatch({ node: "button", name: "run", payload: { value: "payload" } });
  await kernel.whenIdle();
  assert.equal((kernel.state().work as Record<string, unknown>).eventValue, "payload");
  assert.deepEqual(invoked, ["payload"]);
});

test("Kernel publishes a cyclic graph transition into authoritative state", async () => {
  const kernel = new Kernel(
    { gik: "0.1", type: "vocabulary", payload: { version: "graph/1" } },
    { gik: "0.1", type: "program", payload: { graph } },
  );

  const result = await kernel.publish({ seed: 0 });
  assert.equal(result.status, "quiescent");
  assert.equal(result.state.settled, 3);
  assert.equal(result.patch.rev, 1);
  assert.equal(result.execution.tokens.settled.value, 3);
});

test("Kernel mutation activates a dormant token path", async () => {
  const kernel = new Kernel(
    { gik: "0.1", type: "vocabulary", payload: { version: "graph/1" } },
    { gik: "0.1", type: "program", payload: { graph: {
      nodes: [{
        id: "consumer",
        inputs: { value: "later" },
        outputs: { result: "result" },
        operation: { kind: "compute", expression: "$inputs.value" },
      }],
    } } },
  );

  await kernel.mutate([{ op: "addNode", node: {
    id: "producer",
    inputs: { source: "source" },
    outputs: { value: "later" },
    operation: { kind: "compute", expression: "$inputs.source" },
  } }]);
  const result = await kernel.publish({ source: "ready" });
  assert.equal(result.state.result, "ready");
  assert.equal(result.execution.topologyVersion, 1);
});

test("Kernel action nodes commit closed-grammar state operations in the graph transition", async () => {
  const kernel = new Kernel(
    { gik: "0.1", type: "vocabulary", payload: { version: "graph/1" } },
    { gik: "0.1", type: "program", payload: { graph: {
      nodes: [{
        id: "remember",
        inputs: { value: "request" },
        operation: {
          kind: "actions",
          actions: [{ do: "assign", target: "work.saved", args: { from: "$inputs.value" } }],
        },
      }],
    } } },
  );

  const result = await kernel.publish({ request: "keep" });
  assert.equal((result.state.work as Record<string, unknown>).saved, "keep");
  assert.ok(result.patch.ops.some(({ path }) => path === "work.saved"));
});

test("invoke actions settle as ordinary effects rather than graph output continuations", async () => {
  const orchestrator: Orchestrator = {
    async invoke() {
      return { ops: [{ op: "set", path: "work.effectResult", value: "done" }] };
    },
  };
  const kernel = new Kernel(
    { gik: "0.1", type: "vocabulary", payload: { version: "graph/1" } },
    { gik: "0.1", type: "program", payload: { graph: {
      nodes: [{
        id: "act",
        inputs: { value: "request" },
        operation: { kind: "actions", actions: [{ do: "invoke", control: { tool: "work" } }] },
      }],
    } } },
    { orchestrator },
  );

  const initiating = await kernel.publish({ request: true });
  assert.equal(initiating.status, "quiescent");
  await kernel.whenIdle();
  assert.equal((kernel.state().work as Record<string, unknown>).effectResult, "done");
});

test("Kernel invoke nodes suspend and resume downstream propagation from explicit outputs", async () => {
  const orchestrator: Orchestrator = {
    async invoke(effect) {
      assert.deepEqual(effect.data, { query: "question" });
      return { outputs: { answer: "resolved" } };
    },
  };
  const kernel = new Kernel(
    { gik: "0.1", type: "vocabulary", payload: { version: "graph/1" } },
    { gik: "0.1", type: "program", payload: { graph: {
      nodes: [
        {
          id: "lookup",
          inputs: { query: "query" },
          outputs: { answer: "answer" },
          operation: { kind: "invoke", tool: "lookup", arguments: { query: "$inputs.query" } },
        },
        {
          id: "finish",
          inputs: { answer: "answer" },
          outputs: { result: "result" },
          operation: { kind: "compute", expression: "$inputs.answer" },
        },
      ],
    } } },
    { orchestrator },
  );

  const initiating = await kernel.publish({ query: "question" });
  assert.equal(initiating.status, "suspended");
  assert.equal(initiating.execution.runningInvocations.length, 1);

  await kernel.whenIdle();
  assert.equal(kernel.state().result, "resolved");
  assert.equal(kernel.execution().status, "quiescent");
  assert.deepEqual(kernel.execution().runningInvocations, []);
});

test("synchronous and asynchronous graph execution share the same traversal", async () => {
  const asynchronous = new ContinuousGraphRuntime(graph, new JsonataExpressionProvider());
  const synchronous = new ContinuousGraphRuntime(graph, new SyncJsonataExpressionProvider());

  const asyncResult = await asynchronous.publish({ seed: 0 });
  const syncResult = synchronous.publishSync({ seed: 0 });

  assert.deepEqual(syncResult, asyncResult);
  assert.deepEqual(synchronous.snapshotTokens(), asynchronous.snapshotTokens());
  assert.deepEqual(synchronous.snapshotNodes(), asynchronous.snapshotNodes());
});

test("synchronous Kernel publication executes deterministic extension nodes", () => {
  const executed: string[] = [];
  const kernel = new Kernel(
    { gik: "0.1", type: "vocabulary", payload: { version: "compiler/1" } },
    { gik: "0.1", type: "program", payload: { graph: {
      inputs: ["source"],
      outputs: ["compiled"],
      nodes: [{
        id: "compile",
        inputs: { source: "source" },
        outputs: { compiled: "compiled" },
        operation: { kind: "extension", name: "compile" },
      }],
    } } },
    {
      expression: new SyncJsonataExpressionProvider(),
      executeGraphExtension(node, inputs) {
        executed.push(node.id);
        return { outputs: { compiled: inputs.source } };
      },
    },
  );

  const result = kernel.publishSync({ source: { id: "artifact" } });

  assert.deepEqual(executed, ["compile"]);
  assert.deepEqual(result.execution.tokens.compiled.value, { id: "artifact" });
});