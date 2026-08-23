import assert from "node:assert/strict";
import React from "react";
import { test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer, { act } from "react-test-renderer";
import { createBlueprint, materializeBlueprint } from "@gik/blueprint";
import { createMemoryStorage } from "@gik/durable-runtime/storage/memory";
import { Kernel, ValidationError, type CapabilityDescriptor, type Json, type ResolvedNode } from "@gik/kernel";
import {
  readHostedBlueprintDeclaration,
  readBlueprintNodeDeclaration,
  resolveHostedBlueprint,
  type ReactBlueprintHostRegistry,
} from "../src/primitives/hosted-blueprint";
import {
  createHostedBlueprintProjection,
  type BlueprintHostProps,
} from "../src/primitives/blueprint-host";
import { createNativeBlueprintWorker } from "../src/durable-blueprint-worker";
import { BlueprintHost as DurableBlueprintHost } from "../src/primitives/durable-blueprint-host";
import { bundleFromJson } from "../src/primitives/bundle";
import { buildBundleRegistry } from "../src/primitives/registry";
import { buildCapabilityCatalogFromExternals } from "../src/registry";
import { renderNode } from "../src/render";
import type { CapabilityDescriptorResolver } from "../src/registry";

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

// review-r1 reassessment: createHostedBlueprintProjection is the single shared factory behind both
// in-memory BlueprintHost and DurableBlueprintHost's nested rendering. A hosted child must inherit
// resolveCapabilityDescriptors so it builds its OWN capabilityCatalog from its OWN runtime.externals
// (never a reuse of the parent's already-filtered catalog) -- this is the exact mechanism Blueprint
// Studio's Preview tab relies on when it renders the previewed Blueprint via gik:blueprint.

const strictLabelDescriptors: Record<string, CapabilityDescriptor> = {
  label: {
    propsSchema: {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    },
  },
};

function resolveStrictDescriptors(from: string): Record<string, CapabilityDescriptor> | undefined {
  return from === "strict" ? strictLabelDescriptors : undefined;
}

function nestedChildBlueprint(labelProps: Record<string, Json>) {
  return createBlueprint({
    id: "nested-preview",
    kind: "runtime-blueprint",
    version: "1.0.0",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: {
      externals: { projectionViews: { strict: { from: "strict", use: ["label"] } } },
      state: {},
    },
    cells: {
      label: {
        id: "label",
        potentialViews: {
          primary: { capability: "strict:label", props: labelProps, region: "root" },
        },
      },
    },
    presentation: { slots: ["root"], root: "root" },
  });
}

function hostedBlueprintNode(childBlueprint: ReturnType<typeof nestedChildBlueprint>): ResolvedNode {
  return {
    id: "preview-slot",
    capability: "gik:blueprint",
    visible: true,
    fallback: false,
    props: { blueprint: childBlueprint as unknown as Json },
    children: [],
  } as ResolvedNode;
}

function memoryRef(value: string): string {
  return `b64:${Buffer.from(JSON.stringify({ kind: "memory", value })).toString("base64url")}`;
}

function durableRuntime() {
  const id = crypto.randomUUID();
  const runtimeRef = memoryRef(`hosted-blueprint:${id}`);
  return {
    runtimeId: `hosted-blueprint:${id}`,
    providers: { memory: createMemoryStorage() },
    refs: { stateRef: runtimeRef, journalRef: runtimeRef, effectsQueueRef: runtimeRef },
  };
}

function durableParentBlueprint(childBlueprint: ReturnType<typeof nestedChildBlueprint>) {
  return createBlueprint({
    id: "durable-shell",
    kind: "runtime-blueprint",
    version: "1.0.0",
    tiers: [{ id: "runtime", kind: "runtime-program" }],
    recipes: [],
    runtime: { state: {} },
    cells: {
      preview: {
        id: "preview",
        blueprint: { inline: childBlueprint },
        potentialViews: {
          primary: { capability: "gik:blueprint", region: "root" },
        },
      },
    },
    presentation: { slots: ["root"], root: "root" },
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for durable hosted Blueprint");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

test("threads resolveCapabilityDescriptors into a hosted child's own BlueprintHostProps", async () => {
  let capturedProps: BlueprintHostProps | undefined;
  const resolveCapabilityDescriptors: CapabilityDescriptorResolver = resolveStrictDescriptors;
  const HostedBlueprint = createHostedBlueprintProjection({
    parentBlueprintId: "shell",
    parentInstanceId: "shell:case-7",
    contexts: {},
    resolveCapabilityDescriptors,
    renderHostedBlueprint: (props) => {
      capturedProps = props;
      return <div data-captured />;
    },
  });
  const node = hostedBlueprintNode(nestedChildBlueprint({ value: "Blueprint Studio" }));

  await act(async () => {
    TestRenderer.create(<HostedBlueprint node={node} emit={() => undefined}>{null}</HostedBlueprint>);
  });

  assert.equal(capturedProps?.resolveCapabilityDescriptors, resolveCapabilityDescriptors);
  assert.equal(capturedProps?.blueprint, node.props.blueprint);
});

test("a hosted child's own catalog (built from the threaded resolver) rejects an invalid capability prop", async () => {
  let capturedProps: BlueprintHostProps | undefined;
  const HostedBlueprint = createHostedBlueprintProjection({
    parentBlueprintId: "shell",
    parentInstanceId: "shell:case-7",
    contexts: {},
    resolveCapabilityDescriptors: resolveStrictDescriptors,
    renderHostedBlueprint: (props) => {
      capturedProps = props;
      return <div data-captured />;
    },
  });
  const invalidNode = hostedBlueprintNode(nestedChildBlueprint({ bogus: true }));

  await act(async () => {
    TestRenderer.create(<HostedBlueprint node={invalidNode} emit={() => undefined}>{null}</HostedBlueprint>);
  });

  // This is exactly what the child's own BlueprintHost does with what it received: build its own
  // catalog from its own runtime.externals using the inherited resolver, then materialize with it.
  assert.ok(capturedProps?.resolveCapabilityDescriptors);
  const childBlueprint = capturedProps!.blueprint;
  const childCatalog = buildCapabilityCatalogFromExternals(
    childBlueprint.payload.runtime?.externals,
    capturedProps!.resolveCapabilityDescriptors!,
  );
  assert.deepEqual(Object.keys(childCatalog), ["strict:label"]);

  const materialized = materializeBlueprint({ blueprint: childBlueprint, capabilityCatalog: childCatalog });
  assert.throws(() => new Kernel(materialized.payload.vocabulary, materialized.payload.program), ValidationError);
});

test("a hosted child's own catalog (built from the threaded resolver) still passes a well-formed capability prop", async () => {
  let capturedProps: BlueprintHostProps | undefined;
  const HostedBlueprint = createHostedBlueprintProjection({
    parentBlueprintId: "shell",
    parentInstanceId: "shell:case-7",
    contexts: {},
    resolveCapabilityDescriptors: resolveStrictDescriptors,
    renderHostedBlueprint: (props) => {
      capturedProps = props;
      return <div data-captured />;
    },
  });
  const validNode = hostedBlueprintNode(nestedChildBlueprint({ value: "Blueprint Studio" }));

  await act(async () => {
    TestRenderer.create(<HostedBlueprint node={validNode} emit={() => undefined}>{null}</HostedBlueprint>);
  });

  const childBlueprint = capturedProps!.blueprint;
  const childCatalog = buildCapabilityCatalogFromExternals(
    childBlueprint.payload.runtime?.externals,
    capturedProps!.resolveCapabilityDescriptors!,
  );
  const materialized = materializeBlueprint({ blueprint: childBlueprint, capabilityCatalog: childCatalog });
  assert.doesNotThrow(() => new Kernel(materialized.payload.vocabulary, materialized.payload.program));
});

test("a durable hosted child builds its own capability catalog from the inherited resolver", async () => {
  const validBlueprint = durableParentBlueprint(nestedChildBlueprint({ value: "Blueprint Studio" }));
  const validRuntime = durableRuntime();
  const validWorker = createNativeBlueprintWorker({
    blueprint: validBlueprint,
    runtime: validRuntime,
    native: {},
  });
  const resolvedProviders: string[] = [];
  let renderer: TestRenderer.ReactTestRenderer | undefined;

  await act(async () => {
    renderer = TestRenderer.create(
      <DurableBlueprintHost
        blueprint={validBlueprint}
        runtime={validRuntime}
        worker={validWorker}
        resolveCapabilityDescriptors={(from) => {
          resolvedProviders.push(from);
          return resolveStrictDescriptors(from);
        }}
      />,
    );
  });
  try {
    await waitFor(() => resolvedProviders.includes("strict")).catch((error) => {
      throw new Error(
        `${String(error)}; rendered=${JSON.stringify(renderer?.toJSON())}; providers=${resolvedProviders.join(",")}`,
      );
    });
  } finally {
    await act(async () => renderer?.unmount());
  }
}, 10_000);
