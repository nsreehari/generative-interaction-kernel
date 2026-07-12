import assert from "node:assert/strict";
import { test } from "vitest";

import { createControlHost } from "./service";
import type { Checkpoint, OrchestratorEffect } from "@gik/kernel";

test("rollback demo mode serves checkpoint -> emit -> effectsSince -> restore -> compensate over /mcp-control", async () => {
  const host = createControlHost({ demo: "rollback", port: 0, hostName: "127.0.0.1" });
  const baseUrl = await host.listen();

  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await fetch(`${baseUrl}/mcp-control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    return (await res.json()) as { result: { structuredContent: unknown } };
  };

  const before = (await call("checkpoint", {})).result.structuredContent as Checkpoint;
  assert.equal(before.rev, 0);

  const forward = (await call("emit", { event: { node: "btn-charge", name: "tap" } })).result
    .structuredContent as { rev: number };
  assert.equal(forward.rev, 1);

  const fired = (await call("effectsSince", { rev: before.rev })).result.structuredContent as Array<{
    effect: OrchestratorEffect;
  }>;
  assert.equal(fired.length, 1);
  assert.equal(fired[0].effect.tool, "charge");

  const rollback = (await call("restore", { checkpoint: before })).result.structuredContent as {
    rev: number;
    ops: Array<{ path: string }>;
  };
  assert.equal(rollback.rev, 2);
  assert.ok(rollback.ops.some((op) => op.path === "card_data"));
  assert.ok(rollback.ops.some((op) => op.path === "payments"));

  const compensation = (await call("compensate", { effects: fired.map((e) => e.effect).reverse() })).result
    .structuredContent as { rev: number; ops: Array<{ path: string; value?: unknown }> };
  assert.equal(compensation.rev, 3);
  assert.ok(compensation.ops.some((op) => op.path === "payments.refunded" && op.value === true));

  await host.stop();
});