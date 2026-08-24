import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

import {
  BLUEPRINT_USE_SCHEMAS,
  BLUEPRINT_AUTHORING_GUIDANCE_RESOURCE_URL,
  agentHostLifecycleTools,
  agentLifecycleTools,
  authorBlueprint,
  blueprintUseFunctionTools,
  createSimpleChatAgentTemplate,
  toCopilotAgentMarkdown,
  toFoundryPromptDefinition,
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

test("exports package-owned Blueprint authoring guidance", () => {
  const guidance = readFileSync(new URL(BLUEPRINT_AUTHORING_GUIDANCE_RESOURCE_URL), "utf8");

  assert.match(guidance, /^# Blueprint Authoring Playbook/m);
  assert.match(guidance, /## Blueprint mechanics/);
  assert.match(guidance, /## Authoring loop/);
  assert.match(guidance, /"slots"/);
  assert.match(guidance, /\*\*SECTIONS ≠ COMPONENTS\*\*/);
  assert.match(guidance, /\*\*VOCABULARY ≠ CHECKLIST\*\*/);
  assert.match(guidance, /\*\*KISS\*\*/);
  assert.match(guidance, /\*\*CLOSED WORLD\*\*/);
  // TODO: revisit this budget -- it was raised from 7_000 to 30_000 to unblock the
  // sources/services and potentialViews model rewrites, then to 31_000 for the
  // headless-hosting correction, then to 32_000 for the nested-composition gap
  // clarification, then to 33_000 for the wrap mechanism closing that gap, then to
  // 36_000 for the service/projection lowering-axis split and closed projection vocabularies;
  // the doc should be re-tightened before growing further.
  assert.ok(guidance.length < 36_000, `Guidance grew to ${guidance.length} characters`);
});

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
      read_in_progress_proposal: operation("Read in-progress proposal"),
      set_in_progress_proposal: operation("Set proposal"),
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
    read_in_progress_proposal: (input) => ({ operation: "read_in_progress_proposal", input }),
    set_in_progress_proposal: (input) => ({ operation: "set_in_progress_proposal", input }),
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

test("agent lifecycle profiles generate the standard proposal workspace tool family", async () => {
  const tools = agentLifecycleTools("use_blueprint", lifecycle("use-blueprint"));
  assert.deepEqual(tools.map(({ name }) => name), [
    "use_blueprint_manifest",
    "use_blueprint_discover",
    "use_blueprint_describe",
    "use_blueprint_inspect",
    "use_blueprint_validate",
    "use_blueprint_simulate",
    "use_blueprint_preflight",
    "use_blueprint_read_in_progress_proposal",
    "use_blueprint_set_in_progress_proposal",
  ]);
  assert.equal(tools.every(({ lifecycle: kind }) => kind === "agent"), true);
  assert.equal((await tools[8].handler({ event: "press" }) as { operation: string }).operation, "set_in_progress_proposal");
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
    assert.deepEqual(sizes, [9, 18, 27, 33, 34]);
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
    assert.equal(catalog.project("cbx").tools[9].name, "customize_blueprint_manifest");
    assert.equal(catalog.project("abx").tools[18].name, "author_blueprint_manifest");
    assert.equal(catalog.project("hbx").tools[27].name, "host_blueprint_receive");
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
            operationPreset: "standard" as const,
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
        operationPreset: "standard" as const,
        constraints: ["Preserve source facts."],
      } } },
      serviceTiers: [{ id: "runtime", kind: "runtime-document" }],
      projectionTiers: [{ id: "runtime", kind: "runtime-document" , capabilities: []}],
      cells: { improve: { id: "improve", kind: "command" } },
      services: { refinement: {} },
      runtime: {},
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
    read_in_progress_proposal: () => undefined,
    set_in_progress_proposal: () => { calls.push("set_in_progress_proposal"); return { id: "proposal-1" }; },
  };
  const ops = createBlueprintUseLifecycle({ blueprint, schemas, host });
  const description = await ops.describe!({}) as { identity: { id: string }; lifecycle: { constraints: string[] } };
  assert.equal(description.identity.id, "incident-report-explorer-1a");
  assert.deepEqual(description.lifecycle.constraints, ["Preserve source facts."]);

  const tools = useBlueprint({ blueprint, schemas, host });
  await tools.find(({ name }) => name === "use_blueprint_set_in_progress_proposal")!.handler({ event: "press" });
  assert.deepEqual(calls, ["set_in_progress_proposal"]);
});

test("customizeBlueprint and authorBlueprint bind manifests from their meta-Blueprints", () => {
  const manifest = (id: string) => ({
    id,
    version: "1.0.0",
    description: `${id} meta-Blueprint.`,
    targetKinds: ["blueprint-candidate"],
    intentKinds: ["blueprint-patch"],
    operationPreset: "standard" as const,
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
    read_in_progress_proposal: () => undefined,
    set_in_progress_proposal: () => ({ id: "proposal" }),
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
        operationPreset: "standard" as const,
      } } },
    },
  });
  assert.equal(definitions.length, 9);
  assert.equal(definitions[0].name, "use_blueprint_manifest");
  assert.equal(definitions.every(({ type, strict }) => type === "function" && strict), true);
  assert.deepEqual(definitions.find(({ name }) => name === "use_blueprint_set_in_progress_proposal")?.parameters,
    BLUEPRINT_USE_SCHEMAS.intent);
});

