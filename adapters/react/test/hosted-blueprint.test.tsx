import assert from "node:assert/strict";
import { test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createBlueprint } from "@gik/blueprint";
import type { Json, ResolvedNode } from "@gik/kernel";
import {
  readHostedBlueprintDeclaration,
  readBlueprintNodeDeclaration,
  resolveHostedBlueprint,
  type ReactBlueprintHostRegistry,
} from "../src/primitives/hosted-blueprint";
import { createHostedBlueprintProjection } from "../src/primitives/blueprint-host";
import { bundleFromJson } from "../src/primitives/bundle";
import { buildBundleRegistry } from "../src/primitives/registry";
import { renderNode } from "../src/render";

const child = createBlueprint({
  id: "analysis",
  kind: "runtime-blueprint",
  version: "1.0.0",
  tiers: [{ id: "runtime", kind: "runtime-program" }],
  recipes: [],
  runtime: {},
});

const context = {
  parentBlueprintId: "shell",
  parentInstanceId: "shell:case-7",
  cellId: "analysis-slot",
};

test("resolves a canonical child reference with parent instance context", async () => {
  let receivedContext: typeof context | undefined;
  const registry: ReactBlueprintHostRegistry = {
    resolveArtifact: () => child,
    resolve(reference, nextContext) {
      receivedContext = nextContext;
      return { reference: { ...reference, version: reference.version ?? "1.0.0" }, blueprint: child };
    },
  };

  const resolved = await resolveHostedBlueprint({ $ref: "blueprint:analysis" }, registry, context);
  assert.equal(resolved.blueprint, child);
  assert.deepEqual(receivedContext, context);
});

test("fails closed when a registry resolves a different Blueprint", async () => {
  const registry: ReactBlueprintHostRegistry = {
    resolveArtifact: () => child,
    resolve() {
      return { reference: { scheme: "blueprint", id: "other", version: "1.0.0" }, blueprint: child };
    },
  };

  await assert.rejects(
    resolveHostedBlueprint({ $ref: "blueprint:analysis@1.0.0" }, registry, context),
    /mismatched definition/,
  );
});

test("mounts inline child artifacts without a host registry", async () => {
  const resolved = await resolveHostedBlueprint({ inline: child }, undefined, context);
  assert.deepEqual(resolved.reference, { scheme: "blueprint", id: "analysis", version: "1.0.0" });
  assert.equal(resolved.blueprint, child);
});

test("rejects malformed child declarations from render-node JSON", () => {
  assert.equal(readHostedBlueprintDeclaration({ $ref: "blueprint:analysis", inline: {} }), undefined);
  assert.equal(readHostedBlueprintDeclaration({ $ref: 7 }), undefined);
  assert.deepEqual(readHostedBlueprintDeclaration({ $ref: "blueprint:analysis" }), {
    $ref: "blueprint:analysis",
  });
});

test("a projection-free program remains a runnable React host bundle", () => {
  const bundle = bundleFromJson({
    vocabulary: {
      gik: "0.1",
      type: "vocabulary",
      payload: { version: "headless/1", namespaces: [], capabilities: {} },
    },
    program: {
      gik: "0.1",
      type: "program",
      payload: { handlers: [] },
    },
  });

  assert.equal(bundle.program.payload.root, undefined);
});

test("renders a structural projection for a fallback-marked hosted node", () => {
  const bundle = bundleFromJson({
    vocabulary: {
      gik: "0.1",
      type: "vocabulary",
      payload: { version: "headless/1", namespaces: [], capabilities: {} },
    },
    program: {
      gik: "0.1",
      type: "program",
      payload: { handlers: [] },
    },
  });
  const registry = buildBundleRegistry(bundle, undefined, {
    "gik:blueprint": () => <div data-hosted-blueprint />,
  });
  const node = {
    id: "hosted-child",
    capability: "gik:blueprint",
    visible: true,
    fallback: true,
    props: {},
    children: [],
  } as ResolvedNode;

  const markup = renderToStaticMarkup(renderNode(node, registry, () => undefined));

  assert.match(markup, /data-hosted-blueprint/);
  assert.doesNotMatch(markup, /data-fallback/);
});

test("reads a direct Blueprint artifact from the public gik:blueprint prop", () => {
  assert.deepEqual(readBlueprintNodeDeclaration({ blueprint: child as unknown as Json }), { inline: child });
});

test("renders nothing while a hosted Blueprint binding is empty", () => {
  const HostedBlueprint = createHostedBlueprintProjection({
    parentBlueprintId: "shell",
    parentInstanceId: "shell:case-7",
    contexts: {},
  });
  for (const props of [{}, { blueprint: null }]) {
    const node = {
      id: "analysis-slot",
      capability: "gik:blueprint",
      visible: true,
      fallback: false,
      props,
      children: [],
    } as ResolvedNode;

    const markup = renderToStaticMarkup(
      <HostedBlueprint node={node} emit={() => undefined}>{null}</HostedBlueprint>,
    );

    assert.equal(markup, "");
  }
});