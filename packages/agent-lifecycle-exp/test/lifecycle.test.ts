import assert from "node:assert/strict";
import { test } from "vitest";

import {
  BLUEPRINT_USE_SCHEMAS,
  agentHostLifecycleTools,
  agentLifecycleTools,
  authorBlueprint,
  blueprintUseFunctionTools,
  blueprintLifecycleCatalog,
  controlTool,
  createBlueprintUseLifecycle,
  customizeBlueprint,
  createBlueprintExperienceCatalog,
  defineBlueprintLifecycleProfile,
  executeAgentFunctionCall,
  useBlueprint,
  toAgentFunctionTools,
  type AgentCapabilityManifest,
  type AgentHostLifecycleManifest,
  type AgentHostLifecycleOps,
  type AgentLifecycleOps,
} from "../src/index";

const objectSchema = { type: "object", additionalProperties: true } as const;

function capabilityManifest(id: string): AgentCapabilityManifest {
  const operation = (name: string) => ({ description: `${name} ${id}.`, inputSchema: objectSchema });
  return {
    id,
    version: "1.0.0",
    description: `${id} lifecycle`,
    targetKinds: ["blueprint"],
    intentKinds: ["proposal"],
    proposalSchema: objectSchema,
    operations: {
      discover: operation("Discover"),
      describe: operation("Describe"),
      inspect: operation("Inspect"),
      validate: operation("Validate"),
      simulate: operation("Simulate"),
      preflight: operation("Preflight"),
      propose: operation("Propose"),
    },
  };
}

function lifecycle(id: string): AgentLifecycleOps {
  return {
    manifest: () => capabilityManifest(id),
    discover: (input) => ({ operation: "discover", input }),
    describe: (input) => ({ operation: "describe", input }),
    inspect: (input) => ({ operation: "inspect", input }),
    validate: (input) => ({ operation: "validate", input }),
    simulate: (input) => ({ operation: "simulate", input }),
    preflight: (input) => ({ operation: "preflight", input }),
    propose: (input) => ({ operation: "propose", input }),
  };
}

function hostLifecycle(): AgentHostLifecycleOps {
  const operation = (name: string) => ({ description: `${name} proposal.`, inputSchema: objectSchema });
  const manifest: AgentHostLifecycleManifest = {
    id: "host-blueprint",
    version: "1.0.0",
    description: "Trusted Blueprint host lifecycle.",
    operations: {
      receive: operation("Receive"),
      authorize: operation("Authorize"),
      admit: operation("Admit"),
      apply: operation("Apply"),
      reject: operation("Reject"),
      status: operation("Inspect status of"),
    },
  };
  return {
    manifest: () => manifest,
    receive: (input) => ({ operation: "receive", input }),
    authorize: (input) => ({ operation: "authorize", input }),
    admit: (input) => ({ operation: "admit", input }),
    apply: (input) => ({ operation: "apply", input }),
    reject: (input) => ({ operation: "reject", input }),
    status: (input) => ({ operation: "status", input }),
  };
}

test("agent lifecycle profiles generate the standard manifest-to-propose tool family", async () => {
  const tools = agentLifecycleTools("use_blueprint", lifecycle("use-blueprint"));
  assert.deepEqual(tools.map(({ name }) => name), [
    "use_blueprint_manifest",
    "use_blueprint_discover",
    "use_blueprint_describe",
    "use_blueprint_inspect",
    "use_blueprint_validate",
    "use_blueprint_simulate",
    "use_blueprint_preflight",
    "use_blueprint_propose",
  ]);
  assert.equal(tools.every(({ lifecycle: kind }) => kind === "agent"), true);
  assert.equal((await tools[7].handler({ event: "press" }) as { operation: string }).operation, "propose");
});

test("host lifecycle profiles generate trusted receipt-to-application tools", () => {
  const tools = agentHostLifecycleTools("host_blueprint", hostLifecycle());
  assert.deepEqual(tools.map(({ name }) => name), [
    "host_blueprint_receive",
    "host_blueprint_authorize",
    "host_blueprint_admit",
    "host_blueprint_apply",
    "host_blueprint_reject",
    "host_blueprint_status",
  ]);
  assert.equal(tools.every(({ lifecycle: kind }) => kind === "host"), true);
});

