import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { unwrap, type Json } from "@gik/kernel";
import { loadBundleRuntime } from "@gik/react";

import {
  GikComponent,
  componentDefinitions,
  createGikComponentDeclarativeBundle,
  materializeWorkSetTrial,
} from "../src/shared";

test("every canonical component renders through GikComponent", () => {
  for (const definition of Object.values(componentDefinitions)) {
    const trial = definition.materializeTrial();
    const markup = renderToStaticMarkup(
      <GikComponent
        kind={definition.capability as React.ComponentProps<typeof GikComponent>["kind"]}
        componentProps={trial.props}
      />,
    );

    assert.ok(markup.length > 0, definition.capability);
  }
});

test("every canonical component is addressable through GikComponentDeclarative", () => {
  for (const definition of Object.values(componentDefinitions)) {
    const trial = definition.materializeTrial();
    const bundle = createGikComponentDeclarativeBundle({
      id: trial.id,
      capability: definition.capability,
      props: trial.props,
    });
    const vocabulary = unwrap(bundle.vocabulary);
    const [layer, name] = definition.capability.split(":");

    assert.ok(definition.capability in vocabulary.capabilities, definition.capability);
    assert.deepEqual(vocabulary.externals?.projectionViews, {
      [layer]: { from: layer, use: [name] },
    });
  }
});

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

test("chart optionally presents a summary and exact-value table", () => {
  const markup = renderToStaticMarkup(
    <GikComponent
      kind="primitive:chart"
      spec={{
        kind: "pie",
        title: "Holdings value",
        fields: { label: "ticker", value: "value" },
        summary: { label: "Total portfolio value", prefix: "$" },
        table: {
          label: "Portfolio positions",
          columns: [{ field: "ticker", label: "Ticker" }, { field: "value", label: "Value", prefix: "$" }],
        },
      }}
      data={[{ ticker: "AAPL", value: 425.86 }]}
      componentProps={{ summaryValue: 425.86 }}
    />,
  );

  assert.match(markup, /Total portfolio value/);
  assert.match(markup, /\$425\.86/);
  assert.match(markup, /aria-label="Portfolio positions"/);
});

test("GikComponent renders a Fluent component through its canonical contract", () => {
  const markup = renderToStaticMarkup(
    <GikComponent
      kind="fluent:button"
      variant="primary"
      componentProps={{ label: "Analyze report" }}
    />,
  );

  assert.match(markup, /Analyze report/);
});

test("GikComponent maps generic data to a semantic component's declared data prop", () => {
  const markup = renderToStaticMarkup(
    <GikComponent
      kind="semantic:event-series"
      variant="chronology"
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

test("component schemas do not accept Blueprint composition as component props", () => {
  assert.equal(componentDefinitions.container.validate({
    variant: "column",
    layout: { slots: [{ key: "details", slot: "secondary" }] },
  }).ok, false);
});

test("GikComponentDeclarative exposes Fluent components through the fluent provider", () => {
  const bundle = createGikComponentDeclarativeBundle({
    id: "analyze-report",
    capability: "fluent:button",
    props: { label: "Analyze report", variant: "primary" },
  });

  const vocabulary = unwrap(bundle.vocabulary);
  assert.deepEqual(vocabulary.externals?.projectionViews, {
    fluent: { from: "fluent", use: ["button"] },
  });
  assert.ok("fluent:button" in vocabulary.capabilities);
});

test("GikComponentDeclarative routes canonical edges.on invoke actions to runtime handlers", async () => {
  let receivedPayload: Record<string, Json> | undefined;
  const props = materializeWorkSetTrial().props;
  const bundle = createGikComponentDeclarativeBundle({
    id: "work-set",
    capability: "semantic:work-set",
    props,
    edges: {
      on: {
        move: [{ do: "invoke", control: { tool: "captureAction" } }],
      },
    },
  }, {
    state: {},
    contexts: {},
    effectHandlers: {
      captureAction: ({ data }) => { receivedPayload = data; },
    },
  });

  assert.deepEqual(unwrap(bundle.vocabulary).externals?.effectHandlers, ["captureAction"]);
  const runtime = loadBundleRuntime(bundle);
  await runtime.controller.start();
  await runtime.controller.emit("work-set", "move", { id: "disable-account" });
  assert.deepEqual(receivedPayload, { id: "disable-account" });
});

test("GikComponentDeclarative resolves datetime, Gantt, infinite canvas, and attack path through canonical providers", () => {
  for (const capability of ["primitive:datetime", "primitive:gantt", "primitive:infinite-canvas", "security:attack-path"] as const) {
    const definition = componentDefinitions[capability.split(":")[1] as keyof typeof componentDefinitions];
    const trial = definition.materializeTrial();
    const bundle = createGikComponentDeclarativeBundle({ id: trial.id, capability, props: trial.props });
    const [layer, name] = capability.split(":");
    assert.deepEqual(unwrap(bundle.vocabulary).externals?.projectionViews, {
      [layer]: { from: layer, use: [name] },
    });
  }
});