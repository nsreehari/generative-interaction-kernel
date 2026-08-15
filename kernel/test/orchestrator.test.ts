// Phase 3 kernel tests: the Orchestrator seam. invoke/request/route become
// real effects the kernel runs after reduction. Request and route settle inline;
// invoke commits an initiating patch and later publishes its terminal result.

import { test } from "vitest";
import assert from "node:assert/strict";

import { Kernel } from "../src/index";
import { bufferSink, type Orchestrator, type OrchestratorEffect, type Patch } from "../src/index";

const manifest = {
  version: "orchestration-test/1",
  namespaces: ["card_data", "fetched_sources", "computed_values", "requires"],
  capabilities: {},
};

// A document an agent might generate: a refresh button that (a) moves an async
// resource machine idle -> loading and (b) invokes a fetch tool. When the tool
// resolves, it writes the rows and emits "resolved" (loading -> ready).
const asyncDoc = {
  gik: "0.1",
  type: "program",
  payload: {
    root: {
      capability: "board",
      id: "board-1",
      edges: {
        children: [
          {
            capability: "actions",
            id: "btn-refresh",
            props: { label: "Refresh" },
            edges: {
              on: {
                tap: [
                  { do: "emit", event: "load" },
                  { do: "invoke", control: { tool: "fetchOrders" } },
                ],
              },
            },
          },
        ],
      },
    },
    machines: [
      {
        id: "orders",
        context: "computed_values.orders",
        initial: "idle",
        states: {
          idle: { on: { load: "loading" } },
          loading: { on: { resolved: "ready" } },
          ready: {},
        },
      },
    ],
  },
};

test("invoke: async fetch settles as store delta + machine transition (idle->loading->ready)", async () => {
  const invocations: OrchestratorEffect[] = [];
  const orchestrator: Orchestrator = {
    async invoke(effect: OrchestratorEffect) {
      invocations.push(effect);
      if (effect.kind !== "invoke" || effect.control.tool !== "fetchOrders") return;
      return {
        ops: [{ op: "set", path: "fetched_sources.orders", value: [{ id: "order-42" }] }],
        events: [{ node: effect.node, name: "resolved" }],
      };
    },
  };

  const k = new Kernel(manifest as any, asyncDoc as any, { orchestrator });
  const patches: Patch[] = [];
  k.subscribePatches((published) => patches.push(published));
  k.init();
  assert.deepEqual((k.state() as any).computed_values.orders, { state: "idle" });

  const patch = await k.dispatch({
    node: "btn-refresh",
    name: "tap",
    actorId: "agent-endpoint",
  });

  // The initiating patch commits before the external invocation runs.
  assert.deepEqual(patch.ops, [
    { op: "set", path: "computed_values.orders.state", value: "loading" },
  ]);
  assert.equal(patch.rev, 1);

  await k.whenIdle();
  assert.deepEqual(patches[1], {
    rev: 2,
    ops: [
      { op: "set", path: "fetched_sources.orders", value: [{ id: "order-42" }] },
      { op: "set", path: "computed_values.orders.state", value: "ready" },
    ],
  });
  assert.deepEqual((k.state() as any).computed_values.orders, { state: "ready" });
  assert.deepEqual((k.state() as any).fetched_sources.orders, [{ id: "order-42" }]);
  assert.equal(invocations[0]?.actorId, "agent-endpoint");
});

test("request: a governed resolver returns a validated settlement that assigns status", async () => {
  const requests: OrchestratorEffect[] = [];
  const orchestrator: Orchestrator = {
    async request(effect) {
      requests.push(effect);
      return {
        settlement: {
          effectId: effect.effectId!,
          outcome: "resolved",
          data: { approved: true },
        },
      };
    },
  };

  const doc = {
    gik: "0.1",
    type: "program",
    payload: {
      root: {
        capability: "actions",
        id: "btn-approve",
        props: { label: "Approve" },
        edges: {
          on: {
            tap: [{
              do: "request",
              control: {
                kind: "decision",
                policy: "order-approval",
                responseSchema: {
                  type: "object",
                  required: ["approved"],
                  properties: { approved: { type: "boolean" } },
                  additionalProperties: false,
                },
              },
              data: { prompt: "Approve order?" },
            }],
            resolved: [{ do: "assign", target: "card_data.status", args: { value: "approved" } }],
          },
        },
      },
    },
  };

  const kernel = new Kernel(manifest as any, doc as any, { orchestrator });
  kernel.init();

  const patch = await kernel.dispatch({
    node: "btn-approve",
    name: "tap",
    actorId: "agent-response",
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].kind, "request");
  assert.equal(requests[0].data.prompt, "Approve order?");
  assert.equal(requests[0].actorId, "agent-response");
  assert.match(requests[0].effectId!, /^effect-/);
  assert.deepEqual(patch.ops, [
    { op: "set", path: "card_data.status", value: "approved" },
  ]);
});

test("route: routing effect reaches the orchestrator without touching the store", async () => {
  const routes: unknown[] = [];
  const orchestrator: Orchestrator = {
    async route(effect) {
      if (effect.kind === "route") routes.push(effect.control.to);
    },
  };

  const doc = {
    gik: "0.1",
    type: "program",
    payload: {
      root: {
        capability: "actions",
        id: "btn-open",
        props: { label: "Open" },
        edges: { on: { tap: [{ do: "route", control: { to: "/orders/42" } }] } },
      },
    },
  };

  const kernel = new Kernel(manifest as any, doc as any, { orchestrator });
  kernel.init();

  const patch = await kernel.dispatch({ node: "btn-open", name: "tap" });

  assert.deepEqual(routes, ["/orders/42"]);
  assert.deepEqual(patch.ops, [], "routing produces no store delta");
});

test("orchestrator settlement emits an attributable semantic outcome trace", async () => {
  const { sink, events } = bufferSink();
  const orchestrator: Orchestrator = {
    async route() {
      return { outcome: "rejected", detail: { reason: "protected-target" } };
    },
  };
  const doc = {
    gik: "0.1",
    type: "program",
    payload: {
      root: {
        capability: "actions",
        id: "proposal",
        edges: { on: { submit: [{ do: "route", control: { to: "isolate:dc-01" } }] } },
      },
    },
  };
  const kernel = new Kernel(manifest as any, doc as any, { orchestrator, sink });
  kernel.init();

  await kernel.dispatch({ node: "proposal", name: "submit", actorId: "agent-response" });

  assert.ok(events.some((event) =>
    event.event === "effect" &&
    event.detail?.phase === "outcome" &&
    event.detail?.outcome === "rejected" &&
    event.detail?.actorId === "agent-response" &&
    event.detail?.reason === "protected-target"
  ));
});

test("unhandled effect is safe: default NullOrchestrator performs nothing", async () => {
  const doc = {
    gik: "0.1",
    type: "program",
    payload: {
      root: {
        capability: "actions",
        id: "btn",
        props: { label: "Go" },
        edges: { on: { tap: [{ do: "invoke", control: { tool: "noop" } }] } },
      },
    },
  };

  const traces: Array<{ event: string; detail?: Record<string, unknown> }> = [];
  const kernel = new Kernel(manifest as any, doc as any, { sink: (t) => traces.push(t) });
  kernel.init();

  const patch = await kernel.dispatch({ node: "btn", name: "tap" });

  assert.deepEqual(patch.ops, []);
  assert.ok(
    traces.some((t) => t.event === "effect" && (t.detail as any)?.unhandled === true),
    "unhandled invoke is traced"
  );
});