test("UBX, CBX, ABX, HBX, and control are literal cumulative catalog projections", () => {
  const catalog = createBlueprintExperienceCatalog({
    ubx: agentLifecycleTools("use_blueprint", lifecycle("use-blueprint")),
    cbx: agentLifecycleTools("customize_blueprint", lifecycle("customize-blueprint")),
    abx: agentLifecycleTools("author_blueprint", lifecycle("author-blueprint")),
    hbx: agentHostLifecycleTools("host_blueprint", hostLifecycle()),
    control: [controlTool({
      name: "control_runtime_checkpoint",
      description: "Checkpoint the containing runtime.",
      inputSchema: objectSchema,
      handler: () => ({ ok: true }),
    })],
  });

  const sizes = (["ubx", "cbx", "abx", "hbx", "control"] as const)
    .map((level) => catalog.project(level).tools.length);
  assert.deepEqual(sizes, [8, 16, 24, 30, 31]);
  assert.equal(catalog.project("ubx").tools.every(({ lifecycle: kind }) => kind === "agent"), true);
  assert.equal(catalog.project("hbx").tools.some(({ name }) => name === "host_blueprint_apply"), true);
  assert.equal(catalog.project("abx").tools.some(({ name }) => name === "host_blueprint_apply"), false);
  assert.equal(catalog.project("control").tools.some(({ name }) => name === "control_runtime_checkpoint"), true);
});

test("tool generation rejects ambiguous prefixes and catalogs reject duplicate names", () => {
  assert.throws(() => agentLifecycleTools("UseBlueprint", lifecycle("invalid")), /lower snake case/);
  assert.throws(() => createBlueprintExperienceCatalog({
    ubx: agentLifecycleTools("use_blueprint", lifecycle("one")),
    cbx: agentLifecycleTools("use_blueprint", lifecycle("two")),
  }), /Duplicate agent lifecycle tool/);
});

test("Blueprint lifecycle composition translates ops into conventional cumulative tool names", () => {
  const catalog = blueprintLifecycleCatalog({
    use: lifecycle("use-blueprint"),
    customize: lifecycle("customize-blueprint"),
    author: lifecycle("author-blueprint"),
    host: hostLifecycle(),
  });

  assert.equal(catalog.project("ubx").tools[0].name, "use_blueprint_manifest");
  assert.equal(catalog.project("cbx").tools[8].name, "customize_blueprint_manifest");
  assert.equal(catalog.project("abx").tools[16].name, "author_blueprint_manifest");
  assert.equal(catalog.project("hbx").tools[24].name, "host_blueprint_receive");
});

test("Blueprint profile binding requires authored material and matching implementation identity", () => {
  const blueprint = {
    payload: {
      agentLifecycle: {
        profiles: {
          use: {
            id: "use-blueprint",
            version: "1.0.0",
            description: "Use this Blueprint through its declared runtime contract.",
            targetKinds: ["blueprint-instance"],
            intentKinds: ["declared-event"],
          },
        },
      },
    },
  };
  const profile = defineBlueprintLifecycleProfile(blueprint, "use", "use_blueprint", lifecycle("use-blueprint"));
  assert.equal(profile.manifest.description, "Use this Blueprint through its declared runtime contract.");
  assert.deepEqual(profile.manifest.targetKinds, ["blueprint-instance"]);
  assert.throws(
    () => defineBlueprintLifecycleProfile(blueprint, "author", "author_blueprint", lifecycle("author-blueprint")),
    /does not declare 'author'/,
  );
  assert.throws(
    () => defineBlueprintLifecycleProfile(blueprint, "use", "use_blueprint", lifecycle("wrong-profile")),
    /does not match implementation/,
  );
});

