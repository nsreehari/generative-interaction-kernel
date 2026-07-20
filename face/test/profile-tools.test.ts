// Unit checks for the generic profile->tools engine: declarative tools materialize from a profile's
// `authoring` block and bind to a family registry (validators/checks/projectors/describe). Verifies
// the declarative validate (structural + named checks), describe, project, and fail-fast binding.

import assert from "node:assert/strict";
import { test } from "vitest";

import { toolsFromProfile, type AuthoringRegistry } from "../src/pure/profile-tools";
import type { Profile } from "../../profile/src/profile-core";

const profile: Profile = {
  id: "demo",
  kind: "demo-profile",
  version: "0.1",
  layers: [
    {
      id: "spec",
      kind: "spec",
      schema: "spec.schema",
      description: "the demo spec layer",
      input: {
        properties: {
          kind: { type: "string" },
          name: { type: "string" },
        },
        required: ["kind"],
        validators: [{ kind: "jsonata", expr: '$exists(name) = false or $length(name) > 0', message: 'spec.name must be non-empty when provided' }],
      },
    },
    { id: "view", kind: "view" },
  ],
  recipes: [],
  authoring: {
    tools: [
      { id: "describeSpec", op: "describe", layer: "spec", agentSafe: true },
      { id: "validateSpec", op: "validate", layer: "spec", checks: ["non-empty-name"], agentSafe: true },
      { id: "projectView", op: "project", projector: "spec->view", agentSafe: true },
      {
        id: "projectExpr",
        op: "project",
        projectExpression: '({"view": input.kind, "name": input.name})',
        inputSchema: {
          type: "object",
          properties: { input: { type: "object" } },
          required: ["input"],
          additionalProperties: false,
        },
        agentSafe: true,
      },
    ],
  },
};

const registry: AuthoringRegistry = {
  validators: {
    "spec.schema": (args) => {
      const spec = args.spec as { kind?: unknown } | undefined;
      return typeof spec?.kind === "string"
        ? { ok: true, errors: [], warnings: [] }
        : { ok: false, errors: [{ detail: "spec.kind (string) is required" }], warnings: [] };
    },
  },
  checks: {
    "non-empty-name": (args) => {
      const spec = args.spec as { name?: unknown } | undefined;
      return typeof spec?.name === "string" && spec.name.length > 0
        ? {}
        : { warnings: [{ code: "empty-name", detail: "spec.name is empty" }] };
    },
  },
  projectors: {
    "spec->view": (args) => ({ view: (args.input as { kind?: string })?.kind ?? "unknown" }),
  },
  describe: {
    spec: () => ({ layer: "spec", fields: ["kind", "name"] }),
  },
};

test("materializes one McpTool per declaration, carrying agentSafe + input schema", () => {
  const tools = toolsFromProfile(profile, registry);
  assert.deepEqual(tools.map((t) => t.name).sort(), ["describeSpec", "projectExpr", "projectView", "validateSpec"]);
  assert.ok(tools.every((t) => t.agentSafe === true));
  const validate = tools.find((t) => t.name === "validateSpec")!;
  assert.equal((validate.inputSchema as { required: string[] }).required[0], "spec");
  assert.equal((((validate.inputSchema as { properties: { spec: { properties: { kind: { type: string } } } } }).properties.spec.properties.kind.type)), "string");
});

test("describe binds to the registry describe hook", () => {
  const describe = toolsFromProfile(profile, registry).find((t) => t.name === "describeSpec")!;
  assert.deepEqual(describe.handler({}), { layer: "spec", fields: ["kind", "name"] });
});

test("validate runs structural validator then named checks; checks skipped on structural error", () => {
  const validate = toolsFromProfile(profile, registry).find((t) => t.name === "validateSpec")!;
  // structural failure short-circuits the semantic checks
  assert.deepEqual(validate.handler({ spec: {} }), {
    ok: false,
    errors: [{ detail: "spec.kind is required" }, { detail: "spec.kind (string) is required" }],
    warnings: [],
  });
  // structural passes, check emits a warning
  assert.deepEqual(validate.handler({ spec: { kind: "x" } }), {
    ok: true,
    errors: [],
    warnings: [{ code: "empty-name", detail: "spec.name is empty" }],
  });
  // both pass
  assert.deepEqual(validate.handler({ spec: { kind: "x", name: "ok" } }), {
    ok: true,
    errors: [],
    warnings: [],
  });
});

test("validate also enforces declarative form rules from the inline schema", () => {
  const validate = toolsFromProfile(profile, registry).find((t) => t.name === "validateSpec")!;
  assert.deepEqual(validate.handler({ spec: { kind: "x", name: "" } }), {
    ok: false,
    errors: [{ detail: "spec.name must be non-empty when provided" }],
    warnings: [],
  });
});

test("validate routes inline warning-level form validators into warnings", () => {
  const warningProfile: Profile = {
    ...profile,
    layers: profile.layers.map((layer) => layer.id !== "spec"
      ? layer
      : {
          ...layer,
          input: {
            ...(layer.input as Record<string, unknown>),
            validators: [{ kind: "jsonata", expr: "$exists(name)", message: "name should be provided", level: "warning", code: "missing-name", node: "spec" }],
          },
        }),
  };
  const validate = toolsFromProfile(warningProfile, registry).find((t) => t.name === "validateSpec")!;
  assert.deepEqual(validate.handler({ spec: { kind: "x" } }), {
    ok: true,
    errors: [],
    warnings: [
      { code: "missing-name", node: "spec", detail: "name should be provided" },
      { code: "empty-name", detail: "spec.name is empty" },
    ],
  });
});

test("project binds to the registry projector", () => {
  const project = toolsFromProfile(profile, registry).find((t) => t.name === "projectView")!;
  assert.deepEqual(project.handler({ input: { kind: "card" } }), { view: "card" });
});

test("project can also run from a declarative expression", async () => {
  const project = toolsFromProfile(profile, registry).find((t) => t.name === "projectExpr")!;
  assert.deepEqual(await project.handler({ input: { kind: "card", name: "Inbox" } }), { view: "card", name: "Inbox" });
});

test("fails fast when a declaration references a missing registry entry", () => {
  const bad: Profile = {
    ...profile,
    authoring: { tools: [{ id: "oops", op: "project", projector: "missing" }] },
  };
  assert.throws(() => toolsFromProfile(bad, registry), /no registry.projectors entry for 'missing'/);
});

test("fails fast when a validate declaration references an unknown layer", () => {
  const bad: Profile = {
    ...profile,
    authoring: { tools: [{ id: "oops", op: "validate", layer: "ghost" }] },
  };
  assert.throws(() => toolsFromProfile(bad, registry), /references unknown layer 'ghost'/);
});
