// Phase 3 kernel tests: the Orchestrator seam. invoke/confirm/route become
// real effects the kernel runs after reduction; their results (store deltas and
// follow-up events) settle within the same dispatch. Async data is modeled as
// machine states (idle -> loading -> ready).

import { test } from "vitest";
import assert from "node:assert/strict";

import { Kernel } from "../src/index";
import { bufferSink, type Orchestrator, type OrchestratorEffect } from "../src/index";

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
  type: "document",
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
                  { do: "invoke", args: { tool: "fetchOrders" } },
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
      if (effect.tool !== "fetchOrders") return;
      return {
        ops: [{ op: "set", path: "fetched_sources.orders", value: [{ id: "order-42" }] }],
        events: [{ node: effect.node, name: "resolved" }],
      };
    },
  };

  const k = new Kernel(manifest as any, asyncDoc as any, { orchestrator });
  k.init();
  assert.deepEqual((k.state() as any).computed_values.orders, { state: "idle" });

  const patch = await k.dispatch({
    node: "btn-refresh",
    name: "tap",
    actorId: "agent-endpoint",
  });

  // Settled ops within one dispatch: loading (emit) -> orders written (invoke) -> ready (resolved).
  assert.deepEqual(patch.ops, [
    { op: "set", path: "computed_values.orders.state", value: "loading" },
    { op: "set", path: "fetched_sources.orders", value: [{ id: "order-42" }] },
    { op: "set", path: "computed_values.orders.state", value: "ready" },
  ]);
  assert.deepEqual((k.state() as any).computed_values.orders, { state: "ready" });
  assert.deepEqual((k.state() as any).fetched_sources.orders, [{ id: "order-42" }]);
  assert.equal(patch.rev, 1, "one dispatch is one rev regardless of fan-out");
  assert.equal(invocations[0]?.actorId, "agent-endpoint");
});

test("confirm: HITL approval returns a follow-up event that assigns status", async () => {
  const confirmations: OrchestratorEffect[] = [];
  const orchestrator: Orchestrator = {
    async confirm(effect) {
      confirmations.push(effect);
      // Simulate the human approving: emit the configured follow-up event.
      const onConfirm = effect.args.onConfirm;
      return typeof onConfirm === "string"
        ? { events: [{ node: effect.node, name: onConfirm }] }
        : undefined;
    },
  };

  const doc = {
    gik: "0.1",
    type: "document",
    payload: {
      root: {
        capability: "actions",
        id: "btn-approve",
        props: { label: "Approve" },
        edges: {
          on: {
            tap: [{ do: "confirm", args: { message: "Approve order?", onConfirm: "approved" } }],
            approved: [{ do: "assign", target: "card_data.status", args: { value: "approved" } }],
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

  assert.equal(confirmations.length, 1);
  assert.equal(confirmations[0].args.message, "Approve order?");
  assert.equal(confirmations[0].actorId, "agent-response");
  assert.deepEqual(patch.ops, [
    { op: "set", path: "card_data.status", value: "approved" },
  ]);
});

test("route: routing effect reaches the orchestrator without touching the store", async () => {
  const routes: unknown[] = [];
  const orchestrator: Orchestrator = {
    async route(effect) {
      routes.push(effect.to);
    },
  };

  const doc = {
    gik: "0.1",
    type: "document",
    payload: {
      root: {
        capability: "actions",
        id: "btn-open",
        props: { label: "Open" },
        edges: { on: { tap: [{ do: "route", args: { to: "/orders/42" } }] } },
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
    type: "document",
    payload: {
      root: {
        capability: "actions",
        id: "proposal",
        edges: { on: { submit: [{ do: "route", args: { to: "isolate:dc-01" } }] } },
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
    type: "document",
    payload: {
      root: {
        capability: "actions",
        id: "btn",
        props: { label: "Go" },
        edges: { on: { tap: [{ do: "invoke", args: { tool: "noop" } }] } },
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