test("one agent provisioning template lowers to Foundry and Copilot surfaces", () => {
  const template = {
    id: "sample-agent",
    description: "Grounded sample agent.",
    instructions: ["Use supplied facts only.", "Return a concise answer."],
    reasoning: { effort: "none" },
    tools: [{
      type: "function" as const,
      name: "inspect_sample",
      description: "Inspect the sample.",
      parameters: objectSchema,
      strict: true as const,
    }],
    responseFormat: {
      type: "json_schema" as const,
      name: "sample_response",
      strict: true,
      schema: objectSchema,
    },
    executionAuthority: "host" as const,
  };

  assert.deepEqual(toFoundryPromptDefinition(template, "gpt-test"), {
    kind: "prompt",
    model: "gpt-test",
    reasoning: { effort: "none" },
    instructions: "Use supplied facts only. Return a concise answer.",
    tools: template.tools,
    text: { format: template.responseFormat },
  });
  const markdown = toCopilotAgentMarkdown(template, { model: "gpt-test" });
  assert.match(markdown, /name: sample-agent/);
  assert.match(markdown, /  - inspect_sample/);
  assert.match(markdown, /host runtime validates and executes every tool call/);
  assert.match(markdown, /"type": "object"/);
});

test("simple chat template keeps one identity and host authority across providers", () => {
  const template = createSimpleChatAgentTemplate({ workspaceName: "sample-workspace" });
  assert.equal(template.id, "simple-chat");
  assert.equal(template.executionAuthority, "host");
  assert.match(toFoundryPromptDefinition(template, "gpt-test").instructions, /sample-workspace/);
  assert.match(toCopilotAgentMarkdown(template, { model: "gpt-test" }), /name: simple-chat/);
});

test("agent lifecycle profiles generate only declared operations", () => {
  const manifest = capabilityManifest("static-authoring");
  const ops: AgentLifecycleOps = {
    manifest: () => ({
      ...manifest,
      operations: {
        describe: manifest.operations.describe,
        validate: manifest.operations.validate,
        simulate: manifest.operations.simulate,
        read_in_progress_proposal: manifest.operations.read_in_progress_proposal,
        set_in_progress_proposal: manifest.operations.set_in_progress_proposal,
      },
    }),
    describe: (input) => input,
    validate: (input) => input,
    simulate: (input) => input,
    read_in_progress_proposal: (input) => input,
    set_in_progress_proposal: (input) => input,
  };
  assert.deepEqual(agentLifecycleTools("author_blueprint", ops).map(({ name }) => name), [
    "author_blueprint_manifest",
    "author_blueprint_describe",
    "author_blueprint_validate",
    "author_blueprint_simulate",
    "author_blueprint_read_in_progress_proposal",
    "author_blueprint_set_in_progress_proposal",
  ]);
  assert.throws(
    () => agentLifecycleTools("author_blueprint", { ...ops, validate: undefined }),
    /declares 'validate' without a handler/,
  );
});

test("Blueprint profiles require and resolve explicit operation selections", () => {
  const profile = (id: string, selection:
    | { operationPreset: "static-authoring" }
    | { operations: readonly ["describe", "validate"] }) => ({
    id,
    version: "1.0.0",
    description: `${id} profile.`,
    targetKinds: ["blueprint-candidate"],
    intentKinds: ["blueprint"],
    ...selection,
  });
  const blueprint = {
    payload: {
      id: "blueprint-authoring",
      kind: "blueprint-meta-graph",
      version: "1.0.0",
      agentLifecycle: { profiles: {
        author: profile("author-blueprint", { operationPreset: "static-authoring" as const }),
        customize: profile("customize-blueprint", { operations: ["describe", "validate"] as const }),
      } },
      runtime: {},
    },
  };
  const schemas = { discover: objectSchema, target: objectSchema, intent: objectSchema, proposal: objectSchema };
  const staticTools = authorBlueprint({
    blueprint,
    schemas,
    host: {
      validate: () => ({}),
      simulate: () => ({}),
      read_in_progress_proposal: () => undefined,
      set_in_progress_proposal: () => ({}),
    },
  });
  assert.deepEqual(staticTools.map(({ name }) => name), [
    "author_blueprint_manifest",
    "author_blueprint_describe",
    "author_blueprint_validate",
    "author_blueprint_simulate",
    "author_blueprint_read_in_progress_proposal",
    "author_blueprint_set_in_progress_proposal",
  ]);
  assert.deepEqual(customizeBlueprint({ blueprint, schemas, host: { validate: () => ({}) } }).map(({ name }) => name), [
    "customize_blueprint_manifest",
    "customize_blueprint_describe",
    "customize_blueprint_validate",
  ]);
  const missingSelection = {
    ...blueprint,
    payload: {
      ...blueprint.payload,
      agentLifecycle: { profiles: { author: {
        id: "invalid-author",
        version: "1.0.0",
        description: "Invalid omitted selection.",
        targetKinds: ["blueprint-candidate"],
        intentKinds: ["blueprint"],
      } } },
    },
  };
  assert.throws(
    () => authorBlueprint({ blueprint: missingSelection as never, schemas, host: {} }),
    /must declare operationPreset or operations/,
  );
});