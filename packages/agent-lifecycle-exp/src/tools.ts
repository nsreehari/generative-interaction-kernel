import {
  AGENT_HOST_LIFECYCLE_OPERATIONS,
  AGENT_LIFECYCLE_OPERATIONS,
  type AgentHostLifecycleOps,
  type AgentHostLifecycleProfile,
  type AgentLifecycleOperation,
  type AgentLifecycleOps,
  type AgentLifecycleProfile,
  type AgentTool,
  type AuthoredLifecycleProfileMaterial,
  type BlueprintLifecycleMaterialSource,
  type BlueprintLifecycleProfileKind,
} from "./types";

const emptyInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

function assertPrefix(prefix: string): void {
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(prefix)) {
    throw new Error(`Agent lifecycle tool prefix '${prefix}' must be lower snake case`);
  }
}

export function agentLifecycleTools(prefix: string, ops: AgentLifecycleOps): AgentTool[] {
  assertPrefix(prefix);
  const manifest = ops.manifest();
  return AGENT_LIFECYCLE_OPERATIONS.map((operation) => {
    if (operation === "manifest") {
      return {
        name: `${prefix}_manifest`,
        description: `Return the machine-readable ${manifest.id} capability manifest.`,
        inputSchema: emptyInputSchema,
        lifecycle: "agent" as const,
        handler: () => ops.manifest(),
      };
    }
    const definition = manifest.operations[operation];
    if (!definition) throw new Error(`Capability '${manifest.id}' does not define '${operation}'`);
    return {
      name: `${prefix}_${operation}`,
      description: definition.description,
      inputSchema: definition.inputSchema,
      lifecycle: "agent" as const,
      handler: (input: unknown) => ops[operation](input as never),
    };
  });
}

export function agentHostLifecycleTools(prefix: string, ops: AgentHostLifecycleOps): AgentTool[] {
  assertPrefix(prefix);
  const manifest = ops.manifest();
  return AGENT_HOST_LIFECYCLE_OPERATIONS.map((operation) => {
    const definition = manifest.operations[operation];
    if (!definition) throw new Error(`Host capability '${manifest.id}' does not define '${operation}'`);
    return {
      name: `${prefix}_${operation}`,
      description: definition.description,
      inputSchema: definition.inputSchema,
      lifecycle: "host" as const,
      handler: (input: unknown) => ops[operation](input as never),
    };
  });
}

export function controlTool<TResult>(tool: Omit<AgentTool<TResult>, "lifecycle">): AgentTool<TResult> {
  return { ...tool, lifecycle: "control" };
}

export function isAgentLifecycleOperation(value: string): value is AgentLifecycleOperation {
  return (AGENT_LIFECYCLE_OPERATIONS as readonly string[]).includes(value);
}

export function defineAgentLifecycleProfile(prefix: string, ops: AgentLifecycleOps): AgentLifecycleProfile {
  const manifest = ops.manifest();
  return {
    id: manifest.id,
    prefix,
    manifest,
    tools: agentLifecycleTools(prefix, ops),
  };
}

export function defineAgentHostLifecycleProfile(
  prefix: string,
  ops: AgentHostLifecycleOps,
): AgentHostLifecycleProfile {
  const manifest = ops.manifest();
  return {
    id: manifest.id,
    prefix,
    manifest,
    tools: agentHostLifecycleTools(prefix, ops),
  };
}

export function requireBlueprintLifecycleMaterial(
  blueprint: BlueprintLifecycleMaterialSource,
  profile: BlueprintLifecycleProfileKind,
): AuthoredLifecycleProfileMaterial {
  const material = blueprint.payload.agentLifecycle?.profiles?.[profile];
  if (!material) throw new Error(`Blueprint does not declare '${profile}' agent lifecycle material`);
  return material;
}

export function defineBlueprintLifecycleProfile(
  blueprint: BlueprintLifecycleMaterialSource,
  profile: BlueprintLifecycleProfileKind,
  prefix: string,
  ops: AgentLifecycleOps,
): AgentLifecycleProfile {
  const authored = requireBlueprintLifecycleMaterial(blueprint, profile);
  const implementation = ops.manifest();
  if (authored.id !== implementation.id || authored.version !== implementation.version) {
    throw new Error(
      `Blueprint '${profile}' lifecycle '${authored.id}@${authored.version}' does not match implementation '${implementation.id}@${implementation.version}'`,
    );
  }
  return defineAgentLifecycleProfile(prefix, {
    ...ops,
    manifest: () => ({
      ...implementation,
      description: authored.description,
      targetKinds: authored.targetKinds,
      intentKinds: authored.intentKinds,
    }),
  });
}