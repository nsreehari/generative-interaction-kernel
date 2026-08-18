import type { ComponentEventContract } from "./definition";

export interface AgentFacingCapabilitySelection {
  for: readonly string[];
  notFor?: readonly string[];
  interaction?: string;
}

export interface AgentFacingCapabilityDetail {
  dataProps?: Readonly<Record<string, unknown>>;
  props?: Readonly<Record<string, unknown>>;
  variants?: Readonly<Record<string, {
    summary: string;
    useWhen: readonly string[];
    default?: true;
  }>>;
  slots?: readonly string[];
  emits?: Readonly<Record<string, ComponentEventContract>>;
  constraints?: readonly string[];
  notes?: readonly string[];
  example?: Readonly<Record<string, unknown>>;
}

export interface AgentFacingCapabilityCatalog {
  catalog: Readonly<Record<string, AgentFacingCapabilitySelection>>;
  details: Readonly<Record<string, AgentFacingCapabilityDetail>>;
}

export function mergeAgentFacingCapabilityCatalogs(
  ...catalogs: readonly AgentFacingCapabilityCatalog[]
): AgentFacingCapabilityCatalog {
  const catalog: Record<string, AgentFacingCapabilitySelection> = {};
  const details: Record<string, AgentFacingCapabilityDetail> = {};
  for (const source of catalogs) {
    for (const [id, entry] of Object.entries(source.catalog)) {
      if (catalog[id] || details[id]) throw new Error(`Duplicate agent-facing capability '${id}'`);
      catalog[id] = entry;
      const detail = source.details[id];
      if (!detail) throw new Error(`Agent-facing capability '${id}' has no detail contract`);
      details[id] = detail;
    }
    for (const id of Object.keys(source.details)) {
      if (!source.catalog[id]) throw new Error(`Agent-facing capability detail '${id}' has no catalog entry`);
    }
  }
  return { catalog, details };
}
