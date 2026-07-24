// ADR-0020: ObservabilitySink reference sinks + the fixed trace points. Verifies the kernel
// emits traces at the documented points and that the reference sinks collect/format them.

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  InMemoryStateModel,
  Kernel,
  TRACE_POINTS,
  assign,
  bufferSink,
  consoleSink,
  formatTrace,
  multiSink,
  node,
  type ProjectedVocabularyManifest,
} from "../src/index";

const manifest = {
  gik: "0.1",
  type: "vocabulary",
  payload: {
    version: "obs-demo/1.0",
    expression: "jsonata",
    namespaces: ["card_data"],
    capabilities: { widget: { emits: ["go"] } },
  } as ProjectedVocabularyManifest,
};

const document = {
  gik: "0.1",
  type: "program",
  payload: {
    root: node("widget", "w", { on: { go: [assign("card_data.x", 1)] } }),
  },
};

function kernelWith(sink: (t: never) => void) {
  const state = new InMemoryStateModel(["card_data"]);
  return new Kernel(manifest, document, { state, sink: sink as never });
}

test("bufferSink collects action + resolve traces at the documented points", async () => {
  const { sink, events } = bufferSink();
  const k = kernelWith(sink as never);
  k.init();

  await k.resolve();
  assert.ok(
    events.some((e) => e.event === "resolve" && e.node === "w"),
    "resolve trace emitted for a known-capability node"
  );

  await k.dispatch({ node: "w", name: "go" });
  assert.ok(
    events.some((e) => e.event === "action" && e.detail?.do === "assign"),
    "action trace emitted for the assign"
  );

  // Every emitted kind is within the closed TRACE_POINTS set.
  for (const e of events) {
    assert.ok(
      (TRACE_POINTS as readonly string[]).includes(e.event),
      `trace kind '${e.event}' is a declared trace point`
    );
  }
});

test("event actor provenance flows into reducer traces", async () => {
  const { sink, events } = bufferSink();
  const k = kernelWith(sink as never);
  k.init();

  await k.dispatch({ node: "w", name: "go", actorId: "agent-triage" });

  assert.ok(
    events.some(
      (e) =>
        e.event === "action" &&
        e.detail?.do === "assign" &&
        e.detail?.actorId === "agent-triage"
    ),
    "action trace attributes the mutation to the emitting actor"
  );
});

test("formatTrace renders a stable line and consoleSink writes it", () => {
  const line = formatTrace({ event: "action", node: "w", detail: { do: "assign" } });
  assert.equal(line, 'ACTION node=w {"do":"assign"}');

  const written: string[] = [];
  const sink = consoleSink({ log: (m) => written.push(m) });
  sink({ event: "transition", node: "flow", detail: { to: "done" } });
  assert.deepEqual(written, ['TRANSITION node=flow {"to":"done"}']);
});

test("multiSink fans one trace out to every sink", () => {
  const a = bufferSink();
  const b = bufferSink();
  const fan = multiSink(a.sink, b.sink);
  fan({ event: "validate", detail: { ok: true } });
  assert.equal(a.events.length, 1);
  assert.equal(b.events.length, 1);
});