test("useBlueprint derives authored description and delegates live lifecycle operations to its host", async () => {
  const calls: string[] = [];
  const blueprint = {
    payload: {
      id: "incident-report-explorer-1a",
      kind: "incident-report-semantic-blueprint",
      version: "1.0.0",
      structureMode: "fixed",
      agentLifecycle: { profiles: { use: {
        id: "use-blueprint",
        version: "1.0.0",
        description: "Use the incident report explorer.",
        targetKinds: ["blueprint-instance"],
        intentKinds: ["declared-event"],
        constraints: ["Preserve source facts."],
      } } },
      tiers: [{ id: "runtime", kind: "runtime-document" }],
      cells: { improve: { id: "improve", kind: "command" } },
      services: { refinement: {} },
      runtime: { actions: ["invoke"], capabilities: { "fluent:button": {} }, namespaces: ["incident1a"] },
    },
  };
  const schemas = {
    discover: objectSchema,
    target: objectSchema,
    intent: objectSchema,
    proposal: objectSchema,
  };
  const host = {
    discover: (input: unknown) => ({ input }),
    inspect: (input: unknown) => ({ input }),
    validate: () => ({ ok: true }),
    simulate: () => ({ state: "simulated" }),
    preflight: () => ({ ready: true }),
    propose: () => { calls.push("propose"); return { id: "proposal-1" }; },
  };
  const ops = createBlueprintUseLifecycle({ blueprint, schemas, host });
  const description = await ops.describe({}) as { identity: { id: string }; lifecycle: { constraints: string[] } };
  assert.equal(description.identity.id, "incident-report-explorer-1a");
  assert.deepEqual(description.lifecycle.constraints, ["Preserve source facts."]);

  const tools = useBlueprint({ blueprint, schemas, host });
  await tools.find(({ name }) => name === "use_blueprint_propose")!.handler({ event: "press" });
  assert.deepEqual(calls, ["propose"]);
});

test("customizeBlueprint and authorBlueprint bind manifests from their meta-Blueprints", () => {
  const manifest = (id: string) => ({
    id,
    version: "1.0.0",
    description: `${id} meta-Blueprint.`,
    targetKinds: ["blueprint-candidate"],
    intentKinds: ["blueprint-patch"],
  });
  const metaBlueprint = {
    payload: {
      id: "blueprint-meta",
      kind: "blueprint-meta-graph",
      version: "1.0.0",
      agentLifecycle: { profiles: {
        customize: manifest("customize-blueprint"),
        author: manifest("author-blueprint"),
      } },
      runtime: {},
    },
  };
  const schemas = { discover: objectSchema, target: objectSchema, intent: objectSchema, proposal: objectSchema };
  const host = {
    discover: () => [],
    inspect: () => ({}),
    validate: () => ({ ok: true }),
    simulate: () => ({}),
    preflight: () => ({ ready: true }),
    propose: () => ({ id: "proposal" }),
  };

  assert.equal(customizeBlueprint({ blueprint: metaBlueprint, schemas, host })[0].name, "customize_blueprint_manifest");
  assert.equal(authorBlueprint({ blueprint: metaBlueprint, schemas, host })[0].name, "author_blueprint_manifest");
});

test("generated lifecycle tools project to strict function tools and execute through one catalog", async () => {
  const tools = agentLifecycleTools("use_blueprint", lifecycle("use-blueprint"));
  const definitions = toAgentFunctionTools(tools);
  assert.deepEqual(definitions[0], {
    type: "function",
    name: "use_blueprint_manifest",
    description: "Return the machine-readable use-blueprint capability manifest.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  });
  assert.deepEqual(await executeAgentFunctionCall(tools, {
    callId: "call-1",
    name: "use_blueprint_validate",
    arguments: JSON.stringify({ event: "press" }),
  }), {
    type: "function_call_output",
    call_id: "call-1",
    output: JSON.stringify({ operation: "validate", input: { event: "press" } }),
  });
  await assert.rejects(
    executeAgentFunctionCall(tools, { callId: "call-2", name: "unknown", arguments: "{}" }),
    /Unknown agent lifecycle function/,
  );
  const hostTools = agentHostLifecycleTools("host_blueprint", hostLifecycle());
  assert.throws(() => toAgentFunctionTools(hostTools), /cannot execute with agent authority/);
  await assert.rejects(
    executeAgentFunctionCall(hostTools, { callId: "call-3", name: "host_blueprint_apply", arguments: "{}" }),
    /cannot execute with agent authority/,
  );
});

test("Blueprint use material projects to provisionable strict function metadata", () => {
  const definitions = blueprintUseFunctionTools({
    payload: {
      id: "sample-blueprint",
      kind: "sample",
      version: "1.0.0",
      agentLifecycle: { profiles: { use: {
        id: "use-blueprint",
        version: "1.0.0",
        description: "Use the sample Blueprint.",
        targetKinds: ["blueprint-instance"],
        intentKinds: ["run"],
      } } },
    },
  });
  assert.equal(definitions.length, 8);
  assert.equal(definitions[0].name, "use_blueprint_manifest");
  assert.equal(definitions.every(({ type, strict }) => type === "function" && strict), true);
  assert.deepEqual(definitions.find(({ name }) => name === "use_blueprint_propose")?.parameters,
    BLUEPRINT_USE_SCHEMAS.intent);
});