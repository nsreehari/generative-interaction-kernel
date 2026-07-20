import assert from "node:assert/strict";
import { test } from "vitest";

import { createControlHost } from "./service";
import { processContinuityQueue } from "./continuity-worker";
import type { Checkpoint, GIKMessage, OrchestratorEffect } from "@gik/kernel";
import { SseFrameParser } from "@gik/transport-http-sse";

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function callMcp<T>(baseUrl: string, path: string, name: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const reply = (await response.json()) as { result: { structuredContent: T } };
  return reply.result.structuredContent;
}

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
  assert.equal(rollback.rev, 3);
  assert.ok(rollback.ops.some((op) => op.path === "card_data"));
  assert.ok(rollback.ops.some((op) => op.path === "payments"));

  const compensation = (await call("compensate", { effects: fired.map((e) => e.effect).reverse() })).result
    .structuredContent as { rev: number; ops: Array<{ path: string; value?: unknown }> };
  assert.equal(compensation.rev, 4);
  assert.ok(compensation.ops.some((op) => op.path === "payments.refunded" && op.value === true));

  await host.stop();
});

test("background work continues over MCP while SSE is detached and replays on resume", async () => {
  const host = createControlHost({ demo: "continuity", port: 0, hostName: "127.0.0.1" });
  const baseUrl = await host.listen();

  const initialController = new AbortController();
  const initial = await fetch(`${baseUrl}/gik/stream`, {
    headers: { Accept: "text/event-stream" },
    signal: initialController.signal,
  });
  assert.equal(initial.status, 200);
  initialController.abort();

  const queued = await callMcp<{ rev: number }>(baseUrl, "/mcp-control", "emit", {
    event: { node: "continuity-controller", name: "queue", payload: { actorId: "mcp-control" } },
  });
  assert.equal(queued.rev, 1);

  const worker = await processContinuityQueue(baseUrl);
  assert.deepEqual(worker, { processed: true, rev: 2 });

  const state = await callMcp<{
    continuity: { job: { status: string; result: string; requestedBy: string; completedBy: string } };
  }>(
    baseUrl,
    "/mcp",
    "getState",
    {}
  );
  assert.deepEqual(state.continuity.job, {
    status: "completed",
    result: "background-analysis-ready",
    requestedBy: "mcp-control",
    completedBy: "background-worker",
  });

  const resumedFrames: GIKMessage[] = [];
  const resumeController = new AbortController();
  const resumed = await fetch(`${baseUrl}/gik/stream?fromRev=0`, {
    headers: { Accept: "text/event-stream" },
    signal: resumeController.signal,
  });
  const parser = new SseFrameParser();
  const reader = resumed.body!.getReader();
  const decoder = new TextDecoder();
  const readLoop = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        resumedFrames.push(...parser.push(decoder.decode(value, { stream: true })));
      }
    } catch {
      // The test aborts after both replayed patches arrive.
    }
  })();

  await waitFor(() => resumedFrames.length >= 2);
  assert.deepEqual(
    resumedFrames.map((message) => message.type),
    ["patch", "patch"]
  );
  assert.deepEqual(
    resumedFrames.map((message) => (message as { payload: { rev: number } }).payload.rev),
    [1, 2]
  );

  resumeController.abort();
  await readLoop;
  await host.stop();
});