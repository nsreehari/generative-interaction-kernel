import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { unwrap, type Json } from "@gik/kernel";
import { loadBundleRuntime } from "@gik/react";

import {
  GikComponent,
  createGikComponentDeclarativeBundle,
  materializeActionBoardTrial,
} from "../src";

test("GikComponent maps typed data and spec to a primitive contract", () => {
  const markup = renderToStaticMarkup(
    <GikComponent
      kind="primitive:chart"
      spec={{
        kind: "bar",
        title: "Requests",
        fields: { label: "hour", value: "count" },
      }}
      data={[{ hour: "09:00", count: 12 }]}
    />,
  );

  assert.match(markup, /Requests/);
  assert.match(markup, /09:00/);
});

test("GikComponent maps generic data to a semantic component's declared data prop", () => {
  const markup = renderToStaticMarkup(
    <GikComponent
      kind="semantic:timeline"
      variant="compact"
      spec={JSON.parse(JSON.stringify({
        title: "Release history",
        fields: { id: "id", title: "title", timestamp: "time" },
      }))}
      data={JSON.parse(JSON.stringify([
        { id: "release-1", title: "Version 1.0", time: "2026-08-02" },
      ]))}
    />,
  );

  assert.match(markup, /Release history/);
  assert.match(markup, /Version 1.0/);
});

test("GikComponent composes children for slot primitives", () => {
  const markup = renderToStaticMarkup(
    <GikComponent kind="primitive:growing-container" componentProps={{ followEnd: "off" }}>
      Stream content
    </GikComponent>,
  );

  assert.match(markup, /gik-growing-container/);
  assert.match(markup, /Stream content/);
});

test("GikComponent rejects data for components without a data prop", () => {
  assert.throws(
    () => renderToStaticMarkup(<GikComponent kind="primitive:growing-container" data={{}} />),
    /does not declare a data prop/,
  );
});

test("GikComponentDeclarative wraps one canonical nodeJson with package vocabulary and state", async () => {
  const bundle = createGikComponentDeclarativeBundle({
    id: "request-chart",
    capability: "primitive:chart",
    props: {
      spec: {
        kind: "pie",
        title: "Request share",
        fields: { label: "name", value: "count" },
      },
    },
    edges: { read: { points: "report.points" } },
  }, {
    state: { report: { points: [{ name: "API", count: 7 }] } },
    effectHandlers: {},
    contexts: {},
  });

  const vocabulary = unwrap(bundle.vocabulary);
  assert.deepEqual(vocabulary.externals?.projectionViews, {
    primitive: { from: "primitive", use: ["chart"] },
  });
  assert.ok("primitive:chart" in vocabulary.capabilities);

  const runtime = loadBundleRuntime(bundle);
  await runtime.controller.start();
  assert.deepEqual(runtime.controller.getTree()?.props.points, [{ name: "API", count: 7 }]);
});

test("GikComponentDeclarative routes canonical edges.on invoke actions to runtime handlers", async () => {
  let receivedPayload: Record<string, Json> | undefined;
  const props = materializeActionBoardTrial().props;
  const bundle = createGikComponentDeclarativeBundle({
    id: "action-board",
    capability: "semantic:action-board",
    props,
    edges: {
      on: {
        action: [{ do: "invoke", args: { tool: "captureAction" } }],
      },
    },
  }, {
    state: {},
    contexts: {},
    effectHandlers: {
      captureAction: ({ payload }) => { receivedPayload = payload; },
    },
  });

  assert.deepEqual(unwrap(bundle.vocabulary).externals?.effectHandlers, ["captureAction"]);
  const runtime = loadBundleRuntime(bundle);
  await runtime.controller.start();
  await runtime.controller.emit("action-board", "action", { id: "disable-account" });
  assert.deepEqual(receivedPayload, { id: "disable-account" });
});