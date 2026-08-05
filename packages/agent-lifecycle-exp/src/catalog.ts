import { defineAgentHostLifecycleProfile, defineAgentLifecycleProfile } from "./tools";
import type { AgentHostLifecycleOps, AgentLifecycleOps, AgentTool } from "./types";

export const BLUEPRINT_EXPERIENCE_LEVELS = ["ubx", "cbx", "abx", "hbx", "control"] as const;
export type BlueprintExperienceLevel = typeof BLUEPRINT_EXPERIENCE_LEVELS[number];

export type BlueprintExperienceTools = Readonly<Partial<Record<BlueprintExperienceLevel, readonly AgentTool[]>>>;

export interface AgentToolCatalog {
  readonly tools: readonly AgentTool[];
  listTools(): Array<Pick<AgentTool, "name" | "description" | "inputSchema">>;
  callTool(name: string, args?: unknown): unknown | Promise<unknown>;
}

export interface BlueprintExperienceCatalog {
  project(level: BlueprintExperienceLevel): AgentToolCatalog;
}

export interface BlueprintLifecycleOps {
  readonly use: AgentLifecycleOps;
  readonly customize?: AgentLifecycleOps;
  readonly author?: AgentLifecycleOps;
  readonly host?: AgentHostLifecycleOps;
  readonly control?: readonly AgentTool[];
}

export function createAgentToolCatalog(tools: readonly AgentTool[]): AgentToolCatalog {
  const byName = new Map<string, AgentTool>();
  for (const tool of tools) {
    if (byName.has(tool.name)) throw new Error(`Duplicate agent lifecycle tool '${tool.name}'`);
    byName.set(tool.name, tool);
  }
  const catalog = [...tools];
  return {
    tools: catalog,
    listTools: () => catalog.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    callTool: (name, args = {}) => {
      const tool = byName.get(name);
      if (!tool) throw new Error(`Unknown agent lifecycle tool '${name}'`);
      return tool.handler(args);
    },
  };
}

export function createBlueprintExperienceCatalog(levels: BlueprintExperienceTools): BlueprintExperienceCatalog {
  const cumulative = new Map<BlueprintExperienceLevel, AgentToolCatalog>();
  const tools: AgentTool[] = [];
  for (const level of BLUEPRINT_EXPERIENCE_LEVELS) {
    tools.push(...(levels[level] ?? []));
    cumulative.set(level, createAgentToolCatalog(tools));
  }
  return { project: (level) => cumulative.get(level)! };
}

export function blueprintLifecycleCatalog(ops: BlueprintLifecycleOps): BlueprintExperienceCatalog {
  return createBlueprintExperienceCatalog({
    ubx: defineAgentLifecycleProfile("use_blueprint", ops.use).tools,
    ...(ops.customize
      ? { cbx: defineAgentLifecycleProfile("customize_blueprint", ops.customize).tools }
      : {}),
    ...(ops.author
      ? { abx: defineAgentLifecycleProfile("author_blueprint", ops.author).tools }
      : {}),
    ...(ops.host
      ? { hbx: defineAgentHostLifecycleProfile("host_blueprint", ops.host).tools }
      : {}),
    ...(ops.control ? { control: ops.control } : {}),
  });
}