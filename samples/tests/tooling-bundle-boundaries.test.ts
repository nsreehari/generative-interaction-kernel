import assert from "node:assert/strict";
import { test } from "vitest";
import { unwrap } from "@gik/kernel";
import { buildBundleRegistry } from "@gik/react";
import { PRIMITIVE_CAPABILITIES } from "../bundles/floor/projection_views/capabilities";
import { FLOOR_COMPONENTS } from "../bundles/floor/projection_views";
import {
  createDemoRunnerBundle,
  createDemoRunnerHostBundle,
  createGikControlHarnessBundle,
} from "../../packages/demo-runner-host/src";

function findNode(root: ReturnType<typeof unwrap<"program">>["root"], id: string): typeof root | undefined {
  if (root.id === id) return root;
  for (const child of root.edges?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

test("demo tooling uses one bundle for runner and control harness", () => {
  let selectedDemo: string | undefined;
  let externalContext: Record<string, unknown> | undefined;
  const bundle = createDemoRunnerHostBundle(undefined, {
    onSelectDemo: (value) => { selectedDemo = value; },
    onSetExternalContext: (value) => { externalContext = value; },
  });
  const vocabulary = unwrap(bundle.vocabulary);
  const program = unwrap(bundle.program);

  assert.deepEqual(vocabulary.namespaces, ["runner", "inspector"]);
  assert.deepEqual(vocabulary.contexts, ["demo", "control"]);
  assert.equal(program.root.capability, "demo:tooling");
  assert.equal(findNode(program.root, "demo-runner")?.capability, "demo:runner");
  assert.equal(findNode(program.root, "gik-control-harness")?.capability, "harness:shell");
  assert.equal(findNode(program.root, "control-context-form")?.capability, "ui:form");
  assert.equal((vocabulary.capabilities["ui:form"].propsSchema as { $id?: string }).$id, "https://gik.dev/schemas/ui-form.schema.json");

  bundle.effectHandlers?.selectDemo?.({ payload: { value: "next-demo" } } as never);
  bundle.effectHandlers?.setExternalContext?.({ payload: { values: { surface: "mobile" } } } as never);
  assert.equal(selectedDemo, "next-demo");
  assert.deepEqual(externalContext, { surface: "mobile" });
});

test("inspector bundle depends only on the generic control inspection context", () => {
  const bundle = createGikControlHarnessBundle();
  const vocabulary = unwrap(bundle.vocabulary);
  const program = unwrap(bundle.program);
  const serializedProgram = JSON.stringify(program);

  assert.deepEqual(vocabulary.namespaces, ["inspector"]);
  assert.deepEqual(vocabulary.contexts, ["control"]);
  assert.match(serializedProgram, /control\.inspection/);
  assert.doesNotMatch(serializedProgram, /soc\.|demo\./);
  assert.deepEqual(Object.keys(bundle.state ?? {}), ["inspector"]);
});

test("control harness context form uses the canonical floor form and host callback", () => {
  let received: Record<string, unknown> | undefined;
  const bundle = createGikControlHarnessBundle({
    inspector: {
      ui: { activeTab: "context", visible: true, expanded: true },
      contextFormSpec: { fields: { properties: { surface: { type: "string", enum: ["desktop", "mobile"] } } } },
      externalContext: { surface: "desktop" },
    },
  }, (values) => { received = values; });
  const vocabulary = unwrap(bundle.vocabulary);
  const program = unwrap(bundle.program);
  const contextForm = program.root.edges?.children?.find((node) => node.id === "control-context-form");

  assert.equal((PRIMITIVE_CAPABILITIES.form.propsSchema as { $id?: string }).$id, "https://gik.dev/schemas/ui-form.schema.json");
  assert.deepEqual(vocabulary.externals?.effectHandlers, ["setExternalContext"]);
  assert.deepEqual(vocabulary.externals?.projectionViews?.ui, { from: "floor", use: ["form"] });
  assert.equal(contextForm?.capability, "ui:form");
  assert.equal(contextForm?.edges?.read?.value, "inspector.externalContext");
  assert.deepEqual(contextForm?.edges?.on?.save, [{ do: "invoke", args: { tool: "setExternalContext" } }]);

  const handler = bundle.effectHandlers?.setExternalContext;
  assert.ok(handler);
  handler({ payload: { values: { surface: "mobile" } } } as never);
  assert.deepEqual(received, { surface: "mobile" });
  assert.equal(buildBundleRegistry(bundle, (from) => from === "floor" ? FLOOR_COMPONENTS : undefined).get("ui:form"), FLOOR_COMPONENTS.form);
});

test("runner keeps scenario state in demo and target exchange in control", () => {
  const bundle = createDemoRunnerBundle();
  const vocabulary = unwrap(bundle.vocabulary);
  const program = JSON.stringify(unwrap(bundle.program));

  assert.deepEqual(vocabulary.namespaces, ["runner"]);
  assert.deepEqual(vocabulary.contexts, ["demo", "control"]);
  assert.match(program, /demo\.presenter/);
  assert.match(program, /control\.receipt/);
  assert.doesNotMatch(program, /soc\./);
  assert.deepEqual(Object.keys(bundle.state ?? {}), ["runner"]);
});